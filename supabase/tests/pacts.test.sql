-- Bedtime pact (supabase/migrations/20261110600000_bedtime_pacts.sql): 2–6 people, 7 nights of the
-- bedtime du'a together; Google accounts who joined the ranks; nobody reads the tables; a shared goal,
-- never ordered or scored; Light once each when it is over.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
-- Scores here are for an ordinary day (Friday counts twice: light_value.test.sql).
create or replace function public.rank_xp_mult(d date) returns numeric language sql stable as 'select 1::numeric';

select plan(18);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aisha@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bilal@example.com'),
  ('cccccccc-0000-0000-0000-000000000003', 'carim@example.com');
insert into auth.users (id, is_anonymous) values ('dddddddd-0000-0000-0000-000000000004', true);

create function pg_temp.act_as(uid text, anonymous boolean default false) returns void language sql as $$
  reset role;
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'is_anonymous', anonymous)::text, true);
  set local role authenticated;
$$;
create function pg_temp.act_as_visitor() returns void language sql as $$
  reset role;
  select set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
$$;
create temp table ids (k text primary key, v text);
grant all on ids to authenticated, anon;

-- Carim has never read in the app: not a ranks player yet.
select pg_temp.act_as('cccccccc-0000-0000-0000-000000000003');
select throws_ok($$ select pact_create(current_date) $$, '22023', null, 'join the ranks first');
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select lives_ok($$ select rank_report(current_date, 1, 0, 0, 0, 'Aisha') $$, 'Aisha joins the ranks');
insert into ids select 'code', pact_create(current_date) ->> 'code';
insert into ids select 'id', (select (x -> 0 ->> 'id') from (select my_pacts(current_date) x) y);
select is(jsonb_array_length(my_pacts(current_date) -> 0 -> 'members'), 1, 'the maker is in it');
select throws_ok($$ select * from pacts $$, '42501', null, 'the pacts cannot be read directly');
select throws_ok($$ select * from pact_nights $$, '42501', null, 'nor the nights');
select pg_temp.act_as_visitor();
select is((pact_preview((select v from ids where k = 'code')) ->> 'open')::boolean, true, 'anyone sees an invite is open');
select throws_ok($$ select pact_join((select v from ids where k = 'code'), current_date) $$, '42501', null, 'a visitor cannot join');
select pg_temp.act_as('dddddddd-0000-0000-0000-000000000004', true);
select throws_ok($$ select pact_join((select v from ids where k = 'code'), current_date) $$, '42501', null, 'nor an anonymous session');
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000002');
select lives_ok($$ select rank_report(current_date, 1, 0, 0, 0, 'Bilal') $$, 'Bilal joins the ranks');
select is(pact_join((select v from ids where k = 'code'), current_date)::text, (select v from ids where k = 'id'), 'Bilal joins the pact');
select is(pact_join((select v from ids where k = 'code'), current_date)::text, (select v from ids where k = 'id'), 'joining twice is the same pact');
select is(pact_mark(current_date), 1, 'a night is marked');
select is(pact_mark(current_date), 0, 'once');
select is(pact_claim((select v::uuid from ids where k = 'id')), null, 'nothing to claim while it runs');
-- Seven nights later: both kept every night.
reset role;
update pacts set start = current_date - 9 where id = (select v::uuid from ids where k = 'id');
delete from pact_nights;
insert into pact_nights (pact, user_id, day)
  select (select v::uuid from ids where k = 'id'), u, current_date - 9 + k
  from unnest(array['aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002']::uuid[]) u, generate_series(0, 6) k;
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000002');
select is(pact_join((select v from ids where k = 'code'), current_date)::text, (select v from ids where k = 'id'), 'a member stays a member');
select is(pact_claim((select v::uuid from ids where k = 'id')) ->> 'light', '85', '7 nights × 5 + 50 when everyone kept all seven');
select is(pact_claim((select v::uuid from ids where k = 'id')), null, 'once');
select pg_temp.act_as('cccccccc-0000-0000-0000-000000000003');
select lives_ok($$ select rank_report(current_date, 1, 0, 0, 0, 'Carim') $$, 'Carim joins the ranks');

select * from finish();
rollback;
