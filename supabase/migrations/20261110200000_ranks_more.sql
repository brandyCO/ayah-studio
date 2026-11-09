-- Ranks, second pass (owner go-ahead 2026-11-09): avatars (drawn in the app, no photos), private mode,
-- a board for each measure (pages, listening, surahs, reels) next to the overall score, a weekly quest
-- the server can check, the rival just above you, last week's result, and a shared goal per board.

alter table public.rank_players add column if not exists avatar smallint not null default 0 check (avatar between 0 and 23);
-- Private: others see "A reader" without an avatar, and the player is left off the global board.
alter table public.rank_players add column if not exists private boolean not null default false;
alter table public.rank_weeks add column if not exists quest_done boolean not null default false;
alter table public.rank_boards add column if not exists goal int check (goal between 1 and 100000);
create index if not exists rank_days_day on public.rank_days (day);

-- What others see of a player.
create or replace function public.rank_face(p public.rank_players, me uuid) returns jsonb
language sql immutable set search_path = '' as $$
  select case when p.private and p.user_id <> me
    then jsonb_build_object('name', null, 'private', true, 'avatar', null, 'tier', p.tier, 'me', false)
    else jsonb_build_object('name', p.name, 'avatar', p.avatar, 'tier', p.tier, 'me', p.user_id = me) end;
$$;

