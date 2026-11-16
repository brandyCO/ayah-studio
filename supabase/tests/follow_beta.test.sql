-- Follow my voice beta (supabase/migrations/20261113200000_follow_beta.sql).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(9);

select lives_ok($$ select send_report('follow', 'heard me wrong', '{"s":1,"engine":"web"}'::jsonb, 'dev-f') $$, 'a follow report is taken');
select lives_ok($$ select follow_stat('{"engine":"android-device","words":29,"untapped":1,"added":0}'::jsonb, 'dev-f') $$, 'a stat is taken');
select is((select count(*)::int from follow_stats where install = 'dev-f'), 1, 'and stored once');
select throws_ok($$ select follow_stat('[1]'::jsonb, 'dev-f') $$, '22023', 'Bad stat', 'only objects');
select throws_ok($$ select follow_stat(jsonb_build_object('x', repeat('y', 1001)), 'dev-f') $$, '22023', 'Bad stat', 'small only');
select throws_ok($$ select follow_stat('{}'::jsonb, null) $$, '22023', 'Bad install id', 'an install id is needed');
select follow_stat('{"engine":"web","words":5}'::jsonb, 'dev-g') from generate_series(1, 60);
select throws_ok($$ select follow_stat('{}'::jsonb, 'dev-g') $$, '54000', 'Too many today', 'at most 60 a day per phone');
select is((select phone_right_pct from follow_beta where engine = 'android-device'), 96.6, 'the view adds up');

set local role anon;
select throws_ok($$ select * from follow_stats $$, '42501', null, 'the app cannot read stats');
reset role;

select * from finish();
rollback;
