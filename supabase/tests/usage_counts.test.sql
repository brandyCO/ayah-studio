-- Anonymous usage counts (supabase/migrations/20261113400000_usage_counts.sql): anyone may add to a day's
-- counts, only known word shapes are counted, each word once a call, and nobody can read the table.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(9);

set local role anon;
select is(usage_add(current_date, array['v:learn', 'ev:page', 'age:0', 'age:7-13', 'p:android', 'l:ar', 'd0:v:learn']), 7, 'known words are counted');
select is(usage_add(current_date, array['v:learn', 'v:learn', 'x:evil', 'v:Robert''); drop', 'ev:' || repeat('a', 40)]), 1, 'repeats and unknown words are dropped');
select throws_ok($$ select usage_add(current_date - 30, array['v:me']) $$, '22023', null, 'old days are refused');
select throws_ok($$ select usage_add(current_date + 3, array['v:me']) $$, '22023', null, 'future days are refused');
select throws_ok($$ select usage_add(current_date, array_fill('v:me'::text, array[101])) $$, '22023', null, 'too many words are refused');
select throws_ok($$ select * from usage_daily $$, '42501', null, 'the counts cannot be read');
select throws_ok($$ select * from usage_by_day $$, '42501', null, 'the summary cannot be read');
reset role;

select is((select phones from usage_by_day where day = current_date and key = 'v:learn'), 2, 'two phones opened Learn');
select is((select pct_of_installs from usage_first_day where day = current_date and step = 'v:learn'), 100.0, 'first-day share of the day''s installs');

select * from finish();
rollback;
