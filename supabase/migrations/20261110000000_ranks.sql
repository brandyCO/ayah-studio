-- Ranks (owner request 2026-11-09, CLAUDE.md Phase 8 M11): every player signed in with Google is on
-- the global board, plays a weekly league of up to 15 people at a similar level (top 3 move up a tier,
-- bottom 3 move down), and can make boards of their own (invite code, up to 50 people).
--
-- Fair by design: the app reports each day's totals of what it measures itself (pages counted after
-- their reading time, seconds of recitation played, surahs finished, reels exported). The server caps
-- them per day (60 pages, 3 h, 10 surahs, 3 reels), only lets them grow as fast as real time allows
-- since the last report (a page a minute, a second a second), never lets them go down, and works out
-- the score itself. Dhikr taps and Light are never ranked. Stored: a display name (≤ 24) and the
-- numbers; nobody reads the tables directly, only through the functions below.

create table if not exists public.rank_players (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 24),
  tier smallint not null default 0 check (tier between 0 and 4),
  total int not null default 0,
  last_report timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists rank_players_total on public.rank_players (total desc);

create table if not exists public.rank_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  pages smallint not null default 0,
  listen int not null default 0,
  surahs smallint not null default 0,
  reels smallint not null default 0,
  score int not null default 0,
  updated_at timestamptz,
  primary key (user_id, day)
);

