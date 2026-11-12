-- Friend challenges for any good deed + weekly duels (owner request 2026-11-12).
--  1. rank_days keeps adhkar sessions said in full and dhikr counted (not part of the league score). rank_report
--     takes them under a pace limit (dhikr ≤ 2 a second since the last report, ≤ 3000 a day; adhkar ≤ 1 a minute,
--     ≤ 12 a day), so tapping cannot run ahead of saying.
--  2. A friend challenge has a kind: read (pages 10 + minutes 2, as before), pages, listen (minutes), lessons,
--     adhkar (sessions), dhikr (count). It can go straight to a friend (no link): it waits for their yes; the 7 days
--     start on the day they accept.
--  3. Weekly duel (opt-in, `rank_players.duels`): each league week a player is paired with the player of their tier
--     whose recent daily XP is closest. Score = the week's XP + dhikr points (1 per 33, ≤ 10 a day) + adhkar points
--     (10 a session, ≤ 4 a day) + 30 for each of the day's two duel quests done (the same quests for both).
--     Two days after the week each side opens a chest once: won 100 Light, tie 60, otherwise 30.

alter table public.rank_days add column if not exists adhkar smallint not null default 0;
alter table public.rank_days add column if not exists dhikr int not null default 0;
alter table public.rank_players add column if not exists duels boolean not null default false;

drop function if exists public.rank_report(date, int, int, int, int, text, int);
create or replace function public.rank_report(d date, pages int, listen int, surahs int, reels int, my_name text,
  lessons int default 0, adhkar int default 0, dhikr int default 0)
returns int language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  p public.rank_players;
  old public.rank_days;
  secs int;
  np int; nl int; ns int; nr int; nx int; na int; nd int; sc int;
  wk date := public.rank_week(d);
  q jsonb;
begin
  perform public.rank_check_day(d);
  insert into public.rank_players (user_id, name) values (me, coalesce(public.clean_name(my_name, 24), 'Reader'))
    on conflict (user_id) do nothing;
  select * into p from public.rank_players where user_id = me for update;
  select * into old from public.rank_days where user_id = me and day = d for update;
  if not found then
    old.pages := 0; old.listen := 0; old.surahs := 0; old.reels := 0; old.lessons := 0; old.adhkar := 0; old.dhikr := 0; old.score := 0;
  end if;
  if old.updated_at > now() - interval '5 seconds' then return old.score; end if;
  secs := coalesce(extract(epoch from now() - coalesce(old.updated_at, p.last_report))::int, 3600);
  np := greatest(old.pages, least(greatest(coalesce(pages, 0), 0), 60, old.pages + secs / 60 + 3));
  nl := greatest(old.listen, least(greatest(coalesce(listen, 0), 0), 10800, old.listen + secs + 300));
  ns := greatest(old.surahs, least(greatest(coalesce(surahs, 0), 0), 10, old.surahs + secs / 60 + 1));
  nr := greatest(old.reels, least(greatest(coalesce(reels, 0), 0), 3, old.reels + secs / 60 + 1));
  nx := greatest(old.lessons, least(greatest(coalesce(lessons, 0), 0), 20, old.lessons + secs / 60 + 2));
  na := greatest(old.adhkar, least(greatest(coalesce(adhkar, 0), 0), 12, old.adhkar + secs / 60 + 1));
  nd := greatest(old.dhikr, least(greatest(coalesce(dhikr, 0), 0), 3000, old.dhikr + secs * 2 + 40));
  sc := public.rank_score(np, nl, ns, nr, nx);
  insert into public.rank_days (user_id, day, pages, listen, surahs, reels, lessons, adhkar, dhikr, score, updated_at)
    values (me, d, np, nl, ns, nr, nx, na, nd, sc, now())
    on conflict (user_id, day) do update set pages = np, listen = nl, surahs = ns, reels = nr, lessons = nx,
      adhkar = na, dhikr = nd, score = sc, updated_at = now();
  perform public.rank_join_league(me, wk);
  update public.rank_weeks set score = score + (sc - old.score) where user_id = me and week = wk;
  update public.rank_players set total = total + (sc - old.score), last_report = now() where user_id = me;
  q := public.rank_quest(me, wk);
  if (q ->> 'done')::int >= (q ->> 'target')::int then
    update public.rank_weeks set quest_done = true, score = score + 50 where user_id = me and week = wk and not quest_done;
    if found then update public.rank_players set total = total + 50 where user_id = me; end if;
  end if;
  return sc;
