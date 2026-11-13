-- Ranks at scale (optimization review round 2, owner go-ahead 2026-11-13). Nothing a player has is changed.
--
-- 1. Rival matching. rank_my_duel used to take one lock for everybody and, for each unpaired player, look at every
--    player active in 14 days, working out each one's 14-day average on the spot; an unpaired player asked again
--    every 12 s. Now:
--      * each player's 14-day average is kept with the player (`avg14`, refreshed once a day by the pairing job);
--      * `rank_pair_duels()` pairs every active player without a rival in one sorted pass (clock within 2 hours,
--        then league tier, then average), every 5 minutes by pg_cron, so most players already have a rival when
--        they look;
--      * someone still without one waits in `rank_duel_wait`: a second waiter is their rival at once, and the
--        wider look over all active players is done at most once every 5 minutes per waiter.
--    All pairing still happens under one lock per week, but it is now short (no averages worked out per candidate).
-- 2. `rank_pulse(d)`: one small answer that changes whenever anything on the league screen would change (the league's
--    scores, names, looks; my place, prizes, quest). Ranks asks for it while open and loads the league and status only
--    when it changed, instead of both every 8 s.
-- 3. The Hall of fame is worked out once every 10 minutes (`rank_hall_cache`); faces are still the viewer's own.

alter table public.rank_players add column if not exists avg14 numeric;
alter table public.rank_players add column if not exists avg_day date;
create index if not exists rank_players_last_report on public.rank_players (last_report);

create table if not exists public.rank_duel_wait (
  week date not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  since timestamptz not null default now(),
  tried_at timestamptz,
  primary key (week, user_id)
);
alter table public.rank_duel_wait enable row level security;
revoke all on table public.rank_duel_wait from public, anon, authenticated;

-- A player's average day over the 14 days before d.
create or replace function public.rank_avg14(who uuid, d date) returns numeric
language sql stable set search_path = '' as $$
  select coalesce(avg(score), 0) from public.rank_days where user_id = who and day between d - 14 and d - 1;
$$;
revoke all on function public.rank_avg14(uuid, date) from public, anon, authenticated;