create table if not exists public.rank_leagues (
  id uuid primary key default gen_random_uuid(),
  week date not null,
  tier smallint not null check (tier between 0 and 4),
  size smallint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists rank_leagues_open on public.rank_leagues (week, tier, size);

create table if not exists public.rank_weeks (
  user_id uuid not null references auth.users (id) on delete cascade,
  week date not null,
  score int not null default 0,
  league uuid references public.rank_leagues (id) on delete set null,
  primary key (user_id, week)
);
create index if not exists rank_weeks_score on public.rank_weeks (week, score desc);
create index if not exists rank_weeks_league on public.rank_weeks (league, score desc);

create table if not exists public.rank_boards (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (char_length(code) = 8),
  name text not null check (char_length(name) between 1 and 40),
  owner_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.rank_board_members (
  board_id uuid not null references public.rank_boards (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (board_id, user_id)
);
create index if not exists rank_board_members_user on public.rank_board_members (user_id);

alter table public.rank_players enable row level security;
alter table public.rank_days enable row level security;
alter table public.rank_leagues enable row level security;
alter table public.rank_weeks enable row level security;
alter table public.rank_boards enable row level security;
alter table public.rank_board_members enable row level security;
revoke all on table public.rank_players, public.rank_days, public.rank_leagues, public.rank_weeks,
  public.rank_boards, public.rank_board_members from anon, authenticated;

-- The score of one day: pages 10 each, 2 a minute listened, 30 a surah finished, 15 a reel, 20 for being active.
create or replace function public.rank_score(pages int, listen int, surahs int, reels int) returns int
language sql immutable set search_path = '' as $$
  select pages * 10 + (listen / 60) * 2 + surahs * 30 + reels * 15
    + case when pages + listen + surahs + reels > 0 then 20 else 0 end;
$$;

-- A Google account (not anonymous), or an error.
create or replace function public.rank_me() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Sign in with Google to join the ranks' using errcode = '42501';
  end if;
  return me;
end $$;

-- The week a day belongs to (Monday).
create or replace function public.rank_week(d date) returns date
language sql immutable set search_path = '' as $$ select date_trunc('week', d)::date $$;

-- A day the client may speak about: its own yesterday, today or tomorrow, whatever its time zone.
create or replace function public.rank_check_day(d date) returns void
language plpgsql stable set search_path = '' as $$
begin
  if d is null or d < current_date - 2 or d > current_date + 1 then
    raise exception 'Not a day that can be reported' using errcode = '22023';
  end if;
end $$;

-- Places the player in a league for `wk` (once): first the tier moves with last week's place, then
-- the first league of that week and tier with room, or a new one.
create or replace function public.rank_join_league(me uuid, wk date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  lg uuid;
  last record;
  t smallint;
begin
  select league into lg from public.rank_weeks where user_id = me and week = wk;
  if lg is not null then return lg; end if;
  select tier into t from public.rank_players where user_id = me for update;
  -- Last week's league: top 3 (with points) up, bottom 3 of a league of 8 or more down.
  select w.league, l.size,
         (select count(*) from public.rank_weeks o where o.league = w.league and (o.score > w.score or (o.score = w.score and o.user_id < w.user_id))) + 1 as place,
         w.score
    into last
    from public.rank_weeks w join public.rank_leagues l on l.id = w.league
    where w.user_id = me and w.week = wk - 7;
  if found then
    if last.place <= 3 and last.score > 0 then t := least(4, t + 1);
    elsif last.size >= 8 and last.place > last.size - 3 then t := greatest(0, t - 1);
    end if;
    update public.rank_players set tier = t where user_id = me;
  end if;
  select id into lg from public.rank_leagues where week = wk and tier = t and size < 15
    order by created_at limit 1 for update skip locked;
  if lg is null then
    insert into public.rank_leagues (week, tier) values (wk, t) returning id into lg;
  end if;
  update public.rank_leagues set size = size + 1 where id = lg;
  insert into public.rank_weeks (user_id, week, league) values (me, wk, lg)
    on conflict (user_id, week) do update set league = excluded.league;
  return lg;
end $$;

-- The app reports one day's totals. Returns the day's score as the server counts it.
create or replace function public.rank_report(d date, pages int, listen int, surahs int, reels int, my_name text)
returns int language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  p public.rank_players;
  old public.rank_days;
  secs int;
  np int; nl int; ns int; nr int; sc int;
begin
  perform public.rank_check_day(d);
  insert into public.rank_players (user_id, name) values (me, coalesce(public.clean_name(my_name, 24), 'Reader'))
    on conflict (user_id) do nothing;
  select * into p from public.rank_players where user_id = me for update;
  select * into old from public.rank_days where user_id = me and day = d for update;
  if not found then
    old.pages := 0; old.listen := 0; old.surahs := 0; old.reels := 0; old.score := 0;
  end if;
  -- A day is reported at most every 20 s; more often changes nothing.
  if old.updated_at > now() - interval '20 seconds' then return old.score; end if;
  secs := coalesce(extract(epoch from now() - coalesce(old.updated_at, p.last_report))::int, 3600);
  -- Never down; capped per day; grows only as fast as the time since the last report allows.
  np := greatest(old.pages, least(greatest(coalesce(pages, 0), 0), 60, old.pages + secs / 60 + 3));
  nl := greatest(old.listen, least(greatest(coalesce(listen, 0), 0), 10800, old.listen + secs + 300));
  ns := greatest(old.surahs, least(greatest(coalesce(surahs, 0), 0), 10, old.surahs + secs / 60 + 1));
  nr := greatest(old.reels, least(greatest(coalesce(reels, 0), 0), 3, old.reels + secs / 60 + 1));
  sc := public.rank_score(np, nl, ns, nr);
  insert into public.rank_days (user_id, day, pages, listen, surahs, reels, score, updated_at)
    values (me, d, np, nl, ns, nr, sc, now())
    on conflict (user_id, day) do update set pages = np, listen = nl, surahs = ns, reels = nr, score = sc, updated_at = now();
  perform public.rank_join_league(me, public.rank_week(d));
  update public.rank_weeks set score = score + (sc - old.score) where user_id = me and week = public.rank_week(d);
  update public.rank_players set total = total + (sc - old.score), last_report = now() where user_id = me;
  return sc;
end $$;

-- Change the name others see.
create or replace function public.rank_set_name(my_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.rank_me(); n text := public.clean_name(my_name, 24);
begin
  if n is null then raise exception 'A name is needed' using errcode = '22023'; end if;
  insert into public.rank_players (user_id, name) values (me, n) on conflict (user_id) do update set name = n;
end $$;

-- My place: name, tier, this week's score and global place, all-time total and place.
create or replace function public.rank_status(d date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  wk date;
  p public.rank_players;
  ws int;
begin
  perform public.rank_check_day(d);
  wk := public.rank_week(d);
  select * into p from public.rank_players where user_id = me;
  if not found then return null; end if;
  select score into ws from public.rank_weeks where user_id = me and week = wk;
  return jsonb_build_object(
    'name', p.name, 'tier', p.tier, 'total', p.total, 'week', coalesce(ws, 0),
    'weekPlace', case when ws is null then null else (select count(*) from public.rank_weeks where week = wk and score > ws) + 1 end,
    'weekPlayers', (select count(*) from public.rank_weeks where week = wk),
    'allPlace', (select count(*) from public.rank_players where total > p.total) + 1,
    'allPlayers', (select count(*) from public.rank_players));
end $$;

-- My league this week (joined on the first look or report), best first.
create or replace function public.rank_league(d date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  lg uuid;
begin
  perform public.rank_check_day(d);
  if not exists (select 1 from public.rank_players where user_id = me) then return null; end if;
  lg := public.rank_join_league(me, public.rank_week(d));
  return jsonb_build_object(
    'tier', (select tier from public.rank_leagues where id = lg),
    'players', (select coalesce(jsonb_agg(jsonb_build_object('name', p.name, 'score', w.score, 'me', w.user_id = me)
       order by w.score desc, w.user_id), '[]'::jsonb)
       from public.rank_weeks w join public.rank_players p on p.user_id = w.user_id where w.league = lg));
end $$;

-- The global board: the top 100 this week (all = false) or of all time.
create or replace function public.rank_global(d date, all_time boolean) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := public.rank_me();
begin
  perform public.rank_check_day(d);
  if all_time then
    return (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'score', total, 'tier', tier, 'me', user_id = me) order by total desc, user_id), '[]'::jsonb)
      from (select * from public.rank_players where total > 0 order by total desc, user_id limit 100) t);
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('name', p.name, 'score', w.score, 'tier', p.tier, 'me', w.user_id = me) order by w.score desc, w.user_id), '[]'::jsonb)
    from (select * from public.rank_weeks where week = public.rank_week(d) and score > 0 order by score desc, user_id limit 100) w
    join public.rank_players p on p.user_id = w.user_id);
end $$;

-- Boards of the player's own: up to 10 made, 20 joined, 50 people each.
create or replace function public.rank_create_board(board_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  n text := public.clean_name(board_name, 40);
  c text;
  b uuid;
begin
  if n is null then raise exception 'A name is needed' using errcode = '22023'; end if;
  if not exists (select 1 from public.rank_players where user_id = me) then
    raise exception 'Read or listen once to join the ranks first' using errcode = '22023';
  end if;
  if (select count(*) from public.rank_boards where owner_id = me) >= 10 then raise exception 'You can make 10 boards'; end if;
  if (select count(*) from public.rank_board_members where user_id = me) >= 20 then raise exception 'You can be on 20 boards'; end if;
  loop
    select string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', 1 + get_byte(x, i) % 31, 1), '' order by i) into c
      from (select decode(replace(gen_random_uuid()::text, '-', ''), 'hex') x) u, generate_series(0, 7) i;
    exit when not exists (select 1 from public.rank_boards where code = c);
  end loop;
  insert into public.rank_boards (code, name, owner_id) values (c, n, me) returning id into b;
  insert into public.rank_board_members (board_id, user_id) values (b, me);
  return jsonb_build_object('id', b, 'code', c);
end $$;

create or replace function public.rank_board_preview(board_code text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('name', b.name, 'members', (select count(*) from public.rank_board_members m where m.board_id = b.id),
    'joined', exists (select 1 from public.rank_board_members m where m.board_id = b.id and m.user_id = auth.uid()))
  from public.rank_boards b where b.code = lower(board_code);
$$;

create or replace function public.rank_join_board(board_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  b uuid;
begin
  select id into b from public.rank_boards where code = lower(board_code) for update;
  if b is null then raise exception 'This invite is not valid' using errcode = 'P0002'; end if;
  if exists (select 1 from public.rank_board_members where board_id = b and user_id = me) then return b; end if;
  if not exists (select 1 from public.rank_players where user_id = me) then
    raise exception 'Read or listen once to join the ranks first' using errcode = '22023';
  end if;
  if (select count(*) from public.rank_board_members where board_id = b) >= 50 then raise exception 'This board is full (50 people)'; end if;
  if (select count(*) from public.rank_board_members where user_id = me) >= 20 then raise exception 'You can be on 20 boards'; end if;
  insert into public.rank_board_members (board_id, user_id) values (b, me);
  return b;
end $$;

-- Leaving: the owner leaving deletes the board.
create or replace function public.rank_leave_board(board uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.rank_me();
begin
  if exists (select 1 from public.rank_boards where id = board and owner_id = me) then
    delete from public.rank_boards where id = board;
  else
    delete from public.rank_board_members where board_id = board and user_id = me;
  end if;
end $$;

-- My boards, with their codes and sizes.
create or replace function public.rank_my_boards() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'code', b.code, 'mine', b.owner_id = auth.uid(),
    'members', (select count(*) from public.rank_board_members x where x.board_id = b.id)) order by m.joined_at), '[]'::jsonb)
  from public.rank_board_members m join public.rank_boards b on b.id = m.board_id where m.user_id = auth.uid();
$$;

-- One board this week, best first (members only).
create or replace function public.rank_board(board uuid, d date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := public.rank_me();
begin
  perform public.rank_check_day(d);
  if not exists (select 1 from public.rank_board_members where board_id = board and user_id = me) then
    raise exception 'Not on this board' using errcode = '42501';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('name', p.name, 'score', coalesce(w.score, 0), 'tier', p.tier, 'me', m.user_id = me)
      order by coalesce(w.score, 0) desc, m.user_id), '[]'::jsonb)
    from public.rank_board_members m
    join public.rank_players p on p.user_id = m.user_id
    left join public.rank_weeks w on w.user_id = m.user_id and w.week = public.rank_week(d)
    where m.board_id = board);
