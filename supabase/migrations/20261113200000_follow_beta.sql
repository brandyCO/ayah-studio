-- Follow my voice beta (owner decision 2026-11-13: a ~20-person beta before everyone).
-- 1. Problem reports get a kind 'follow': "the voice heard me wrong", sent from the check screen with the
--    words the phone marked and the ones the reciter corrected (positions only, never audio or text).
-- 2. follow_stats: one small row per recitation checked with Follow my voice: which recogniser, how many
--    words it heard / marked, how many the reciter corrected. Counts only: no audio, no recognised text, no
--    account id; the app's random install id groups a phone's rows. Nobody reads the table from the app;
--    the owner reads the view follow_beta in the Supabase dashboard.

alter table public.problem_reports drop constraint if exists problem_reports_kind_check;
alter table public.problem_reports add constraint problem_reports_kind_check
  check (kind in ('start', 'highlight', 'voice', 'skip', 'cut', 'text', 'reel', 'app', 'other', 'follow'));

create or replace function public.send_report(kind text, note text, context jsonb, install text) returns void
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  n int;
begin
  if kind is null or kind not in ('start', 'highlight', 'voice', 'skip', 'cut', 'text', 'reel', 'app', 'other', 'follow') then
    raise exception 'Unknown kind' using errcode = '22023';
  end if;
  if note is not null and length(note) > 500 then raise exception 'Note too long' using errcode = '22023'; end if;
  if context is null or jsonb_typeof(context) <> 'object' or length(context::text) > 2000 then
    raise exception 'Bad context' using errcode = '22023';
  end if;
  if install is not null and length(install) > 64 then raise exception 'Bad install id' using errcode = '22023'; end if;
  -- Limits: 20 a day per install (or account), 5000 a day in all.
  select count(*) into n from public.problem_reports r
    where r.created_at > now() - interval '1 day'
      and ((install is not null and r.install = install) or (auth.uid() is not null and r.user_id = auth.uid()));
  if n >= 20 then raise exception 'Too many reports today' using errcode = '54000'; end if;
  select count(*) into n from public.problem_reports r where r.created_at > now() - interval '1 day';
  if n >= 5000 then raise exception 'Too many reports today' using errcode = '54000'; end if;
  insert into public.problem_reports (kind, note, context, install, user_id)
    values (kind, nullif(btrim(note), ''), context, install, auth.uid());
end $$;

revoke all on function public.send_report(text, text, jsonb, text) from public;
grant execute on function public.send_report(text, text, jsonb, text) to anon, authenticated;

create table if not exists public.follow_stats (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  install text check (install is null or length(install) <= 64),
  stat jsonb not null check (jsonb_typeof(stat) = 'object' and length(stat::text) <= 1000)
);
alter table public.follow_stats enable row level security;
revoke all on public.follow_stats from anon, authenticated;
create index if not exists follow_stats_created on public.follow_stats (created_at);

create or replace function public.follow_stat(stat jsonb, install text) returns void
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  n int;
begin
  if stat is null or jsonb_typeof(stat) <> 'object' or length(stat::text) > 1000 then
    raise exception 'Bad stat' using errcode = '22023';
  end if;
  if install is null or length(install) > 64 then raise exception 'Bad install id' using errcode = '22023'; end if;
  -- 60 a day per install, 50000 a day in all
  select count(*) into n from public.follow_stats f where f.created_at > now() - interval '1 day' and f.install = install;
  if n >= 60 then raise exception 'Too many today' using errcode = '54000'; end if;
  select count(*) into n from public.follow_stats f where f.created_at > now() - interval '1 day';
  if n >= 50000 then raise exception 'Too many today' using errcode = '54000'; end if;
  insert into public.follow_stats (install, stat) values (install, stat);
end $$;

revoke all on function public.follow_stat(jsonb, text) from public;
grant execute on function public.follow_stat(jsonb, text) to anon, authenticated;

-- For the owner: how well each recogniser does. "phone right" = share of words where the phone's marking
-- (said / passed over) was what the reciter kept at the check.
create or replace view public.follow_beta with (security_invoker = true) as
select
  coalesce(stat->>'engine', '?') as engine,
  count(*) as recitations,
  count(distinct install) as phones,
  sum((stat->>'words')::int) as words,
  round(100 * (1 - sum(coalesce((stat->>'untapped')::int, 0) + coalesce((stat->>'added')::int, 0))::numeric
    / nullif(sum((stat->>'words')::int), 0)), 1) as phone_right_pct,
  round(100 * sum(coalesce((stat->>'unclear')::int, 0))::numeric / nullif(sum((stat->>'words')::int), 0), 1) as unclear_pct,
  count(*) filter (where stat->>'ended' = 'failed') as failed,
  max(created_at) as last_at
from public.follow_stats
group by 1;
revoke all on public.follow_beta from public, anon, authenticated;

-- Stats are kept 180 days (tidy_db() runs nightly).
create or replace function public.tidy_follow_stats() returns int
language sql security definer set search_path = '' as $$
  with d as (delete from public.follow_stats where created_at < now() - interval '180 days' returning 1)
  select count(*)::int from d;
$$;
revoke all on function public.tidy_follow_stats() from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('tidy-follow-stats', '40 2 * * *', 'select public.tidy_follow_stats()');
  end if;
exception when others then raise notice 'tidy-follow-stats not scheduled: %', sqlerrm;
end $$;
