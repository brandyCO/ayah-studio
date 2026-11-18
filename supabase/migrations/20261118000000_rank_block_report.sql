-- Report and block players (owner request 2026-11-18, for App Store guideline 1.2: people see each other's names and
-- characters on Ranks, so each must be able to report a player and block them).
-- Block: the blocked player is shown to the blocker only as "Blocked player" (no name, character, avatar or room) on
-- every board, profile and list that goes through rank_face; their friendship and asks end, and nothing more can pass
-- between the two in either direction (friend asks, friends, challenges, gestures, gifts, MashaAllahs): table triggers
-- refuse it. Report: a reason and an optional note, kept where only the owner reads them (view rank_player_reports_v);
-- a name reported by 3 different players within 30 days becomes "Reader" at once (the player can choose a new one).
-- Nobody reads the tables directly.
create table if not exists public.rank_blocks (
  blocker uuid not null references auth.users (id) on delete cascade,
  blocked uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
create index if not exists rank_blocks_blocked on public.rank_blocks (blocked);
create table if not exists public.rank_player_reports (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  reporter uuid not null references auth.users (id) on delete cascade,
  reported uuid not null references auth.users (id) on delete cascade,
  reason text not null check (reason in ('name', 'character', 'spam', 'other')),
  note text check (note is null or length(note) <= 500),
  -- What the reported player showed when reported (their name may change or be cleared later).
  shown jsonb not null default '{}'::jsonb,
  status text not null default 'new' check (status in ('new', 'seen', 'acted', 'dismissed'))
);
create index if not exists rank_player_reports_reported on public.rank_player_reports (reported, at);
create index if not exists rank_player_reports_reporter on public.rank_player_reports (reporter, at);
alter table public.rank_blocks enable row level security;
alter table public.rank_player_reports enable row level security;
revoke all on table public.rank_blocks, public.rank_player_reports from anon, authenticated;

create or replace function public.rank_blocked(x uuid, y uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.rank_blocks where (blocker = x and blocked = y) or (blocker = y and blocked = x));
$$;
revoke all on function public.rank_blocked(uuid, uuid) from public, anon, authenticated;

-- How a player appears to `me`: blocked ones keep only their place in a list and their public id (to unblock).
create or replace function public.rank_face(p public.rank_players, me uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case
    when p.user_id <> me and exists (select 1 from public.rank_blocks b where b.blocker = me and b.blocked = p.user_id)
      then jsonb_build_object('name', null, 'private', false, 'blocked', true, 'avatar', null, 'frame', 0, 'figure', null, 'room', null,
        'tier', p.tier, 'me', false, 'pid', p.pid, 'xp', null, 'lamp', 0)
    when p.private and p.user_id <> me
      then jsonb_build_object('name', null, 'private', true, 'avatar', null, 'frame', 0, 'figure', null, 'room', null, 'tier', p.tier, 'me', false, 'pid', null, 'xp', null, 'lamp', 0)
    else jsonb_build_object('name', p.name, 'avatar', p.avatar, 'frame', p.frame, 'figure', p.figure, 'room', p.room, 'tier', p.tier,
      'me', p.user_id = me, 'pid', p.pid, 'xp', p.total, 'lamp', p.lamp) end;
$$;

-- Nothing passes between a blocked pair, whichever function tries.
create or replace function public.rank_block_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare x uuid; y uuid;
begin
  case tg_table_name
    when 'rank_friend_asks' then x := new.from_id; y := new.to_id;
    when 'rank_friends' then x := new.a; y := new.b;
    when 'rank_gifts' then x := new.from_id; y := new.to_id;
    when 'rank_challenges' then x := new.a; y := new.b;
    when 'rank_cheers' then
      x := new.sender;
      select case when c.a = new.sender then c.b else c.a end into y from public.rank_challenges c where c.id = new.ch;
    when 'rank_feat_cheers' then
      x := new.user_id;
      select f.user_id into y from public.rank_feats f where f.id = new.feat;
  end case;
  if x is not null and y is not null and public.rank_blocked(x, y) then
    raise exception 'Not possible with this player' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.rank_block_guard() from public, anon, authenticated;
drop trigger if exists rank_block_guard on public.rank_friend_asks;
create trigger rank_block_guard before insert on public.rank_friend_asks for each row execute function public.rank_block_guard();
drop trigger if exists rank_block_guard on public.rank_friends;
create trigger rank_block_guard before insert on public.rank_friends for each row execute function public.rank_block_guard();
drop trigger if exists rank_block_guard on public.rank_gifts;
create trigger rank_block_guard before insert on public.rank_gifts for each row execute function public.rank_block_guard();
drop trigger if exists rank_block_guard on public.rank_challenges;
create trigger rank_block_guard before insert or update of b on public.rank_challenges for each row execute function public.rank_block_guard();
drop trigger if exists rank_block_guard on public.rank_cheers;
create trigger rank_block_guard before insert on public.rank_cheers for each row execute function public.rank_block_guard();
drop trigger if exists rank_block_guard on public.rank_feat_cheers;
create trigger rank_block_guard before insert on public.rank_feat_cheers for each row execute function public.rank_block_guard();

-- Block a player: friendship, asks and challenges not yet started between the two end; unopened gifts from them go.
create or replace function public.rank_block(who text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  them uuid := public.rank_by_pid(who);
begin
  if them is null then raise exception 'No such player' using errcode = 'P0002'; end if;
  if them = me then raise exception 'That is you' using errcode = '22023'; end if;
  if (select count(*) from public.rank_blocks where blocker = me) >= 500 then raise exception 'Too many blocked' using errcode = '22023'; end if;
  insert into public.rank_blocks (blocker, blocked) values (me, them) on conflict do nothing;
  delete from public.rank_friends where a = least(me, them) and b = greatest(me, them);
  delete from public.rank_friend_asks where (from_id = me and to_id = them) or (from_id = them and to_id = me);
  delete from public.rank_challenges where ((a = me and b = them) or (a = them and b = me)) and start is null;
  delete from public.rank_gifts where from_id = them and to_id = me and opened_at is null;
end $$;

create or replace function public.rank_unblock(who text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  them uuid := public.rank_by_pid(who);
begin
  if them is null then return; end if;
  delete from public.rank_blocks where blocker = me and blocked = them;
end $$;

-- The players I blocked, newest first (for Me → Settings → Blocked players). Their name is shown here so the list
-- can be read; they stay hidden everywhere else.
create or replace function public.rank_my_blocks() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('pid', p.pid, 'name', p.name, 'at', b.at) order by b.at desc), '[]'::jsonb)
  from public.rank_blocks b join public.rank_players p on p.user_id = b.blocked
  where b.blocker = public.rank_me();
$$;

-- Report a player. 20 reports a day each; one report a day per player reported.
create or replace function public.rank_report_player(who text, why text, note text) returns void
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  me uuid := public.rank_me();
  p public.rank_players;
begin
  select * into p from public.rank_players where pid = who;
  if p.user_id is null then raise exception 'No such player' using errcode = 'P0002'; end if;
  if p.user_id = me then raise exception 'That is you' using errcode = '22023'; end if;
  if why is null or why not in ('name', 'character', 'spam', 'other') then raise exception 'Bad reason' using errcode = '22023'; end if;
  note := nullif(btrim(coalesce(note, '')), '');
  if note is not null and length(note) > 500 then raise exception 'Note too long' using errcode = '22023'; end if;
  if (select count(*) from public.rank_player_reports where reporter = me and at > now() - interval '1 day') >= 20 then
    raise exception 'Enough for today' using errcode = '54000';
  end if;
  if exists (select 1 from public.rank_player_reports where reporter = me and reported = p.user_id and at > now() - interval '1 day') then
    return;
  end if;
  insert into public.rank_player_reports (reporter, reported, reason, note, shown)
    values (me, p.user_id, why, note, jsonb_build_object('name', p.name, 'figure', p.figure, 'avatar', p.avatar, 'pid', p.pid));
  -- A name three different players reported this month becomes "Reader"; the player can choose a new one.
  if why = 'name' and p.name <> 'Reader' and (select count(distinct reporter) from public.rank_player_reports
      where reported = p.user_id and reason = 'name' and at > now() - interval '30 days' and shown->>'name' = p.name) >= 3 then
    update public.rank_players set name = 'Reader' where user_id = p.user_id;
  end if;
end $$;

-- For the owner (Supabase SQL editor or the service role): every report with who was reported and how often.
create or replace view public.rank_player_reports_v with (security_invoker = true) as
  select r.id, r.at, r.reason, r.note, r.status, r.shown->>'name' as name_then, p.name as name_now, p.pid,
    (select count(*) from public.rank_player_reports x where x.reported = r.reported) as reports_of_player,
    (select count(*) from public.rank_blocks b where b.blocked = r.reported) as blocked_by
  from public.rank_player_reports r left join public.rank_players p on p.user_id = r.reported
  order by r.at desc;
revoke all on public.rank_player_reports_v from anon, authenticated;

revoke all on function public.rank_block(text), public.rank_unblock(text), public.rank_my_blocks(), public.rank_report_player(text, text, text)
  from public, anon;
grant execute on function public.rank_block(text), public.rank_unblock(text), public.rank_my_blocks(), public.rank_report_player(text, text, text)
  to authenticated;
