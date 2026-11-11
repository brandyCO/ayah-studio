-- Ranks at scale (speed check 2026-11-11): fewer and cheaper calls while Ranks is open.
--  1. rank_profiles(): the league's profiles in one call instead of one call per player.
--  2. rank_count(): "of N players" counted at most once a minute, not on every status call.
--  3. rank_global() by Pages / Listening / Surahs / Reels: the week's top 100 worked out at most once a minute
--     (it added up every player's week on every call); rank_board() by a measure adds up only the board's members.

-- 1. Several profiles at once: { pid: profile or null }, at most 40.
create or replace function public.rank_profiles(whos text[], d date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  out jsonb := '{}'::jsonb;
  w text;
begin
  if public.rank_me() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if coalesce(array_length(whos, 1), 0) > 40 then raise exception 'Too many at once' using errcode = '22023'; end if;
  foreach w in array coalesce(whos, '{}') loop
    if w is not null and not out ? w then out := out || jsonb_build_object(w, public.rank_profile(w, d)); end if;
  end loop;
  return out;
end $$;
revoke all on function public.rank_profiles(text[], date) from public, anon;
grant execute on function public.rank_profiles(text[], date) to authenticated;

-- 2. Counts kept for a minute. When one is being counted again, others get the last count.
create table if not exists public.rank_counts (
  k text primary key,
  n int not null,
  at timestamptz not null
);
alter table public.rank_counts enable row level security;
revoke all on table public.rank_counts from public, anon, authenticated;

create or replace function public.rank_count(kind text, wk date) returns int
language plpgsql security definer set search_path = '' as $$
declare
  key text := kind || ':' || coalesce(wk::text, '');
  c public.rank_counts;
  n int;
begin
  select * into c from public.rank_counts where k = key;
  if c.k is not null and (c.at > now() - interval '60 seconds' or not pg_try_advisory_xact_lock(hashtext('rank_count:' || key))) then
    return c.n;
  end if;
  n := case when kind = 'week' then (select count(*) from public.rank_weeks where week = wk)
            else (select count(*) from public.rank_players) end;
  insert into public.rank_counts (k, n, at) values (key, n, now()) on conflict (k) do update set n = excluded.n, at = excluded.at;
  return n;
end $$;
revoke all on function public.rank_count(text, date) from public, anon, authenticated;

create or replace function public.rank_status(d date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  wk date;
  p public.rank_players;
  ws int;
  lg uuid;
  rival jsonb;
  last jsonb;
begin
  perform public.rank_check_day(d);
  wk := public.rank_week(d);
  if not exists (select 1 from public.rank_players where user_id = me) then return null; end if;
  lg := public.rank_join_league(me, wk);
  select * into p from public.rank_players where user_id = me;
  select score into ws from public.rank_weeks where user_id = me and week = wk;
  select public.rank_face(o, me) || jsonb_build_object('gap', w.score - ws) into rival
    from public.rank_weeks w join public.rank_players o on o.user_id = w.user_id
    where w.league = lg and w.user_id <> me and (w.score > ws or (w.score = ws and w.user_id < me))
    order by w.score, w.user_id desc limit 1;
  select jsonb_build_object('score', w.score, 'tier', l.tier, 'size', l.size,
      'place', (select count(*) from public.rank_weeks o where o.league = w.league and (o.score > w.score or (o.score = w.score and o.user_id < w.user_id))) + 1)
    into last
    from public.rank_weeks w join public.rank_leagues l on l.id = w.league where w.user_id = me and w.week = wk - 7;
  return jsonb_build_object(
    'name', p.name, 'tier', p.tier, 'avatar', p.avatar, 'private', p.private, 'frame', p.frame, 'bestTier', p.best_tier, 'total', p.total, 'week', coalesce(ws, 0),
    'weekPlace', case when ws is null then null else (select count(*) from public.rank_weeks where week = wk and score > ws) + 1 end,
    'weekPlayers', public.rank_count('week', wk),
    'allPlace', (select count(*) from public.rank_players where total > p.total) + 1,
    'allPlayers', public.rank_count('all', null),
    'quest', public.rank_quest(me, wk) || jsonb_build_object('complete', (select quest_done from public.rank_weeks where user_id = me and week = wk)),
    'rival', rival, 'last', last, 'weekStart', wk,
    'prizes', (select count(*) from public.rank_prizes where user_id = me and claimed_at is null),
    'bestPlace', (select min(place) from public.rank_prizes where user_id = me),
    'wins', (select count(*) from public.rank_prizes where user_id = me and place = 1));
end $$;

-- 3. The week's top 100 by a measure, kept for a minute (the same for everyone; faces are made per caller).
create table if not exists public.rank_measure_top (
  metric text not null,
  week date not null,
  at timestamptz not null,
  rows jsonb not null,
  primary key (metric, week)
);
alter table public.rank_measure_top enable row level security;
revoke all on table public.rank_measure_top from public, anon, authenticated;

create or replace function public.rank_measure_top100(metric text, d date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  wk date := public.rank_week(d);
  c public.rank_measure_top;
  r jsonb;
begin
  select * into c from public.rank_measure_top t where t.metric = rank_measure_top100.metric and t.week = wk;
  if c.metric is not null and (c.at > now() - interval '60 seconds' or not pg_try_advisory_xact_lock(hashtext('rank_top:' || metric || wk::text))) then
    return c.rows;
  end if;
  r := (select coalesce(jsonb_agg(jsonb_build_array(x.uid, x.v) order by x.v desc, x.uid), '[]'::jsonb)
        from (select * from public.rank_measure(metric, d) m where m.v > 0 order by m.v desc, m.uid limit 100) x);
  insert into public.rank_measure_top (metric, week, at, rows) values (metric, wk, now(), r)
    on conflict on constraint rank_measure_top_pkey do update set at = excluded.at, rows = excluded.rows;
  return r;
end $$;
revoke all on function public.rank_measure_top100(text, date) from public, anon, authenticated;

-- No longer `stable`: it may keep the top 100 above.
create or replace function public.rank_global(d date, all_time boolean, metric text default 'all') returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare me uuid := public.rank_me();
begin
  perform public.rank_check_day(d);
  if metric not in ('all', 'pages', 'listen', 'surahs', 'reels') then raise exception 'No such measure' using errcode = '22023'; end if;
  if metric <> 'all' then
    return (select coalesce(jsonb_agg(public.rank_face(p, me) || jsonb_build_object('score', m.v) order by m.v desc, m.uid), '[]'::jsonb)
      from (select (e ->> 0)::uuid as uid, (e ->> 1)::int as v from jsonb_array_elements(public.rank_measure_top100(metric, d)) e) m
      join public.rank_players p on p.user_id = m.uid and (not p.private or p.user_id = me));
  end if;
  if all_time then
    return (select coalesce(jsonb_agg(public.rank_face(t, me) || jsonb_build_object('score', t.total) order by t.total desc, t.user_id), '[]'::jsonb)
      from (select * from public.rank_players where total > 0 and (not private or user_id = me) order by total desc, user_id limit 100) t);
  end if;
  return (select coalesce(jsonb_agg(public.rank_face(p, me) || jsonb_build_object('score', w.score) order by w.score desc, w.user_id), '[]'::jsonb)
    from (select x.* from public.rank_weeks x join public.rank_players y on y.user_id = x.user_id
          where x.week = public.rank_week(d) and x.score > 0 and (not y.private or y.user_id = me)
          order by x.score desc, x.user_id limit 100) w
    join public.rank_players p on p.user_id = w.user_id);
end $$;

-- A board by a measure: only its members' days are added up.
create or replace function public.rank_board(board uuid, d date, metric text default 'all') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  wk date := public.rank_week(d);
  first_day boolean := d = public.rank_week(d);
begin
  perform public.rank_check_day(d);
  if metric not in ('all', 'pages', 'listen', 'surahs', 'reels') then raise exception 'No such measure' using errcode = '22023'; end if;
  if not exists (select 1 from public.rank_board_members where board_id = board and user_id = me) then
    raise exception 'Not on this board' using errcode = '42501';
  end if;
  if metric <> 'all' then
    return (select coalesce(jsonb_agg(public.rank_face(p, me) || jsonb_build_object('score', coalesce(x.v, 0)) order by coalesce(x.v, 0) desc, m.user_id), '[]'::jsonb)
      from public.rank_board_members m
      join public.rank_players p on p.user_id = m.user_id
      left join lateral (
        select (case metric when 'pages' then sum(y.pages) when 'listen' then sum(y.listen) / 60
                            when 'surahs' then sum(y.surahs) else sum(y.reels) end)::int as v
        from public.rank_days y where y.user_id = m.user_id and y.day between wk and wk + 6) x on true
      where m.board_id = board);
  end if;
  return (select coalesce(jsonb_agg(public.rank_face(r.p, me) || jsonb_build_object('score', r.score,
      'move', case when first_day then 0 else r.prev_p - r.now_p end) order by r.now_p), '[]'::jsonb)
    from (select s.*, row_number() over (order by s.score desc, s.uid) as now_p,
                 row_number() over (order by s.prev desc, s.score desc, s.uid) as prev_p
          from (select m.user_id as uid, p, coalesce(w.score, 0) as score,
                       coalesce(w.score, 0) - coalesce(x.score, 0) as prev
                from public.rank_board_members m
                join public.rank_players p on p.user_id = m.user_id
                left join public.rank_weeks w on w.user_id = m.user_id and w.week = wk
                left join public.rank_days x on x.user_id = m.user_id and x.day = d
                where m.board_id = board) s) r);
end $$;
