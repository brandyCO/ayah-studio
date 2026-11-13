-- Nightly tidy-up (optimization list item 9): the free database is 500 MB and nothing ever removed
-- rows that only matter for a short time. Only short-lived rows go; nothing a user earned is touched
-- (no streak, Light, XP, rank_days, lamps, gifts, prizes or harakat clips).
--   rank_cheers       older than 30 days (challenge cheers; the challenge itself stays)
--   relights          expired more than 30 days ago (the relit streak is already in the owner's journey)
--   rank_friend_asks  unanswered for 90 days
--   problem_reports   fixed / wontfix and older than 180 days
create or replace function public.tidy_db() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c int; r int; f int; p int;
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
  return jsonb_build_object('cheers', c, 'relights', r, 'friend_asks', f, 'reports', p);
end $$;
revoke all on function public.tidy_db() from public, anon, authenticated;

-- Every night at 02:30 UTC, where pg_cron is available (Supabase has it; a database without it
-- simply has no schedule, and tidy_db() can be run by hand).
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron not available: tidy_db() is not scheduled';
    return;
  end;
  perform cron.unschedule(jobid) from cron.job where jobname = 'tidy-db';
  perform cron.schedule('tidy-db', '30 2 * * *', 'select public.tidy_db()');
end $$;
