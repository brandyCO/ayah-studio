-- Friends (owner request 2026-11-11): tapping a player on the league opens a small profile (what that player chose to
-- show, both characters side by side); players can become friends (asked from a profile and accepted, or at once through
-- the friend's invite link), and two friends keep a friend streak: the days in a row on which both earned points.
-- XP (owner decision the same day): a player's all-time points (`total`) are their XP and give their character its
-- level; rank_face now carries it.
-- Every player gets a public id (`pid`, random, says nothing about them) shown with their row unless they are private.
-- Nobody reads the tables directly.
alter table public.rank_players add column if not exists pid text;
update public.rank_players set pid = substr(md5(random()::text || user_id::text || clock_timestamp()::text), 1, 10) where pid is null;
alter table public.rank_players alter column pid set default substr(md5(random()::text || clock_timestamp()::text), 1, 10);
alter table public.rank_players alter column pid set not null;
create unique index if not exists rank_players_pid on public.rank_players (pid);
-- What the profile shows (bits): 1 this week's points, 2 the flame streak, 4 trophies, 8 pages this week, 16 listening.
alter table public.rank_players add column if not exists show smallint not null default 7 check (show between 0 and 31);
-- The flame streak as the app last reported it (shown only; it earns nothing).
alter table public.rank_players add column if not exists streak smallint not null default 0 check (streak between 0 and 9999);
-- The player's friend invite code (#/rf/{code}).
alter table public.rank_players add column if not exists invite text;
create unique index if not exists rank_players_invite on public.rank_players (invite);

create table if not exists public.rank_friends (
  a uuid not null references auth.users (id) on delete cascade,
  b uuid not null references auth.users (id) on delete cascade,
  since date not null default current_date,
  primary key (a, b),
  check (a < b)
);
create index if not exists rank_friends_b on public.rank_friends (b);
create table if not exists public.rank_friend_asks (
  from_id uuid not null references auth.users (id) on delete cascade,
  to_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now(),
  primary key (from_id, to_id)
);
create index if not exists rank_friend_asks_to on public.rank_friend_asks (to_id);
alter table public.rank_friends enable row level security;
alter table public.rank_friend_asks enable row level security;
revoke all on table public.rank_friends, public.rank_friend_asks from anon, authenticated;

create or replace function public.rank_face(p public.rank_players, me uuid) returns jsonb
language sql immutable set search_path = '' as $$
  select case when p.private and p.user_id <> me
    then jsonb_build_object('name', null, 'private', true, 'avatar', null, 'frame', 0, 'figure', null, 'room', null, 'tier', p.tier, 'me', false, 'pid', null, 'xp', null)
    else jsonb_build_object('name', p.name, 'avatar', p.avatar, 'frame', p.frame, 'figure', p.figure, 'room', p.room, 'tier', p.tier,
      'me', p.user_id = me, 'pid', p.pid, 'xp', p.total) end;
$$;

create or replace function public.rank_is_friend(x uuid, y uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.rank_friends where a = least(x, y) and b = greatest(x, y));
$$;

-- The friend streak on day d: the days in a row both earned points, counting today once both have (else up to yesterday).
create or replace function public.rank_friend_streak(x uuid, y uuid, d date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  mine boolean := exists (select 1 from public.rank_days where user_id = x and day = d and score > 0);
  theirs boolean := exists (select 1 from public.rank_days where user_id = y and day = d and score > 0);
  want date := case when mine and theirs then d else d - 1 end;
  n int := 0;
  dd date;
begin
  for dd in select p.day from public.rank_days p join public.rank_days q on q.day = p.day and q.user_id = y and q.score > 0
            where p.user_id = x and p.score > 0 and p.day <= want order by p.day desc limit 2000 loop
    exit when dd <> want;
    n := n + 1;
    want := want - 1;
  end loop;
  return jsonb_build_object('streak', n, 'meToday', mine, 'themToday', theirs);
end $$;

create or replace function public.rank_by_pid(who text) returns uuid
language sql stable security definer set search_path = '' as $$
  select user_id from public.rank_players where pid = who;
$$;

-- A player's profile: their face, what they chose to show, and how they stand with you.
create or replace function public.rank_profile(who text, d date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  p public.rank_players;
  wk date := public.rank_week(d);
  rel text;
  out jsonb;
begin
  perform public.rank_check_day(d);
  select * into p from public.rank_players where pid = who;
  if p.user_id is null or (p.private and p.user_id <> me) then return null; end if;
  rel := case when p.user_id = me then 'me'
    when public.rank_is_friend(me, p.user_id) then 'friend'
    when exists (select 1 from public.rank_friend_asks where from_id = me and to_id = p.user_id) then 'sent'
    when exists (select 1 from public.rank_friend_asks where from_id = p.user_id and to_id = me) then 'asked'
    else 'none' end;
  out := public.rank_face(p, me) || jsonb_build_object('relation', rel, 'show', p.show, 'bestTier', p.best_tier);
  if p.show & 1 = 1 or rel = 'me' then
    out := out || jsonb_build_object('week', coalesce((select score from public.rank_weeks where user_id = p.user_id and week = wk), 0));
  end if;
  if p.show & 2 = 2 or rel = 'me' then out := out || jsonb_build_object('streak', p.streak); end if;
  if p.show & 4 = 4 or rel = 'me' then
    out := out || jsonb_build_object('trophies', (select count(*) from public.rank_prizes where user_id = p.user_id and place is not null));
  end if;
  if p.show & 8 = 8 or rel = 'me' then
    out := out || jsonb_build_object('pages', (select coalesce(sum(pages), 0) from public.rank_days where user_id = p.user_id and day between wk and d));
  end if;
  if p.show & 16 = 16 or rel = 'me' then
    out := out || jsonb_build_object('listen', (select coalesce(sum(listen), 0) / 60 from public.rank_days where user_id = p.user_id and day between wk and d));
  end if;
  if rel = 'friend' then out := out || jsonb_build_object('friend', public.rank_friend_streak(me, p.user_id, d)); end if;
  return out;
end $$;

-- What your profile shows, and your flame streak as the app counts it.
create or replace function public.rank_set_profile(show_bits int, my_streak int) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.rank_me();
begin
  if show_bits is null or show_bits < 0 or show_bits > 31 then raise exception 'Bad choice' using errcode = '22023'; end if;
  update public.rank_players set show = show_bits, streak = greatest(0, least(9999, coalesce(my_streak, 0))) where user_id = me;
end $$;

create or replace function public.rank_make_friends(x uuid, y uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if x = y then raise exception 'That is you' using errcode = '22023'; end if;
  if (select count(*) from public.rank_friends where a = x or b = x) >= 100
    or (select count(*) from public.rank_friends where a = y or b = y) >= 100 then
    raise exception 'Too many friends' using errcode = '22023';
  end if;
  insert into public.rank_friends (a, b) values (least(x, y), greatest(x, y)) on conflict do nothing;
  delete from public.rank_friend_asks where (from_id = x and to_id = y) or (from_id = y and to_id = x);
end $$;

-- Ask a player to be friends; if they had asked you already, you are friends at once.
create or replace function public.rank_friend_ask(who text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  them uuid;
begin
  select user_id into them from public.rank_players where pid = who and (not private or user_id = me);
  if them is null then raise exception 'No such player' using errcode = 'P0002'; end if;
  if them = me then raise exception 'That is you' using errcode = '22023'; end if;
  if public.rank_is_friend(me, them) then return 'friend'; end if;
  if exists (select 1 from public.rank_friend_asks where from_id = them and to_id = me) then
    perform public.rank_make_friends(me, them);
    return 'friend';
  end if;
  if (select count(*) from public.rank_friend_asks where from_id = me) >= 30 then raise exception 'Too many asks waiting' using errcode = '22023'; end if;
  if (select count(*) from public.rank_friend_asks where from_id = me and at > now() - interval '1 day') >= 20 then
    raise exception 'Enough for today' using errcode = '22023';
  end if;
  insert into public.rank_friend_asks (from_id, to_id) values (me, them) on conflict do nothing;
  return 'sent';
end $$;

-- Accept (true) or decline (false) a player's ask.
create or replace function public.rank_friend_answer(who text, ok boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  them uuid := public.rank_by_pid(who);
begin
  if them is null or not exists (select 1 from public.rank_friend_asks where from_id = them and to_id = me) then
    raise exception 'No such ask' using errcode = 'P0002';
  end if;
  if ok then perform public.rank_make_friends(me, them);
  else delete from public.rank_friend_asks where from_id = them and to_id = me; end if;
end $$;

-- Stop being friends, or take back an ask.
create or replace function public.rank_friend_remove(who text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  them uuid := public.rank_by_pid(who);
begin
  if them is null then return; end if;
  delete from public.rank_friends where a = least(me, them) and b = greatest(me, them);
  delete from public.rank_friend_asks where from_id = me and to_id = them;
end $$;

-- Your invite code (made the first time): whoever opens the link and accepts becomes your friend at once.
create or replace function public.rank_friend_invite() returns text
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  c text;
begin
  select invite into c from public.rank_players where user_id = me;
  if not found then raise exception 'Not playing yet' using errcode = '22023'; end if;
  if c is null then
    c := substr(md5(random()::text || me::text || clock_timestamp()::text), 1, 10);
    update public.rank_players set invite = c where user_id = me;
  end if;
  return c;
end $$;

create or replace function public.rank_friend_invite_preview(code text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('name', p.name, 'avatar', p.avatar, 'frame', p.frame, 'figure', p.figure, 'tier', p.tier,
    'mine', p.user_id = auth.uid(), 'friend', auth.uid() is not null and public.rank_is_friend(auth.uid(), p.user_id))
  from public.rank_players p where p.invite = lower(code);
$$;

create or replace function public.rank_friend_join(code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  p public.rank_players;
begin
  select * into p from public.rank_players where invite = lower(code);
  if p.user_id is null then raise exception 'No such invite' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.rank_players where user_id = me) then raise exception 'Not playing yet' using errcode = '22023'; end if;
  perform public.rank_make_friends(me, p.user_id);
  return public.rank_face(p, me);
end $$;

-- Your friends (with each friend streak and who has earned points today), and the asks waiting for you.
create or replace function public.rank_my_friends(d date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  wk date := public.rank_week(d);
begin
  perform public.rank_check_day(d);
  return jsonb_build_object(
    'friends', (select coalesce(jsonb_agg(public.rank_face(p, me) || jsonb_build_object('since', f.since,
        'week', coalesce((select score from public.rank_weeks w where w.user_id = p.user_id and w.week = wk), 0))
        || public.rank_friend_streak(me, p.user_id, d) order by p.name), '[]'::jsonb)
      from public.rank_friends f join public.rank_players p on p.user_id = case when f.a = me then f.b else f.a end
      where f.a = me or f.b = me),
    'asks', (select coalesce(jsonb_agg(public.rank_face(p, me) || jsonb_build_object('pid', p.pid) order by k.at desc), '[]'::jsonb)
      from public.rank_friend_asks k join public.rank_players p on p.user_id = k.from_id where k.to_id = me),
    'sent', (select coalesce(jsonb_agg(p.pid), '[]'::jsonb)
      from public.rank_friend_asks k join public.rank_players p on p.user_id = k.to_id where k.from_id = me));
end $$;

revoke all on function public.rank_is_friend(uuid, uuid) from public, anon, authenticated;
revoke all on function public.rank_friend_streak(uuid, uuid, date) from public, anon, authenticated;
revoke all on function public.rank_by_pid(text) from public, anon, authenticated;
revoke all on function public.rank_make_friends(uuid, uuid) from public, anon, authenticated;
revoke all on function public.rank_profile(text, date) from public, anon;
revoke all on function public.rank_set_profile(int, int) from public, anon;
revoke all on function public.rank_friend_ask(text) from public, anon;
revoke all on function public.rank_friend_answer(text, boolean) from public, anon;
revoke all on function public.rank_friend_remove(text) from public, anon;
revoke all on function public.rank_friend_invite() from public, anon;
revoke all on function public.rank_friend_join(text) from public, anon;
revoke all on function public.rank_my_friends(date) from public, anon;
grant execute on function public.rank_profile(text, date), public.rank_set_profile(int, int), public.rank_friend_ask(text),
  public.rank_friend_answer(text, boolean), public.rank_friend_remove(text), public.rank_friend_invite(), public.rank_friend_join(text),
  public.rank_my_friends(date) to authenticated;
grant execute on function public.rank_friend_invite_preview(text) to anon, authenticated;
