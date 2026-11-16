-- Round 4 (owner "yes", 2026-11-14, thread "Find what to optimize in the app"; condition: nothing earned changes).
--
-- 1. Voice-clip uploads: the upload policy counted rows of harakat_clips, but a file can be uploaded without ever
--    adding its row, so a script could fill the free 1 GB of Storage with 96 KB files. Now the files themselves
--    are counted: 40 a day per account (as before) and 3000 a day for everyone together.
-- 2. Friend streaks: the streak walked every shared day of the two players on every Friends poll, and rank_days grows
--    by a row per player per day for ever. The streak up to three days ago can no longer change (a report is
--    accepted for at most two days back), so it is stored per pair (rank_friend_streaks) and only the days after
--    it are walked. The numbers are exactly the same as before. With that stored, the nightly tidy-up can remove
--    daily rows older than 400 days: every total (all-time XP, weeks, leagues, trophies, Hall of fame) lives in
--    rank_players / rank_weeks, nothing a player can see reads a day that old, the streak of every pair is stored
--    before its old days go, and an invite reward that was already earned is marked so it can still be claimed.

-- 1. Uploads count files.
create or replace function public.harakat_can_upload() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
    and (select count(*) from storage.objects o where o.bucket_id = 'harakat-clips'
           and o.name like auth.uid()::text || '/%' and o.created_at > now() - interval '1 day') < 40
    and (select count(*) from storage.objects o where o.bucket_id = 'harakat-clips'
           and o.created_at > now() - interval '1 day') < 3000;
$$;
revoke all on function public.harakat_can_upload() from public, anon;
grant execute on function public.harakat_can_upload() to authenticated;

-- 2. Stored friend streaks: n = the days in a row (ending on `through`) both players earned points.
create table if not exists public.rank_friend_streaks (
  a uuid not null references auth.users (id) on delete cascade,
  b uuid not null references auth.users (id) on delete cascade,
  through date not null,
  n int not null check (n >= 0),
  primary key (a, b),
  check (a < b)
);
alter table public.rank_friend_streaks enable row level security;
revoke all on table public.rank_friend_streaks from anon, authenticated;

-- The exact streak ending on day f, from the stored one plus the days after it; stored again when f is settled.
create or replace function public.rank_streak_to(x uuid, y uuid, f date) returns int
language plpgsql security definer set search_path = '' as $$
declare
  lo uuid := least(x, y);
  hi uuid := greatest(x, y);
  s public.rank_friend_streaks;
  use boolean;
  n int := 0;
  want date := f;
  dd date;
begin
  select * into s from public.rank_friend_streaks where a = lo and b = hi;
  use := found and s.through <= f;
  if use and s.through = f then return s.n; end if;
  for dd in select p.day from public.rank_days p join public.rank_days q on q.day = p.day and q.user_id = y and q.score > 0
            where p.user_id = x and p.score > 0 and p.day <= f and (not use or p.day > s.through) order by p.day desc loop
    exit when dd <> want;
    n := n + 1;
    want := want - 1;
  end loop;
  if use and want = s.through then n := n + s.n; end if;
  if f <= current_date - 3 and (s.through is null or s.through < f) then
    insert into public.rank_friend_streaks (a, b, through, n) values (lo, hi, f, n)
      on conflict (a, b) do update set through = excluded.through, n = excluded.n
      where public.rank_friend_streaks.through < excluded.through;
  end if;
  return n;
end $$;
revoke all on function public.rank_streak_to(uuid, uuid, date) from public, anon, authenticated;

-- The friend streak on day d (as before): the days in a row both earned points, counting today once both have.
create or replace function public.rank_friend_streak(x uuid, y uuid, d date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  mine boolean := exists (select 1 from public.rank_days where user_id = x and day = d and score > 0);
  theirs boolean := exists (select 1 from public.rank_days where user_id = y and day = d and score > 0);
  want date := case when mine and theirs then d else d - 1 end;
  f date := least(want, current_date - 3);
  cur date := want;
  n int := 0;
  dd date;
begin
  for dd in select p.day from public.rank_days p join public.rank_days q on q.day = p.day and q.user_id = y and q.score > 0
            where p.user_id = x and p.score > 0 and p.day <= want and p.day > f order by p.day desc loop
    exit when dd <> cur;
    n := n + 1;
    cur := cur - 1;
  end loop;
  if cur = f then n := n + public.rank_streak_to(x, y, f); end if;
  return jsonb_build_object('streak', n, 'meToday', mine, 'themToday', theirs);
end $$;
revoke all on function public.rank_friend_streak(uuid, uuid, date) from public, anon, authenticated;

-- An invite reward already earned stays claimable when the invitee's old days are tidied away.
alter table public.rank_invites add column if not exists ready boolean not null default false;
create or replace function public.rank_invite_days(who uuid, since timestamptz) returns int
language sql stable security definer set search_path = '' as $$
  select case when exists (select 1 from public.rank_invites where invitee = who and ready) then 3
    else (select count(*)::int from public.rank_days where user_id = who and score > 0
      and day >= (since at time zone 'utc')::date - 1) end;
$$;
revoke all on function public.rank_invite_days(uuid, timestamptz) from public, anon, authenticated;

-- The nightly tidy-up (pg_cron, 02:30 UTC), now also keeping rank_days to 400 days.
create or replace function public.tidy_db() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c int; r int; f int; p int; fe int; ch int; du int; gi int; dy int;
begin
  delete from public.rank_cheers where at < now() - interval '30 days';
  get diagnostics c = row_count;
  delete from public.relights where expires_at < now() - interval '30 days';
  get diagnostics r = row_count;
  delete from public.rank_friend_asks where at < now() - interval '90 days';
  get diagnostics f = row_count;
  delete from public.problem_reports
    where status in ('fixed', 'wontfix') and created_at < now() - interval '180 days';
  get diagnostics p = row_count;
  delete from public.rank_feats where at < now() - interval '30 days';
  get diagnostics fe = row_count;
  delete from public.rank_challenges
    where (start is not null and start < current_date - 90) or (start is null and created_at < now() - interval '30 days');
  get diagnostics ch = row_count;
  delete from public.rank_duels where week < current_date - 56;
  get diagnostics du = row_count;
  delete from public.rank_gifts where opened_at < now() - interval '365 days';
  get diagnostics gi = row_count;
  -- Before old days go: every pair's streak stored (friends now, and pairs stored before), earned invites marked.
  perform public.rank_streak_to(k.a, k.b, current_date - 3)
    from (select a, b from public.rank_friends union select a, b from public.rank_friend_streaks) k
    where not exists (select 1 from public.rank_friend_streaks s where s.a = k.a and s.b = k.b and s.through >= current_date - 380);
  update public.rank_invites set ready = true where not ready and public.rank_invite_days(invitee, at) >= 3;
  delete from public.rank_days where day < current_date - 400;
  get diagnostics dy = row_count;
  return jsonb_build_object('cheers', c, 'relights', r, 'friend_asks', f, 'reports', p,
    'feats', fe, 'challenges', ch, 'duels', du, 'gifts', gi, 'days', dy);
end $$;
revoke all on function public.tidy_db() from public, anon, authenticated;
