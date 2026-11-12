-- The ranked week ends at each person's own Friday Maghrib (owner decision 2026-11-12: "Friday is the last day and
-- the end is not midnight but Maghrib … each at their time zone"). The app reports by the Islamic day (from Maghrib
-- the next day has begun), so the week is Saturday → Friday and ends at the player's own Friday Maghrib. Nobody's
-- week can end at one shared moment, so:
--   * leagues and rivals are filled with players whose clocks are within 2 hours of each other (`utc_off`);
--   * each player's Friday Maghrib is sent with the reports (`rank_weeks.ends_at`);
--   * a league's results (place, prizes, moving up or down) wait until the last member's Maghrib has passed
--     (`rank_league_ends()`); until then a player whose own week has ended sees "waiting for the others' Maghrib".
-- The week of 9 November is the bridge: Monday 9 → Friday 13 (Maghrib), then the first Saturday week starts.

create or replace function public.rank_week(d date) returns date
language sql immutable set search_path = '' as $$
  select case when d < date '2026-11-09' then date_trunc('week', d)::date
              when d <= date '2026-11-13' then date '2026-11-09'
              else d - ((extract(isodow from d)::int + 1) % 7) end;
$$;
revoke all on function public.rank_week(date) from public, anon, authenticated;

-- The week's last day (Friday), and the week before (the bridge week is five days long).
create or replace function public.rank_week_last(wk date) returns date
language sql immutable set search_path = '' as $$
  select case when wk = date '2026-11-09' then date '2026-11-13' else wk + 6 end;
$$;
create or replace function public.rank_prev_week(wk date) returns date
language sql immutable set search_path = '' as $$
  select case when wk = date '2026-11-14' then date '2026-11-09' else wk - 7 end;
$$;
-- The week's number from 9 November (rotations of quests and prizes keep their order across the bridge).
create or replace function public.rank_week_no(wk date) returns int
language sql immutable set search_path = '' as $$
  select case when wk <= date '2026-11-09' then (wk - date '2026-11-09') / 7 else (wk - date '2026-11-07') / 7 end;
$$;
revoke all on function public.rank_week_last(date), public.rank_prev_week(date), public.rank_week_no(date) from public, anon, authenticated;

-- An Islamic day can be a day ahead of the date in the player's time zone, and that can be two ahead of UTC.
create or replace function public.rank_check_day(d date) returns void
language plpgsql stable set search_path = '' as $$
begin
  if d is null or d < current_date - 2 or d > current_date + 2 then
    raise exception 'Not a day that can be reported' using errcode = '22023';
  end if;
end $$;

alter table public.rank_players add column if not exists utc_off smallint check (utc_off between -720 and 840);
alter table public.rank_weeks add column if not exists ends_at timestamptz;
alter table public.rank_leagues add column if not exists off smallint;

-- A member's week end when the app has not said: Friday 18:00 on the league's clock.
create or replace function public.rank_end_guess(wk date, off int) returns timestamptz
language sql immutable set search_path = '' as $$
  select ((public.rank_week_last(wk)::timestamp + interval '18 hours') - make_interval(mins => coalesce(off, 0))) at time zone 'UTC';
$$;
-- When a league's week is over for everyone: the last member's Maghrib (each kept by rank_report no later than
-- Saturday 08:00 UTC, when Friday Maghrib has passed everywhere).
create or replace function public.rank_league_ends(lg uuid) returns timestamptz
language sql stable set search_path = '' as $$
  select max(coalesce(w.ends_at, public.rank_end_guess(l.week, l.off)))
  from public.rank_leagues l join public.rank_weeks w on w.league = l.id where l.id = lg;
$$;
revoke all on function public.rank_end_guess(date, int), public.rank_league_ends(uuid) from public, anon, authenticated;