-- Pairs `me` with the best free player. `wide` = look over every active player (else only the others waiting).
-- The caller holds the week's pairing lock.
create or replace function public.rank_pair_one(me uuid, wk date, d date, wide boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  p public.rank_players;
  mine numeric := public.rank_avg14(me, d);
  them uuid;
begin
  select * into p from public.rank_players where user_id = me;
  select o.user_id into them from public.rank_duel_wait w join public.rank_players o on o.user_id = w.user_id
    where w.week = wk and w.user_id <> me
      and not exists (select 1 from public.rank_duels z where z.week = wk and (z.a = o.user_id or z.b = o.user_id))
    order by case when p.utc_off is null or o.utc_off is null or abs(o.utc_off - p.utc_off) <= 120 then 0 else 1 end,
      abs(o.tier - p.tier), abs(coalesce(o.avg14, 0) - mine), o.user_id
    limit 1;
  if them is null and wide then
    select o.user_id into them from public.rank_players o
      where o.user_id <> me and o.last_report > now() - interval '14 days'
        and not exists (select 1 from public.rank_duels z where z.week = wk and (z.a = o.user_id or z.b = o.user_id))
      order by case when p.utc_off is null or o.utc_off is null or abs(o.utc_off - p.utc_off) <= 120 then 0 else 1 end,
        abs(o.tier - p.tier), abs(coalesce(o.avg14, 0) - mine), o.user_id
      limit 1;
  end if;
  if them is null then return null; end if;
  insert into public.rank_duels (week, a, b) values (wk, me, them);
  update public.rank_players set duels = true where user_id in (me, them) and not duels;
  delete from public.rank_duel_wait where week = wk and user_id in (me, them);
  return them;
end $$;
revoke all on function public.rank_pair_one(uuid, date, date, boolean) from public, anon, authenticated;

-- The pairing job: every active player without a rival this week (and next, once it has begun somewhere) is paired in
-- one sorted pass. Averages are refreshed first, once a day per player.
create or replace function public.rank_pair_duels() returns int
language plpgsql security definer set search_path = '' as $$
declare
  wk date;
  n int := 0;
  k int;
begin
  update public.rank_players p set avg14 = public.rank_avg14(p.user_id, current_date), avg_day = current_date
    where p.last_report > now() - interval '14 days' and p.avg_day is distinct from current_date;
  for wk in select distinct public.rank_week(x) from unnest(array[current_date, current_date + 1]) x loop
    perform pg_advisory_xact_lock(hashtext('rank_duel:' || wk::text));
    with c as (
      select o.user_id, row_number() over (
          order by round(coalesce(o.utc_off, 0) / 120.0), o.tier, coalesce(o.avg14, 0), o.user_id) as rn
        from public.rank_players o
        where o.last_report > now() - interval '14 days'
          and not exists (select 1 from public.rank_duels z where z.week = wk and (z.a = o.user_id or z.b = o.user_id))),
    pairs as (
      insert into public.rank_duels (week, a, b)
        select wk, x.user_id, y.user_id from c x join c y on y.rn = x.rn + 1 where x.rn % 2 = 1
        returning a, b)
    select count(*) into k from pairs;
    n := n + k;
    update public.rank_players set duels = true
      where not duels and user_id in (select a from public.rank_duels where week = wk union all select b from public.rank_duels where week = wk);
    delete from public.rank_duel_wait w where w.week = wk
      and exists (select 1 from public.rank_duels z where z.week = wk and (z.a = w.user_id or z.b = w.user_id));
  end loop;
  delete from public.rank_duel_wait where week < public.rank_week(current_date) - 7;
  return n;
end $$;
revoke all on function public.rank_pair_duels() from public, anon, authenticated;

create or replace function public.rank_my_duel(d date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  p public.rank_players;
  wk date := public.rank_week(d);
  r public.rank_duels;
  w public.rank_duel_wait;
  last jsonb;
  today public.rank_days;
begin
  perform public.rank_check_day(d);
  select * into p from public.rank_players where user_id = me;
  if not found then return jsonb_build_object('on', false); end if;
  select jsonb_build_object('id', x.id, 'week', x.week, 'me', public.rank_duel_points(me, x.week),
      'them', public.rank_duel_points(case when x.a = me then x.b else x.a end, x.week),
      'rival', public.rank_face(o, me)) into last
    from public.rank_duels x join public.rank_players o on o.user_id = case when x.a = me then x.b else x.a end
    where x.week = public.rank_prev_week(wk) and (x.a = me and not x.a_claimed or x.b = me and not x.b_claimed)
      and public.rank_week_over(x.week);
  select * into r from public.rank_duels where week = wk and (a = me or b = me);
  if not found then
    perform pg_advisory_xact_lock(hashtext('rank_duel:' || wk::text));
    select * into r from public.rank_duels where week = wk and (a = me or b = me);
    if not found then
      insert into public.rank_duel_wait (week, user_id) values (wk, me) on conflict do nothing;
      select * into w from public.rank_duel_wait where week = wk and user_id = me;
      update public.rank_duel_wait set tried_at = now()
        where week = wk and user_id = me and (tried_at is null or tried_at < now() - interval '5 minutes');
      perform public.rank_pair_one(me, wk, d, w.tried_at is null or w.tried_at < now() - interval '5 minutes');
      select * into r from public.rank_duels where week = wk and (a = me or b = me);
    end if;
  end if;
  select * into today from public.rank_days where user_id = me and day = d;
  if not found then today.pages := 0; today.listen := 0; today.lessons := 0; today.adhkar := 0; today.dhikr := 0; end if;
  return jsonb_build_object('on', true, 'last', last,
    'quests', case when r.id is null then null else (select jsonb_agg(jsonb_build_object('kind', q ->> 0, 'target', (q ->> 1)::int,
        'done', public.rank_duel_quest_done(today, q))) from jsonb_array_elements(public.rank_duel_quests(d)) q) end,
    'duel', case when r.id is null then null else jsonb_build_object('id', r.id, 'week', r.week, 'end', public.rank_week_last(r.week),
      'day', least(7, greatest(1, d - r.week + 1)),
      'me', public.rank_duel_points(me, r.week),
      'them', public.rank_duel_points(case when r.a = me then r.b else r.a end, r.week),
      'rival', (select public.rank_face(o, me) || jsonb_build_object('act', case when o.private then null else public.rank_act(o.user_id, d) end)
        from public.rank_players o where o.user_id = case when r.a = me then r.b else r.a end)) end);
end $$;
revoke all on function public.rank_my_duel(date) from public, anon;
grant execute on function public.rank_my_duel(date) to authenticated;

-- What the league screen shows, as one short fingerprint (no counting over all players).
create or replace function public.rank_pulse(d date) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  wk date := public.rank_week(d);
  lg uuid;
  mine text;
  board text;
begin
  perform public.rank_check_day(d);
  select league into lg from public.rank_weeks where user_id = me and week = wk;
  if lg is null then select league into lg from public.rank_weeks where user_id = me and week = public.rank_prev_week(wk); end if;
  select concat_ws('|', p.total, p.tier, p.name, p.avatar, p.frame, p.figure, p.private, p.lamp, w.score, w.quest_done, w.league,
      (select count(*) from public.rank_prizes z where z.user_id = me and z.claimed_at is null))
    into mine
    from public.rank_players p left join public.rank_weeks w on w.user_id = p.user_id and w.week = wk where p.user_id = me;
  if mine is null then return null; end if;
  select string_agg(concat_ws(',', o.user_id, w.score, o.name, o.avatar, o.frame, o.figure, o.private, o.lamp, o.room, o.tier,
      (select x.score from public.rank_days x where x.user_id = w.user_id and x.day = d)), ';' order by w.user_id)
    into board
    from public.rank_weeks w join public.rank_players o on o.user_id = w.user_id where w.league = lg;
  return md5(concat_ws('#', wk, mine, board));
end $$;
revoke all on function public.rank_pulse(date) from public, anon;
grant execute on function public.rank_pulse(date) to authenticated;

-- Hall of fame: who won is kept for 10 minutes; the faces are built for each viewer from those few players.
create table if not exists public.rank_hall_cache (
  k smallint primary key default 1 check (k = 1),
  at timestamptz not null,
  recent jsonb not null,
  most jsonb not null
);
alter table public.rank_hall_cache enable row level security;
revoke all on table public.rank_hall_cache from public, anon, authenticated;

create or replace function public.rank_hall() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.rank_hall_cache;
  me uuid := auth.uid();
begin
  select * into c from public.rank_hall_cache where k = 1;
  if not found or c.at < now() - interval '10 minutes' then
    select 1, now(),
      (select coalesce(jsonb_agg(jsonb_build_object('u', x.user_id, 'week', x.week, 'tier', x.tier) order by x.week desc, x.tier desc), '[]'::jsonb)
        from (select z.user_id, z.week, z.tier from public.rank_prizes z where z.place = 1 order by z.week desc, z.tier desc limit 60) x),
      (select coalesce(jsonb_agg(jsonb_build_object('u', x.user_id, 'n', x.n) order by x.n desc, x.last desc), '[]'::jsonb)
        from (select z.user_id, count(*) as n, max(z.week) as last from public.rank_prizes z where z.place = 1
              group by z.user_id order by count(*) desc, max(z.week) desc limit 20) x)
      into c;
    insert into public.rank_hall_cache values (c.k, c.at, c.recent, c.most) on conflict (k) do update set at = excluded.at, recent = excluded.recent, most = excluded.most;
  end if;
  return jsonb_build_object(
    'recent', (select coalesce(jsonb_agg(public.rank_face(o, me) || jsonb_build_object('week', (e ->> 'week')::date, 'tier', (e ->> 'tier')::int,
          'score', (select w.score from public.rank_weeks w where w.user_id = o.user_id and w.week = (e ->> 'week')::date)) order by i), '[]'::jsonb)
        from jsonb_array_elements(c.recent) with ordinality as t(e, i) join public.rank_players o on o.user_id = (e ->> 'u')::uuid),
    'most', (select coalesce(jsonb_agg(public.rank_face(o, me) || jsonb_build_object('wins', (e ->> 'n')::int) order by i), '[]'::jsonb)
        from jsonb_array_elements(c.most) with ordinality as t(e, i) join public.rank_players o on o.user_id = (e ->> 'u')::uuid));
end $$;
revoke all on function public.rank_hall() from public, anon;
grant execute on function public.rank_hall() to authenticated;

-- Every 5 minutes, where pg_cron is available (a database without it pairs on each ask, as before).
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron not available: rank_pair_duels() is not scheduled';
    return;
  end;
  perform cron.unschedule(jobid) from cron.job where jobname = 'rank-pair-duels';
  perform cron.schedule('rank-pair-duels', '*/5 * * * *', 'select public.rank_pair_duels()');
end $$;
