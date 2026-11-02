-- Problem reports (supabase/migrations/20261102100000_problem_reports.sql).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(7);

select lives_ok($$ select send_report('start', 'starts at the second word', '{"r":7,"s":37,"a":113}'::jsonb, 'dev-1') $$, 'a report is taken');
select is((select count(*)::int from problem_reports where install = 'dev-1'), 1, 'and stored once');
select is((select note from problem_reports where install = 'dev-1'), 'starts at the second word', 'with its note');
select throws_ok($$ select send_report('nonsense', null, '{}'::jsonb, 'dev-1') $$, '22023', 'Unknown kind', 'unknown kinds are refused');
select throws_ok($$ select send_report('other', repeat('x', 501), '{}'::jsonb, 'dev-1') $$, '22023', 'Note too long', 'long notes are refused');
select send_report('other', null, '{}'::jsonb, 'dev-2') from generate_series(1, 20);
select throws_ok($$ select send_report('other', null, '{}'::jsonb, 'dev-2') $$, '54000', 'Too many reports today', 'at most 20 a day per install');

set local role anon;
select throws_ok($$ select * from problem_reports $$, '42501', null, 'the app cannot read reports');
reset role;

select * from finish();
rollback;
