-- Profiles like Duolingo (owner decision 2026-11-18, plan "A simpler app structure, with profiles, following and flags"):
--  * Follow: one tap, no request. A player sees who follows them and whom they follow, with counts on the profile.
--    Following is not friendship: friends (asked and accepted, rank_friends) keep their friend streak, challenges and
--    gifts; following only puts a player in your Following list and their news in your feed.
--  * Flag: an optional country the player picks themselves (ISO 3166-1 alpha-2), never taken from a location; shown with
--    their face everywhere (rank_face), hidden while private or blocked.
--  * Badges: the app sends its best badges (ids it earned, at most 6, and how many in all) so a profile can show them.
--    Bit 32 of `show`; on for everyone at first.
-- Private players cannot be followed by anyone new; blocking ends follows both ways and refuses new ones.
-- Nobody reads the tables directly.
create table if not exists public.rank_follows (
  follower uuid not null references auth.users (id) on delete cascade,
  followee uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now(),
  primary key (follower, followee),
  check (follower <> followee)
);
create index if not exists rank_follows_followee on public.rank_follows (followee, at desc);
alter table public.rank_follows enable row level security;
revoke all on table public.rank_follows from anon, authenticated;

alter table public.rank_players add column if not exists flag text check (flag is null or flag ~ '^[A-Z]{2}$');
alter table public.rank_players add column if not exists badges jsonb not null default '{"top":[],"n":0}'::jsonb;
alter table public.rank_players drop constraint if exists rank_players_show_check;
alter table public.rank_players add constraint rank_players_show_check check (show between 0 and 63);
update public.rank_players set show = show | 32 where show & 32 = 0;
alter table public.rank_players alter column show set default 39;

