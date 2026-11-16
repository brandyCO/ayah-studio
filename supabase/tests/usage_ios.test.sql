-- The iPhone app's platform word in the usage counts (supabase/migrations/20261116100000_usage_ios.sql).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(2);

set local role anon;
select is(usage_add(current_date, array['p:ios', 'p:android', 'p:web']), 3, 'every platform is counted');
select is(usage_add(current_date, array['p:symbian']), 0, 'unknown platforms are dropped');

select * from finish();
rollback;