-- Places the player in a league for `wk` (once), or returns null while last week's league is still waiting for a
-- member's Maghrib. First the tier moves with last week's place (and its prize is given), then the league of that
-- week and tier with room whose clock is closest (within 2 hours), or a new one. The week's score is what the
-- player's days already hold (days reported while waiting count too).
create or replace function public.rank_join_league(me uuid, wk date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  lg uuid;
  pl uuid;
  pw date := public.rank_prev_week(wk);
  last record;
  t smallint;
  t0 smallint;
  pz smallint;
  myoff smallint;
begin
  select league into lg from public.rank_weeks where user_id = me and week = wk;
  if lg is not null then return lg; end if;
  select league into pl from public.rank_weeks where user_id = me and week = pw;
  if pl is not null and now() < public.rank_league_ends(pl) then return null; end if;
  select tier, utc_off into t, myoff from public.rank_players where user_id = me for update;
  t0 := t;
  select w.league, l.size, l.tier as ltier,
         (select count(*) from public.rank_weeks o where o.league = w.league and (o.score > w.score or (o.score = w.score and o.user_id < w.user_id))) + 1 as place,
         w.score
    into last
    from public.rank_weeks w join public.rank_leagues l on l.id = w.league
    where w.user_id = me and w.week = pw;
  if found then
    if last.place <= 3 and last.score > 0 then t := least(4, t + 1);
    elsif last.size >= 8 and last.place > last.size - 3 then t := greatest(0, t - 1);
    end if;
    update public.rank_players set tier = t, best_tier = greatest(best_tier, t) where user_id = me;
    pz := case when last.place <= 3 and last.score > 0 and last.size >= 3 then last.place end;
    if pz is not null or t > t0 then
      insert into public.rank_prizes (user_id, week, place, tier, promoted, light, gives_freeze)
        values (me, pw, pz, last.ltier, t > t0,
                coalesce((array[300, 150, 100])[pz], 0) + case when t > t0 then 50 else 0 end, coalesce(pz = 1, false))
        on conflict (user_id, week) do nothing;
    end if;
  end if;
  select id into lg from public.rank_leagues
    where week = wk and tier = t and size < 15 and (off is null or myoff is null or abs(off - myoff) <= 120)
    order by abs(coalesce(off, 0) - coalesce(myoff, 0)), created_at limit 1 for update skip locked;
  if lg is null then
    insert into public.rank_leagues (week, tier, off) values (wk, t, myoff) returning id into lg;
  end if;
  update public.rank_leagues set size = size + 1 where id = lg;
  insert into public.rank_weeks (user_id, week, league, score)
    values (me, wk, lg, (select coalesce(sum(score + flawless * 10), 0) from public.rank_days
                          where user_id = me and day between wk and public.rank_week_last(wk)))
    on conflict (user_id, week) do update set league = excluded.league;
  return lg;
end $$;

-- Rotations keep their order across the bridge week.
create or replace function public.rank_prize_item(wk date, place int) returns text
language sql immutable set search_path = '' as $$
  select case when place = 1 then 'av:' || (40 + k % 12) when place in (2, 3) then 'fr:' || (8 + k % 6) end
  from (select (public.rank_week_no(wk) % 12 + 12) % 12 as k) w;
$$;
create or replace function public.rank_prize_piece(wk date) returns text
language sql immutable set search_path = '' as $$
  select (array['outfit:7', 'hold:6', 'glasses:3', 'bg:8', 'hold:7', 'bg:9'])[(public.rank_week_no(wk) % 6 + 6) % 6 + 1];
$$;
create or replace function public.rank_quest(me uuid, wk date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  k int := (public.rank_week_no(wk) % 5 + 5) % 5;
  kind text := (array['pages', 'listen', 'days', 'surahs', 'lessons'])[k + 1];
  target int := (array[50, 60, 5, 2, 5])[k + 1];
  v int;
begin
  select case kind when 'pages' then coalesce(sum(pages), 0)
                   when 'listen' then coalesce(sum(listen), 0) / 60
                   when 'days' then count(*) filter (where score > 0)
                   when 'lessons' then coalesce(sum(lessons), 0)
                   else coalesce(sum(surahs), 0) end
    into v from public.rank_days where user_id = me and day between wk and public.rank_week_last(wk);
  return jsonb_build_object('kind', kind, 'target', target, 'done', least(v, target), 'bonus', 50);
end $$;

-- Reports also say where the player is in time: minutes east of UTC and when their Friday Maghrib is.
drop function if exists public.rank_report(date, int, int, int, int, text, int, int, int);
create or replace function public.rank_report(d date, pages int, listen int, surahs int, reels int, my_name text,
  lessons int default 0, adhkar int default 0, dhikr int default 0, week_end timestamptz default null, utc_off int default null)
returns int language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  p public.rank_players;
  old public.rank_days;
  secs int;
  np int; nl int; ns int; nr int; nx int; na int; nd int; sc int;
  wk date := public.rank_week(d);
  lg uuid;
  q jsonb;
begin
  perform public.rank_check_day(d);
  insert into public.rank_players (user_id, name) values (me, coalesce(public.clean_name(my_name, 24), 'Reader'))
    on conflict (user_id) do nothing;
  select * into p from public.rank_players where user_id = me for update;
  if utc_off between -720 and 840 then update public.rank_players set utc_off = rank_report.utc_off where user_id = me; end if;
  select * into old from public.rank_days where user_id = me and day = d for update;
  if not found then
    old.pages := 0; old.listen := 0; old.surahs := 0; old.reels := 0; old.lessons := 0; old.adhkar := 0; old.dhikr := 0; old.score := 0;
  end if;
  if old.updated_at > now() - interval '5 seconds' then return old.score; end if;
  -- The league first: a new week's row starts from the days already reported (this one before its new numbers).
  lg := public.rank_join_league(me, wk);
  if week_end is not null and lg is not null then
    update public.rank_weeks set ends_at = greatest(least(week_end,
        ((public.rank_week_last(wk) + 1)::timestamp + interval '8 hours') at time zone 'UTC'),
        (public.rank_week_last(wk)::timestamp - interval '14 hours') at time zone 'UTC')
      where user_id = me and week = wk;
  end if;
  secs := coalesce(extract(epoch from now() - coalesce(old.updated_at, p.last_report))::int, 3600);
  np := greatest(old.pages, least(greatest(coalesce(pages, 0), 0), 60, old.pages + secs / 60 + 3));
  nl := greatest(old.listen, least(greatest(coalesce(listen, 0), 0), 10800, old.listen + secs + 300));
  ns := greatest(old.surahs, least(greatest(coalesce(surahs, 0), 0), 10, old.surahs + secs / 60 + 1));
  nr := greatest(old.reels, least(greatest(coalesce(reels, 0), 0), 3, old.reels + secs / 60 + 1));
  nx := greatest(old.lessons, least(greatest(coalesce(lessons, 0), 0), 20, old.lessons + secs / 60 + 2));
  na := greatest(old.adhkar, least(greatest(coalesce(adhkar, 0), 0), 12, old.adhkar + secs / 60 + 1));
  nd := greatest(old.dhikr, least(greatest(coalesce(dhikr, 0), 0), 3000, old.dhikr + secs * 2 + 40));
  sc := round(public.rank_score(np, nl, ns, nr, nx) * public.rank_xp_mult(d))::int;
  insert into public.rank_days (user_id, day, pages, listen, surahs, reels, lessons, adhkar, dhikr, score, updated_at)
    values (me, d, np, nl, ns, nr, nx, na, nd, sc, now())
    on conflict (user_id, day) do update set pages = np, listen = nl, surahs = ns, reels = nr, lessons = nx,
      adhkar = na, dhikr = nd, score = sc, updated_at = now();
  update public.rank_weeks set score = score + (sc - old.score) where user_id = me and week = wk;
  update public.rank_players set total = total + (sc - old.score), last_report = now() where user_id = me;
  q := public.rank_quest(me, wk);
  if (q ->> 'done')::int >= (q ->> 'target')::int then
    update public.rank_weeks set quest_done = true, score = score + 50 where user_id = me and week = wk and not quest_done;
    if found then update public.rank_players set total = total + 50 where user_id = me; end if;
  end if;
  return sc;
end $$;
revoke all on function public.rank_report(date, int, int, int, int, text, int, int, int, timestamptz, int) from public, anon;
grant execute on function public.rank_report(date, int, int, int, int, text, int, int, int, timestamptz, int) to authenticated;

-- What a player did today, for the rival line ("Omar read 5 pages · 12 min ago").
create or replace function public.rank_act(who uuid, d date) returns jsonb
language sql stable set search_path = '' as $$
  select case when y.user_id is null then null else jsonb_build_object('pages', y.pages, 'listen', y.listen / 60,
    'lessons', y.lessons, 'at', y.updated_at) end
  from (select 1) one left join public.rank_days y on y.user_id = who and y.day = d;
$$;
revoke all on function public.rank_act(uuid, date) from public, anon, authenticated;

-- Status: as before, plus `waiting` (my week is over, the league's is not yet) and the rival as a person.
create or replace function public.rank_status(d date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  wk date;
  pw date;
  p public.rank_players;
  ws int;
  lg uuid;
  pl uuid;
  rival jsonb;
  last jsonb;
  waiting jsonb;
begin
  perform public.rank_check_day(d);
  wk := public.rank_week(d);
  pw := public.rank_prev_week(wk);
  if not exists (select 1 from public.rank_players where user_id = me) then return null; end if;
  lg := public.rank_join_league(me, wk);
  select * into p from public.rank_players where user_id = me;
  if lg is null then
    select league into pl from public.rank_weeks where user_id = me and week = pw;
    select jsonb_build_object('until', public.rank_league_ends(pl), 'score', w.score, 'size', l.size, 'tier', l.tier,
        'place', (select count(*) from public.rank_weeks o where o.league = w.league and (o.score > w.score or (o.score = w.score and o.user_id < w.user_id))) + 1)
      into waiting
      from public.rank_weeks w join public.rank_leagues l on l.id = w.league where w.user_id = me and w.week = pw;
  end if;
  select score into ws from public.rank_weeks where user_id = me and week = wk;
  select public.rank_face(o, me) || jsonb_build_object('gap', w.score - ws,
      'act', case when o.private then null else public.rank_act(o.user_id, d) end) into rival
    from public.rank_weeks w join public.rank_players o on o.user_id = w.user_id
    where w.league = lg and w.user_id <> me and (w.score > ws or (w.score = ws and w.user_id < me))
    order by w.score, w.user_id desc limit 1;
  if waiting is null then
    select jsonb_build_object('score', w.score, 'tier', l.tier, 'size', l.size,
        'place', (select count(*) from public.rank_weeks o where o.league = w.league and (o.score > w.score or (o.score = w.score and o.user_id < w.user_id))) + 1)
      into last
      from public.rank_weeks w join public.rank_leagues l on l.id = w.league where w.user_id = me and w.week = pw;
  end if;
  return jsonb_build_object(
    'name', p.name, 'tier', p.tier, 'avatar', p.avatar, 'private', p.private, 'frame', p.frame, 'bestTier', p.best_tier, 'total', p.total, 'week', coalesce(ws, 0),
    'weekPlace', case when ws is null then null else (select count(*) from public.rank_weeks where week = wk and score > ws) + 1 end,
    'weekPlayers', public.rank_count('week', wk),
    'allPlace', (select count(*) from public.rank_players where total > p.total) + 1,
    'allPlayers', public.rank_count('all', null),
    'quest', public.rank_quest(me, wk) || jsonb_build_object('complete', coalesce((select quest_done from public.rank_weeks where user_id = me and week = wk), false)),
    'rival', rival, 'last', last, 'waiting', waiting, 'weekStart', wk, 'weekLast', public.rank_week_last(wk),
    'prizes', (select count(*) from public.rank_prizes where user_id = me and claimed_at is null),
    'bestPlace', (select min(place) from public.rank_prizes where user_id = me),
    'wins', (select count(*) from public.rank_prizes where user_id = me and place = 1));
end $$;

-- The league: this week's, or — while waiting for the others' Maghrib — last week's as it stands.
create or replace function public.rank_league(d date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  wk date := public.rank_week(d);
  lg uuid;
  first_day boolean;
  until timestamptz;
begin
  perform public.rank_check_day(d);
  if not exists (select 1 from public.rank_players where user_id = me) then return null; end if;
  lg := public.rank_join_league(me, wk);
  if lg is null then
    select league into lg from public.rank_weeks where user_id = me and week = public.rank_prev_week(wk);
    until := public.rank_league_ends(lg);
    first_day := true;
  else
    first_day := d = wk;
  end if;
  return jsonb_build_object(
    'tier', (select tier from public.rank_leagues where id = lg),
    'waiting', until is not null, 'until', until,
    'players', (select coalesce(jsonb_agg(public.rank_face(r.p, me) || jsonb_build_object('score', r.score,
        'move', case when first_day then 0 else r.prev_p - r.now_p end) order by r.now_p), '[]'::jsonb)
      from (select s.*, row_number() over (order by s.score desc, s.uid) as now_p,
                   row_number() over (order by s.prev desc, s.score desc, s.uid) as prev_p
            from (select w.user_id as uid, p, w.score, w.score - coalesce(x.score, 0) as prev
                  from public.rank_weeks w
                  join public.rank_players p on p.user_id = w.user_id
                  left join public.rank_days x on x.user_id = w.user_id and x.day = d
                  where w.league = lg) s) r));
end $$;

-- Rivals: a week runs to its Friday; the chest opens once Friday Maghrib has passed everywhere; pairing prefers a
-- rival on a clock within 2 hours.
create or replace function public.rank_duel_points(who uuid, wk date) returns int
language sql stable set search_path = '' as $$
  select coalesce(sum(y.score + least(y.dhikr / 33, 10) + least(y.adhkar, 4) * 10
    + (case when public.rank_duel_quest_done(y, public.rank_duel_quests(y.day) -> 0) then 30 else 0 end)
    + (case when public.rank_duel_quest_done(y, public.rank_duel_quests(y.day) -> 1) then 30 else 0 end)), 0)::int
  from public.rank_days y where y.user_id = who and y.day between wk and public.rank_week_last(wk);
$$;
revoke all on function public.rank_duel_points(uuid, date) from public, anon, authenticated;
create or replace function public.rank_week_over(wk date) returns boolean
language sql stable set search_path = '' as $$
  select now() > ((public.rank_week_last(wk) + 1)::timestamp + interval '8 hours') at time zone 'UTC';
$$;
revoke all on function public.rank_week_over(date) from public, anon, authenticated;

create or replace function public.rank_my_duel(d date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  p public.rank_players;
  wk date := public.rank_week(d);
  r public.rank_duels;
  them uuid;
  mine numeric;
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
      mine := (select coalesce(avg(score), 0) from public.rank_days where user_id = me and day between d - 14 and d - 1);
      select o.user_id into them from public.rank_players o
        where o.user_id <> me and o.last_report > now() - interval '14 days'
          and not exists (select 1 from public.rank_duels z where z.week = wk and (z.a = o.user_id or z.b = o.user_id))
        order by case when p.utc_off is null or o.utc_off is null or abs(o.utc_off - p.utc_off) <= 120 then 0 else 1 end,
          abs(o.tier - p.tier),
          abs(coalesce((select avg(score) from public.rank_days y where y.user_id = o.user_id and y.day between d - 14 and d - 1), 0) - mine),
          o.user_id
        limit 1;
      if them is not null then
        insert into public.rank_duels (week, a, b) values (wk, me, them) returning * into r;
        update public.rank_players set duels = true where user_id in (me, them) and not duels;
      end if;
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

create or replace function public.rank_duel_claim(duel uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  r public.rank_duels;
  mine int;
  theirs int;
  res text;
begin
  select * into r from public.rank_duels where id = duel and (a = me or b = me) for update;
  if not found or not public.rank_week_over(r.week) then return null; end if;
  if (r.a = me and r.a_claimed) or (r.b = me and r.b_claimed) then return null; end if;
  mine := public.rank_duel_points(me, r.week);
  theirs := public.rank_duel_points(case when r.a = me then r.b else r.a end, r.week);
  res := case when mine > theirs then 'won' when mine = theirs then 'tie' else 'lost' end;
  if r.a = me then update public.rank_duels set a_claimed = true where id = duel;
  else update public.rank_duels set b_claimed = true where id = duel; end if;
  return jsonb_build_object('result', res, 'me', mine, 'them', theirs,
    'light', case res when 'won' then 100 when 'tie' then 60 else 30 end);
end $$;
revoke all on function public.rank_duel_claim(uuid) from public, anon;
grant execute on function public.rank_duel_claim(uuid) to authenticated;

-- Hall of fame (owner request 2026-11-12): every league's weekly winner stays on a board for good. The newest 60
-- wins, and the players who have won most often (a private player shows as "A reader").
create or replace function public.rank_hall() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'recent', (select coalesce(jsonb_agg(x.j order by x.week desc, x.tier desc), '[]'::jsonb) from (
        select z.week, z.tier, public.rank_face(o, auth.uid()) || jsonb_build_object('week', z.week, 'tier', z.tier,
          'score', (select w.score from public.rank_weeks w where w.user_id = z.user_id and w.week = z.week)) as j
        from public.rank_prizes z join public.rank_players o on o.user_id = z.user_id
        where z.place = 1 order by z.week desc, z.tier desc limit 60) x),
    'most', (select coalesce(jsonb_agg(x.j order by x.n desc, x.last desc), '[]'::jsonb) from (
        select count(*) as n, max(z.week) as last, public.rank_face(o, auth.uid()) || jsonb_build_object('wins', count(*)) as j
        from public.rank_prizes z join public.rank_players o on o.user_id = z.user_id
        where z.place = 1 group by o.user_id order by count(*) desc, max(z.week) desc limit 20) x));
$$;
revoke all on function public.rank_hall() from public, anon;
grant execute on function public.rank_hall() to authenticated;