-- The countries a flag can be (ISO 3166-1 alpha-2, as in the tz database's iso3166.tab; we never draw borders ourselves).
create or replace function public.rank_flag_ok(c text) returns boolean
language sql immutable set search_path = '' as $$
  select c = any (string_to_array('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR '
    'CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU '
    'ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ '
    'MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI '
    'SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW', ' '));
$$;
revoke all on function public.rank_flag_ok(text) from public, anon, authenticated;

-- How a player appears to `me` (as 20261118000000, plus the flag).
create or replace function public.rank_face(p public.rank_players, me uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case
    when p.user_id <> me and exists (select 1 from public.rank_blocks b where b.blocker = me and b.blocked = p.user_id)
      then jsonb_build_object('name', null, 'private', false, 'blocked', true, 'avatar', null, 'frame', 0, 'figure', null, 'room', null,
        'tier', p.tier, 'me', false, 'pid', p.pid, 'xp', null, 'lamp', 0, 'flag', null)
    when p.private and p.user_id <> me
      then jsonb_build_object('name', null, 'private', true, 'avatar', null, 'frame', 0, 'figure', null, 'room', null, 'tier', p.tier, 'me', false, 'pid', null, 'xp', null, 'lamp', 0, 'flag', null)
    else jsonb_build_object('name', p.name, 'avatar', p.avatar, 'frame', p.frame, 'figure', p.figure, 'room', p.room, 'tier', p.tier,
      'me', p.user_id = me, 'pid', p.pid, 'xp', p.total, 'lamp', p.lamp, 'flag', p.flag) end;
$$;

-- Nothing new between a blocked pair, and no new followers for a private player.
create or replace function public.rank_follow_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.rank_blocked(new.follower, new.followee) then
    raise exception 'Not possible with this player' using errcode = '42501';
  end if;
  if exists (select 1 from public.rank_players where user_id = new.followee and private) then
    raise exception 'This player keeps their reading private' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.rank_follow_guard() from public, anon, authenticated;
drop trigger if exists rank_follow_guard on public.rank_follows;
create trigger rank_follow_guard before insert on public.rank_follows for each row execute function public.rank_follow_guard();

-- A block ends the follows both ways.
create or replace function public.rank_block_unfollow() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.rank_follows where (follower = new.blocker and followee = new.blocked) or (follower = new.blocked and followee = new.blocker);
  return new;
end $$;
revoke all on function public.rank_block_unfollow() from public, anon, authenticated;
drop trigger if exists rank_block_unfollow on public.rank_blocks;
create trigger rank_block_unfollow after insert on public.rank_blocks for each row execute function public.rank_block_unfollow();

-- Friends follow each other from the start: every friendship today, and every one made from now on.
insert into public.rank_follows (follower, followee, at)
  select f.a, f.b, f.since::timestamptz from public.rank_friends f
  where not public.rank_blocked(f.a, f.b) and not exists (select 1 from public.rank_players p where p.user_id = f.b and p.private)
  on conflict do nothing;
insert into public.rank_follows (follower, followee, at)
  select f.b, f.a, f.since::timestamptz from public.rank_friends f
  where not public.rank_blocked(f.a, f.b) and not exists (select 1 from public.rank_players p where p.user_id = f.a and p.private)
  on conflict do nothing;
-- A friend ask still waiting: the asker follows the player they asked.
insert into public.rank_follows (follower, followee, at)
  select k.from_id, k.to_id, k.at from public.rank_friend_asks k
  where not public.rank_blocked(k.from_id, k.to_id) and not exists (select 1 from public.rank_players p where p.user_id = k.to_id and p.private)
  on conflict do nothing;
create or replace function public.rank_friends_follow() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.rank_follows (follower, followee)
    select x, y from (values (new.a, new.b), (new.b, new.a)) v (x, y)
    where not exists (select 1 from public.rank_players p where p.user_id = v.y and p.private)
    on conflict do nothing;
  return new;
end $$;
revoke all on function public.rank_friends_follow() from public, anon, authenticated;
drop trigger if exists rank_friends_follow on public.rank_friends;
create trigger rank_friends_follow after insert on public.rank_friends for each row execute function public.rank_friends_follow();

-- Follow a player: 50 new follows a day, 2000 at most.
create or replace function public.rank_follow(who text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  them uuid := public.rank_by_pid(who);
begin
  if me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if them is null then raise exception 'No such player' using errcode = 'P0002'; end if;
  if them = me then raise exception 'That is you' using errcode = '22023'; end if;
  if exists (select 1 from public.rank_follows where follower = me and followee = them) then return 'following'; end if;
  if (select count(*) from public.rank_follows where follower = me and at > now() - interval '1 day') >= 50 then
    raise exception 'Enough for today' using errcode = '54000';
  end if;
  if (select count(*) from public.rank_follows where follower = me) >= 2000 then
    raise exception 'You follow enough players' using errcode = '22023';
  end if;
  insert into public.rank_follows (follower, followee) values (me, them) on conflict do nothing;
  return 'following';
end $$;

create or replace function public.rank_unfollow(who text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  them uuid := public.rank_by_pid(who);
begin
  if them is null then return; end if;
  delete from public.rank_follows where follower = me and followee = them;
end $$;

-- Remove a follower (they can follow again unless blocked or you are private).
create or replace function public.rank_drop_follower(who text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  them uuid := public.rank_by_pid(who);
begin
  if them is null then return; end if;
  delete from public.rank_follows where follower = them and followee = me;
end $$;

-- Your flag (null = none).
create or replace function public.rank_set_flag(code text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.rank_me();
begin
  code := nullif(upper(btrim(coalesce(code, ''))), '');
  if code is not null and not public.rank_flag_ok(code) then raise exception 'Not a country' using errcode = '22023'; end if;
  update public.rank_players set flag = code where user_id = me;
end $$;

-- Your best badges as the app counts them: ids like 'streak-3' or 'top3-1', at most 6, and how many you earned in all.
create or replace function public.rank_set_badges(top text[], n int) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.rank_me();
begin
  if top is null or cardinality(top) > 6 or exists (select 1 from unnest(top) x where x !~ '^[a-z][a-z0-9]{1,15}-[0-4]$') then
    raise exception 'Bad badges' using errcode = '22023';
  end if;
  if n is null or n < cardinality(top) or n > 500 then raise exception 'Bad count' using errcode = '22023'; end if;
  update public.rank_players set badges = jsonb_build_object('top', to_jsonb(top), 'n', n) where user_id = me;
end $$;

-- What your profile shows (now up to bit 32, badges), and your flame streak as the app counts it.
create or replace function public.rank_set_profile(show_bits int, my_streak int) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.rank_me();
begin
  if show_bits is null or show_bits < 0 or show_bits > 63 then raise exception 'Bad choice' using errcode = '22023'; end if;
  update public.rank_players set show = show_bits, streak = greatest(0, least(9999, coalesce(my_streak, 0))) where user_id = me;
end $$;

-- A player's profile (as 20261111400000), plus following, counts, flag (in the face) and badges.
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
  out := public.rank_face(p, me) || jsonb_build_object('relation', rel, 'show', p.show, 'bestTier', p.best_tier,
    'follow', jsonb_build_object(
      'on', exists (select 1 from public.rank_follows where follower = me and followee = p.user_id),
      'back', exists (select 1 from public.rank_follows where follower = p.user_id and followee = me),
      'followers', (select count(*) from public.rank_follows f where f.followee = p.user_id
        and not exists (select 1 from public.rank_players q where q.user_id = f.follower and q.private)),
      'following', (select count(*) from public.rank_follows f where f.follower = p.user_id
        and not exists (select 1 from public.rank_players q where q.user_id = f.followee and q.private))));
  if (out->>'blocked')::boolean is true then return out - 'follow'; end if;
  if p.show & 1 = 1 or rel = 'me' then
    out := out || jsonb_build_object('week', coalesce((select score from public.rank_weeks where user_id = p.user_id and week = wk), 0));
  end if;
  if p.show & 2 = 2 or rel = 'me' then out := out || jsonb_build_object('streak', p.streak); end if;
  if p.show & 4 = 4 or rel = 'me' then
    out := out || jsonb_build_object('trophies', (select count(*) from public.rank_prizes where user_id = p.user_id and place is not null),
      'cups', (select coalesce(jsonb_agg(place order by week desc), '[]'::jsonb) from (select place, week from public.rank_prizes
        where user_id = p.user_id and place is not null order by week desc limit 8) c));
  end if;
  if p.show & 8 = 8 or rel = 'me' then
    out := out || jsonb_build_object('pages', (select coalesce(sum(pages), 0) from public.rank_days where user_id = p.user_id and day between wk and d));
  end if;
  if p.show & 16 = 16 or rel = 'me' then
    out := out || jsonb_build_object('listen', (select coalesce(sum(listen), 0) / 60 from public.rank_days where user_id = p.user_id and day between wk and d));
  end if;
  if p.show & 32 = 32 or rel = 'me' then out := out || jsonb_build_object('badges', p.badges); end if;
  if rel = 'friend' then out := out || jsonb_build_object('friend', public.rank_friend_streak(me, p.user_id, d)); end if;
  return out;
end $$;

-- A player's followers or the players they follow (newest first, 200 at most). Private and blocked players are left
-- out; a private player's lists are not shown to others.
create or replace function public.rank_follow_list(who text, kind text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  p public.rank_players;
begin
  if me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if kind not in ('followers', 'following') then raise exception 'Bad list' using errcode = '22023'; end if;
  select * into p from public.rank_players where pid = who;
  if p.user_id is null or (p.private and p.user_id <> me) or (p.user_id <> me and public.rank_blocked(me, p.user_id)) then
    return '[]'::jsonb;
  end if;
  return (select coalesce(jsonb_agg(public.rank_face(q, me) || jsonb_build_object('at', x.at,
      'on', exists (select 1 from public.rank_follows m where m.follower = me and m.followee = q.user_id)) order by x.at desc), '[]'::jsonb)
    from (select case when kind = 'followers' then f.follower else f.followee end as uid, f.at from public.rank_follows f
          where (kind = 'followers' and f.followee = p.user_id) or (kind = 'following' and f.follower = p.user_id)
          order by f.at desc limit 400) x
    join public.rank_players q on q.user_id = x.uid
    where not q.private and not public.rank_blocked(me, q.user_id)
    limit 200);
end $$;

-- For the Friends tab and the bell: whom I follow (with this week's points and the reading-now dot) and my newest
-- followers (the last 30 days), with whether I follow them back.
create or replace function public.rank_my_follows(d date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  wk date := public.rank_week(d);
begin
  if me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  perform public.rank_check_day(d);
  return jsonb_build_object(
    'following', (select coalesce(jsonb_agg(public.rank_face(p, me) || jsonb_build_object(
        'week', coalesce((select score from public.rank_weeks w where w.user_id = p.user_id and w.week = wk), 0),
        'live', case when p.live_at > now() - interval '4 minutes' then p.live_kind end,
        'friend', public.rank_is_friend(me, p.user_id)) order by f.at desc), '[]'::jsonb)
      from (select * from public.rank_follows where follower = me order by at desc limit 300) f
      join public.rank_players p on p.user_id = f.followee where not p.private),
    'followers', (select coalesce(jsonb_agg(public.rank_face(p, me) || jsonb_build_object('at', f.at,
        'on', exists (select 1 from public.rank_follows m where m.follower = me and m.followee = p.user_id)) order by f.at desc), '[]'::jsonb)
      from (select * from public.rank_follows where followee = me and at > now() - interval '30 days' order by at desc limit 50) f
      join public.rank_players p on p.user_id = f.follower where not p.private and not public.rank_blocked(me, p.user_id)),
    'nFollowers', (select count(*) from public.rank_follows f where f.followee = me),
    'nFollowing', (select count(*) from public.rank_follows f where f.follower = me));
end $$;

revoke all on function public.rank_follow(text), public.rank_unfollow(text), public.rank_drop_follower(text), public.rank_set_flag(text),
  public.rank_set_badges(text[], int), public.rank_set_profile(int, int), public.rank_profile(text, date), public.rank_follow_list(text, text),
  public.rank_my_follows(date) from public, anon;
grant execute on function public.rank_follow(text), public.rank_unfollow(text), public.rank_drop_follower(text), public.rank_set_flag(text),
  public.rank_set_badges(text[], int), public.rank_set_profile(int, int), public.rank_profile(text, date), public.rank_follow_list(text, text),
  public.rank_my_follows(date) to authenticated;