end $$;
revoke all on function public.rank_report(date, int, int, int, int, text, int, int, int) from public, anon;
grant execute on function public.rank_report(date, int, int, int, int, text, int, int, int) to authenticated;

-- 2. Friend challenges by kind.
alter table public.rank_challenges add column if not exists kind text not null default 'read';
alter table public.rank_challenges drop constraint if exists rank_challenges_kind_check;
alter table public.rank_challenges add constraint rank_challenges_kind_check
  check (kind in ('read', 'pages', 'listen', 'lessons', 'adhkar', 'dhikr'));

drop function if exists public.rank_challenge_points(uuid, date);
create or replace function public.rank_challenge_points(who uuid, s date, k text default 'read') returns int
language sql stable set search_path = '' as $$
  select coalesce(sum(case k
      when 'pages' then pages
      when 'listen' then listen / 60
      when 'lessons' then lessons
      when 'adhkar' then adhkar
      when 'dhikr' then dhikr
      else pages * 10 + (listen / 60) * 2 end), 0)::int
  from public.rank_days where user_id = who and day between s and s + 6;
$$;
revoke all on function public.rank_challenge_points(uuid, date, text) from public, anon, authenticated;

create or replace function public.rank_challenge_kind(k text) returns text
language plpgsql immutable set search_path = '' as $$
begin
  if coalesce(k, 'read') not in ('read', 'pages', 'listen', 'lessons', 'adhkar', 'dhikr') then
    raise exception 'No such challenge' using errcode = '22023';
  end if;
  return coalesce(k, 'read');
end $$;

-- The limits every new challenge checks (3 started a week, 10 going).
create or replace function public.rank_challenge_room(me uuid) returns void
language plpgsql stable set search_path = '' as $$
begin
  if not exists (select 1 from public.rank_players where user_id = me) then
    raise exception 'Read or listen once to join the ranks first' using errcode = '22023';
  end if;
  if (select count(*) from public.rank_challenges where a = me and created_at > now() - interval '7 days') >= 3 then
    raise exception 'You can start 3 challenges a week' using errcode = '22023';
  end if;
  if (select count(*) from public.rank_challenges where (a = me or b = me)
      and (start is null or start >= current_date - 8)) >= 10 then
    raise exception 'You have 10 challenges going' using errcode = '22023';
  end if;
end $$;
revoke all on function public.rank_challenge_room(uuid) from public, anon, authenticated;

drop function if exists public.rank_challenge_create();
create or replace function public.rank_challenge_create(k text default 'read') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  kk text := public.rank_challenge_kind(k);
  c text;
  i uuid;
begin
  perform public.rank_challenge_room(me);
  loop
    select string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', 1 + get_byte(x, n) % 31, 1), '' order by n) into c
      from (select decode(replace(gen_random_uuid()::text, '-', ''), 'hex') x) u, generate_series(0, 7) n;
    exit when not exists (select 1 from public.rank_challenges where code = c);
  end loop;
  insert into public.rank_challenges (code, a, kind) values (c, me, kk) returning id into i;
  return jsonb_build_object('id', i, 'code', c);
end $$;
revoke all on function public.rank_challenge_create(text) from public, anon;
grant execute on function public.rank_challenge_create(text) to authenticated;