-- This week's quest, the same for everyone: one of four, in turn. Bonus 50 points once.
create or replace function public.rank_quest(me uuid, wk date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  k int := (((wk - date '2026-11-09') / 7) % 4 + 4) % 4;
  kind text := (array['pages', 'listen', 'days', 'surahs'])[k + 1];
  target int := (array[50, 60, 5, 2])[k + 1];
  v int;
begin
  select case kind when 'pages' then coalesce(sum(pages), 0)
                   when 'listen' then coalesce(sum(listen), 0) / 60
                   when 'days' then count(*) filter (where score > 0)
                   else coalesce(sum(surahs), 0) end
    into v from public.rank_days where user_id = me and day between wk and wk + 6;
  return jsonb_build_object('kind', kind, 'target', target, 'done', least(v, target), 'bonus', 50);
end $$;

-- rank_report as before, plus the quest bonus once it is met.
create or replace function public.rank_report(d date, pages int, listen int, surahs int, reels int, my_name text)
returns int language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  p public.rank_players;
  old public.rank_days;
  secs int;
  np int; nl int; ns int; nr int; sc int;
  wk date := public.rank_week(d);
  q jsonb;
begin
  perform public.rank_check_day(d);
  insert into public.rank_players (user_id, name) values (me, coalesce(public.clean_name(my_name, 24), 'Reader'))
    on conflict (user_id) do nothing;
  select * into p from public.rank_players where user_id = me for update;
  select * into old from public.rank_days where user_id = me and day = d for update;
  if not found then
    old.pages := 0; old.listen := 0; old.surahs := 0; old.reels := 0; old.score := 0;
  end if;
  if old.updated_at > now() - interval '20 seconds' then return old.score; end if;
  secs := coalesce(extract(epoch from now() - coalesce(old.updated_at, p.last_report))::int, 3600);
  np := greatest(old.pages, least(greatest(coalesce(pages, 0), 0), 60, old.pages + secs / 60 + 3));
  nl := greatest(old.listen, least(greatest(coalesce(listen, 0), 0), 10800, old.listen + secs + 300));
  ns := greatest(old.surahs, least(greatest(coalesce(surahs, 0), 0), 10, old.surahs + secs / 60 + 1));
  nr := greatest(old.reels, least(greatest(coalesce(reels, 0), 0), 3, old.reels + secs / 60 + 1));
  sc := public.rank_score(np, nl, ns, nr);
  insert into public.rank_days (user_id, day, pages, listen, surahs, reels, score, updated_at)
    values (me, d, np, nl, ns, nr, sc, now())
    on conflict (user_id, day) do update set pages = np, listen = nl, surahs = ns, reels = nr, score = sc, updated_at = now();
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

create or replace function public.rank_set_look(my_avatar int, is_private boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.rank_me();
begin
  if my_avatar is null or my_avatar not between 0 and 23 then raise exception 'No such avatar' using errcode = '22023'; end if;
  update public.rank_players set avatar = my_avatar, private = coalesce(is_private, false) where user_id = me;
  if not found then raise exception 'Not playing yet' using errcode = '22023'; end if;
end $$;

-- My place, plus avatar, private, this week's quest, the rival just above me in my league and last week's result.
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
    'name', p.name, 'tier', p.tier, 'avatar', p.avatar, 'private', p.private, 'total', p.total, 'week', coalesce(ws, 0),
    'weekPlace', case when ws is null then null else (select count(*) from public.rank_weeks where week = wk and score > ws) + 1 end,
    'weekPlayers', (select count(*) from public.rank_weeks where week = wk),
    'allPlace', (select count(*) from public.rank_players where total > p.total) + 1,
    'allPlayers', (select count(*) from public.rank_players),
    'quest', public.rank_quest(me, wk) || jsonb_build_object('complete', (select quest_done from public.rank_weeks where user_id = me and week = wk)),
    'rival', rival, 'last', last, 'weekStart', wk);
end $$;

-- The league, with avatars and private players hidden.
create or replace function public.rank_league(d date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  lg uuid;
  first_day boolean := d = public.rank_week(d);
begin
  perform public.rank_check_day(d);
  if not exists (select 1 from public.rank_players where user_id = me) then return null; end if;
  lg := public.rank_join_league(me, public.rank_week(d));
  return jsonb_build_object(
    'tier', (select tier from public.rank_leagues where id = lg),
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

-- A measure's weekly numbers for some players (listening in minutes).
create or replace function public.rank_measure(metric text, d date) returns table (uid uuid, v int)
language sql stable security definer set search_path = '' as $$
  select user_id, (case metric when 'pages' then sum(pages) when 'listen' then sum(listen) / 60
                               when 'surahs' then sum(surahs) else sum(reels) end)::int
  from public.rank_days where day between public.rank_week(d) and public.rank_week(d) + 6 group by user_id;
$$;

drop function if exists public.rank_global(date, boolean);
create or replace function public.rank_global(d date, all_time boolean, metric text default 'all') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := public.rank_me();
begin
  perform public.rank_check_day(d);
  if metric not in ('all', 'pages', 'listen', 'surahs', 'reels') then raise exception 'No such measure' using errcode = '22023'; end if;
  if metric <> 'all' then
    return (select coalesce(jsonb_agg(public.rank_face(p, me) || jsonb_build_object('score', m.v) order by m.v desc, m.uid), '[]'::jsonb)
      from (select * from public.rank_measure(metric, d) x where x.v > 0 order by x.v desc, x.uid limit 100) m
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

drop function if exists public.rank_board(uuid, date);
create or replace function public.rank_board(board uuid, d date, metric text default 'all') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
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
      left join (select * from public.rank_measure(metric, d)) x on x.uid = m.user_id
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
                left join public.rank_weeks w on w.user_id = m.user_id and w.week = public.rank_week(d)
                left join public.rank_days x on x.user_id = m.user_id and x.day = d
                where m.board_id = board) s) r);
end $$;

-- A board's shared goal: pages read together this week (the owner sets it).
create or replace function public.rank_set_board_goal(board uuid, pages int) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.rank_me();
begin
  if pages is not null and pages not between 1 and 100000 then raise exception 'Not a goal' using errcode = '22023'; end if;
  update public.rank_boards set goal = pages where id = board and owner_id = me;
  if not found then raise exception 'Only the board''s owner can set its goal' using errcode = '42501'; end if;
end $$;

create or replace function public.rank_board_goal(board uuid, d date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := public.rank_me();
begin
  perform public.rank_check_day(d);
  if not exists (select 1 from public.rank_board_members where board_id = board and user_id = me) then
    raise exception 'Not on this board' using errcode = '42501';
  end if;
  return (select jsonb_build_object('goal', b.goal,
      'pages', (select coalesce(sum(x.pages), 0) from public.rank_days x join public.rank_board_members m on m.user_id = x.user_id
                where m.board_id = board and x.day between public.rank_week(d) and public.rank_week(d) + 6))
    from public.rank_boards b where b.id = board);
end $$;

revoke all on function public.rank_face(public.rank_players, uuid) from public, anon, authenticated;
revoke all on function public.rank_quest(uuid, date) from public, anon, authenticated;
revoke all on function public.rank_measure(text, date) from public, anon, authenticated;
revoke all on function public.rank_set_look(int, boolean) from public, anon;
revoke all on function public.rank_global(date, boolean, text) from public, anon;
revoke all on function public.rank_board(uuid, date, text) from public, anon;
revoke all on function public.rank_set_board_goal(uuid, int) from public, anon;
revoke all on function public.rank_board_goal(uuid, date) from public, anon;
grant execute on function public.rank_set_look(int, boolean) to authenticated;
grant execute on function public.rank_global(date, boolean, text) to authenticated;
grant execute on function public.rank_board(uuid, date, text) to authenticated;
grant execute on function public.rank_set_board_goal(uuid, int) to authenticated;
grant execute on function public.rank_board_goal(uuid, date) to authenticated;
