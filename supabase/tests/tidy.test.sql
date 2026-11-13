-- Nightly tidy-up (supabase/migrations/20261113000000_nightly_tidy.sql): only old short-lived rows go;
-- fresh ones and everything earned stay; players can't run it.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(11);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aisha@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bilal@example.com');

insert into public.rank_challenges (id, code, a, b) values
  ('11111111-0000-0000-0000-000000000001', 'tidytest01', 'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002');
insert into public.rank_cheers (ch, sender, kind, at) values
  ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 1, now() - interval '40 days'),
  ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 2, now() - interval '2 days');

insert into public.relights (id, owner_id, owner_name, streak, missed, created_at, expires_at) values
  ('oldrelight', 'aaaaaaaa-0000-0000-0000-000000000001', 'Aisha', 9, array[current_date - 60], now() - interval '62 days', now() - interval '60 days'),
  ('newrelight', 'aaaaaaaa-0000-0000-0000-000000000001', 'Aisha', 9, array[current_date - 1], now() - interval '1 day', now() + interval '1 day');

insert into public.rank_friend_asks (from_id, to_id, at) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', now() - interval '100 days'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', now() - interval '3 days');

insert into public.problem_reports (kind, status, created_at) values
  ('app', 'fixed', now() - interval '200 days'),
  ('app', 'new', now() - interval '200 days'),
  ('app', 'fixed', now() - interval '10 days');

insert into public.rank_days (user_id, day, pages, score) values
  ('aaaaaaaa-0000-0000-0000-000000000001', current_date - 400, 3, 30);

-- Players can't run it.
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select throws_ok('select public.tidy_db()', '42501', null, 'a player cannot run the tidy-up');
reset role;

select is(public.tidy_db(), '{"cheers": 1, "relights": 1, "friend_asks": 1, "reports": 1}'::jsonb, 'removes exactly the old short-lived rows');
select is((select count(*)::int from public.rank_cheers), 1, 'a recent cheer stays');
select is((select count(*)::int from public.rank_challenges), 1, 'the challenge stays');
select is((select array_agg(id) from public.relights), array['newrelight'], 'a live relight stays');
select is((select count(*)::int from public.rank_friend_asks), 1, 'a recent friend ask stays');
select is((select count(*)::int from public.problem_reports where status = 'new'), 1, 'an open report stays however old');
select is((select count(*)::int from public.problem_reports where status = 'fixed'), 1, 'a recently fixed report stays');
select is((select score from public.rank_days where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 30, 'earned day scores are never removed');
select is(public.tidy_db(), '{"cheers": 0, "relights": 0, "friend_asks": 0, "reports": 0}'::jsonb, 'running again removes nothing more');
create function pg_temp.scheduled() returns boolean language plpgsql as $$
declare yes boolean;
begin
  if to_regclass('cron.job') is null then return true; end if;
  execute $q$select exists (select 1 from cron.job where jobname = 'tidy-db' and schedule = '30 2 * * *')$q$ into yes;
  return yes;
end $$;
select ok(pg_temp.scheduled(), 'scheduled nightly where pg_cron exists');

select * from finish();
rollback;