-- Straight to a friend: it waits for their answer (b set, no start yet).
create or replace function public.rank_challenge_friend(who text, k text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  kk text := public.rank_challenge_kind(k);
  them uuid := public.rank_by_pid(who);
  c text;
  i uuid;
begin
  if them is null or not exists (select 1 from public.rank_friends where a = least(me, them) and b = greatest(me, them)) then
    raise exception 'You can challenge your friends' using errcode = '22023';
  end if;
  if exists (select 1 from public.rank_challenges where ((a = me and b = them) or (a = them and b = me))
      and (start is null and created_at > now() - interval '7 days' or start >= current_date - 6)) then
    raise exception 'You already have a challenge with them' using errcode = '22023';
  end if;
  perform public.rank_challenge_room(me);
  loop
    select string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', 1 + get_byte(x, n) % 31, 1), '' order by n) into c
      from (select decode(replace(gen_random_uuid()::text, '-', ''), 'hex') x) u, generate_series(0, 7) n;
    exit when not exists (select 1 from public.rank_challenges where code = c);
  end loop;
  insert into public.rank_challenges (code, a, b, kind) values (c, me, them, kk) returning id into i;
  return i;
end $$;
revoke all on function public.rank_challenge_friend(text, text) from public, anon;
grant execute on function public.rank_challenge_friend(text, text) to authenticated;

-- The friend says yes (the week starts on their day `d`) or no (the challenge is removed).
create or replace function public.rank_challenge_answer(ch uuid, yes boolean, d date) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.rank_me();
begin
  perform public.rank_check_day(d);
  if yes then
    update public.rank_challenges set start = d where id = ch and b = me and start is null and created_at > now() - interval '7 days';
    if not found then raise exception 'This challenge has ended' using errcode = '22023'; end if;
  else
    delete from public.rank_challenges where id = ch and b = me and start is null;
  end if;
end $$;
revoke all on function public.rank_challenge_answer(uuid, boolean, date) from public, anon;
grant execute on function public.rank_challenge_answer(uuid, boolean, date) to authenticated;

-- My challenges: as before, plus the kind, and the ones waiting for a friend's answer (`asked` mine, `incoming` theirs).
create or replace function public.rank_my_challenges(d date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := public.rank_me();
begin
  perform public.rank_check_day(d);
  return coalesce((
    select jsonb_agg(x order by created_at desc) from (
      select c.created_at, jsonb_build_object(
        'id', c.id, 'code', case when c.a = me and c.b is null then c.code end, 'kind', c.kind,
        'start', c.start, 'end', c.start + 6,
        'waiting', c.b is null, 'expired', c.start is null and c.created_at < now() - interval '7 days',
        'asked', c.b is not null and c.start is null and c.a = me,
        'incoming', c.b = me and c.start is null,
        'day', case when c.start is not null then least(7, greatest(1, d - c.start + 1)) end,
        'over', c.start is not null and current_date > c.start + 7,
        'claimed', case when c.a = me then c.a_claimed else c.b_claimed end,
        'me', case when c.start is not null then public.rank_challenge_points(me, c.start, c.kind) end,
        'them', case when c.start is not null then public.rank_challenge_points(case when c.a = me then c.b else c.a end, c.start, c.kind) end,
        'friend', case when c.b is not null then public.rank_face(o, me) end) x
      from public.rank_challenges c
      left join public.rank_players o on o.user_id = case when c.a = me then c.b else c.a end
      where (c.a = me or c.b = me)
        and (c.start >= d - 28 or (c.start is null and c.created_at > now() - interval '14 days'))
      order by c.created_at desc limit 20) y), '[]'::jsonb);
end $$;

create or replace function public.rank_challenge_claim(ch uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  r public.rank_challenges;
  mine int;
  theirs int;
  res text;
begin
  select * into r from public.rank_challenges where id = ch and (a = me or b = me) for update;
  if not found or r.b is null or r.start is null or current_date <= r.start + 7 then return null; end if;
  if (r.a = me and r.a_claimed) or (r.b = me and r.b_claimed) then return null; end if;
  mine := public.rank_challenge_points(me, r.start, r.kind);
  theirs := public.rank_challenge_points(case when r.a = me then r.b else r.a end, r.start, r.kind);
  res := case when mine > theirs then 'won' when mine = theirs then 'tie' else 'lost' end;
  if r.a = me then update public.rank_challenges set a_claimed = true where id = ch;
  else update public.rank_challenges set b_claimed = true where id = ch; end if;
  return jsonb_build_object('result', res, 'me', mine, 'them', theirs,
    'light', case res when 'won' then 100 when 'tie' then 60 else 30 end);
end $$;

-- Accepting a link challenge: unchanged, but a direct one cannot be taken through its link.
create or replace function public.rank_challenge_cancel(ch uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.rank_me();
begin
  delete from public.rank_challenges where id = ch and a = me and start is null;
end $$;

-- 3. Weekly duels.
create table if not exists public.rank_duels (
  id uuid primary key default gen_random_uuid(),
  week date not null,
  a uuid not null references auth.users (id) on delete cascade,
  b uuid not null references auth.users (id) on delete cascade,
  a_claimed boolean not null default false,
  b_claimed boolean not null default false,
  check (a <> b)
);
create unique index if not exists rank_duels_a on public.rank_duels (week, a);
create unique index if not exists rank_duels_b on public.rank_duels (week, b);
alter table public.rank_duels enable row level security;
revoke all on table public.rank_duels from public, anon, authenticated;

-- The day's two duel quests (the same for everyone that day): [kind, target] pairs, from a list of eight in turn.
create or replace function public.rank_duel_quests(dd date) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_array(q -> ((dd - date '2026-01-05') % 8), q -> (((dd - date '2026-01-05') * 3 + 5) % 8))
  from (select '[["pages",5],["listen",10],["lessons",1],["adhkar",1],["dhikr",100],["pages",10],["adhkar",2],["dhikr",300]]'::jsonb q) x;
$$;

create or replace function public.rank_duel_quest_done(y public.rank_days, q jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(case q ->> 0
    when 'pages' then y.pages >= (q ->> 1)::int
    when 'listen' then y.listen / 60 >= (q ->> 1)::int
    when 'lessons' then y.lessons >= (q ->> 1)::int
    when 'adhkar' then y.adhkar >= (q ->> 1)::int
    when 'dhikr' then y.dhikr >= (q ->> 1)::int end, false);
$$;

-- A player's duel score for the week starting `wk`.
create or replace function public.rank_duel_points(who uuid, wk date) returns int
language sql stable set search_path = '' as $$
  select coalesce(sum(y.score + least(y.dhikr / 33, 10) + least(y.adhkar, 4) * 10
    + (case when public.rank_duel_quest_done(y, public.rank_duel_quests(y.day) -> 0) then 30 else 0 end)
    + (case when public.rank_duel_quest_done(y, public.rank_duel_quests(y.day) -> 1) then 30 else 0 end)), 0)::int
  from public.rank_days y where y.user_id = who and y.day between wk and wk + 6;
$$;
revoke all on function public.rank_duel_points(uuid, date) from public, anon, authenticated;

create or replace function public.rank_set_duels(turn_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.rank_players set duels = coalesce(turn_on, false) where user_id = public.rank_me();
  if not found then raise exception 'Read or listen once to join the ranks first' using errcode = '22023'; end if;
end $$;
revoke all on function public.rank_set_duels(boolean) from public, anon;
grant execute on function public.rank_set_duels(boolean) to authenticated;

-- This week's duel (paired now when there is none yet and someone is free), with last week's when it waits to be opened.
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
  -- Last week's duel, while its chest waits.
  select jsonb_build_object('id', x.id, 'week', x.week, 'me', public.rank_duel_points(me, x.week),
      'them', public.rank_duel_points(case when x.a = me then x.b else x.a end, x.week),
      'rival', public.rank_face(o, me)) into last
    from public.rank_duels x join public.rank_players o on o.user_id = case when x.a = me then x.b else x.a end
    where x.week = wk - 7 and (x.a = me and not x.a_claimed or x.b = me and not x.b_claimed) and current_date > x.week + 7;
  select * into r from public.rank_duels where week = wk and (a = me or b = me);
  if not found and p.duels then
    perform pg_advisory_xact_lock(hashtext('rank_duel:' || wk::text || ':' || p.tier::text));
    select * into r from public.rank_duels where week = wk and (a = me or b = me);
    if not found then
      mine := (select coalesce(avg(score), 0) from public.rank_days where user_id = me and day between d - 14 and d - 1);
      select o.user_id into them from public.rank_players o
        where o.duels and o.user_id <> me and o.tier = p.tier and o.last_report > now() - interval '7 days'
          and not exists (select 1 from public.rank_duels z where z.week = wk and (z.a = o.user_id or z.b = o.user_id))
        order by abs(coalesce((select avg(score) from public.rank_days y where y.user_id = o.user_id and y.day between d - 14 and d - 1), 0) - mine), o.user_id
        limit 1;
      if them is not null then
        insert into public.rank_duels (week, a, b) values (wk, me, them) returning * into r;
      end if;
    end if;
  end if;
  select * into today from public.rank_days where user_id = me and day = d;
  if not found then today.pages := 0; today.listen := 0; today.lessons := 0; today.adhkar := 0; today.dhikr := 0; end if;
  return jsonb_build_object('on', p.duels, 'last', last,
    'quests', (select jsonb_agg(jsonb_build_object('kind', q ->> 0, 'target', (q ->> 1)::int,
        'done', public.rank_duel_quest_done(today, q))) from jsonb_array_elements(public.rank_duel_quests(d)) q),
    'duel', case when r.id is null then null else jsonb_build_object('id', r.id, 'week', r.week, 'end', r.week + 6,
      'day', least(7, greatest(1, d - r.week + 1)),
      'me', public.rank_duel_points(me, r.week),
      'them', public.rank_duel_points(case when r.a = me then r.b else r.a end, r.week),
      'rival', (select public.rank_face(o, me) from public.rank_players o where o.user_id = case when r.a = me then r.b else r.a end)) end);
end $$;
revoke all on function public.rank_my_duel(date) from public, anon;
grant execute on function public.rank_my_duel(date) to authenticated;

-- Once the week is over (two days after its last day): the Light, once for each side.
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
  if not found or current_date <= r.week + 7 then return null; end if;
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