end $$;

revoke all on function public.rank_score(int, int, int, int) from public, anon, authenticated;
revoke all on function public.rank_me() from public, anon, authenticated;
revoke all on function public.rank_week(date) from public, anon, authenticated;
revoke all on function public.rank_check_day(date) from public, anon, authenticated;
revoke all on function public.rank_join_league(uuid, date) from public, anon, authenticated;
revoke all on function public.rank_report(date, int, int, int, int, text) from public, anon;
grant execute on function public.rank_report(date, int, int, int, int, text) to authenticated;
revoke all on function public.rank_set_name(text) from public, anon;
grant execute on function public.rank_set_name(text) to authenticated;
revoke all on function public.rank_status(date) from public, anon;
grant execute on function public.rank_status(date) to authenticated;
revoke all on function public.rank_league(date) from public, anon;
grant execute on function public.rank_league(date) to authenticated;
revoke all on function public.rank_global(date, boolean) from public, anon;
grant execute on function public.rank_global(date, boolean) to authenticated;
revoke all on function public.rank_create_board(text) from public, anon;
grant execute on function public.rank_create_board(text) to authenticated;
revoke all on function public.rank_board_preview(text) from public;
grant execute on function public.rank_board_preview(text) to anon, authenticated;
revoke all on function public.rank_join_board(text) from public, anon;
grant execute on function public.rank_join_board(text) to authenticated;
revoke all on function public.rank_leave_board(uuid) from public, anon;
grant execute on function public.rank_leave_board(uuid) to authenticated;
revoke all on function public.rank_my_boards() from public, anon;
grant execute on function public.rank_my_boards() to authenticated;
revoke all on function public.rank_board(uuid, date) from public, anon;
grant execute on function public.rank_board(uuid, date) to authenticated;
