-- M4 Relight (supabase/migrations/20261028000000_m4_relight.sql): only a Google account asks; a
-- different Google account relights once within 48 hours; nobody reads the table; the owner takes
-- the relit asks once.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

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

-- Asking
select pg_temp.act_as('dddddddd-0000-0000-0000-000000000004', true);
select throws_ok($$ select ask_relight('Guest', 5, array[current_date - 1]) $$, '42501', null, 'an anonymous session cannot ask');
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select throws_ok($$ select ask_relight('Aisha', 1, array[current_date - 1]) $$, '22023', null, 'a 1-day streak is not relit');
select throws_ok($$ select ask_relight('Aisha', 12, array[current_date - 1, current_date - 2, current_date - 3, current_date - 4]) $$, '22023', null, 'at most 3 missed days');
select throws_ok($$ select ask_relight('Aisha', 12, array[current_date - 30]) $$, '22023', null, 'an old day is not a missed day');
select throws_ok($$ select ask_relight('  ', 12, array[current_date - 1]) $$, '22023', null, 'a name is needed');
insert into ids select 'a', ask_relight('Aisha', 12, array[current_date - 1]);
select is(char_length((select v from ids where k = 'a')), 10, 'ask_relight returns a 10-character code');
select throws_ok($$ select * from relights $$, '42501', null, 'the owner cannot read the table directly');

-- Preview (signed out too)
select pg_temp.act_as_visitor();
select is((select relight_preview((select v from ids where k = 'a')) ->> 'state'), 'open', 'a visitor sees an open relight');
select is((select relight_preview((select v from ids where k = 'a')) ->> 'name'), 'Aisha', 'with the name');
select throws_ok($$ select give_relight((select v from ids where k = 'a'), 'Visitor') $$, '42501', null, 'a visitor cannot relight');

-- Relighting
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select throws_ok($$ select give_relight((select v from ids where k = 'a'), 'Aisha') $$, '42501', null, 'the owner cannot relight their own flame');
select pg_temp.act_as('dddddddd-0000-0000-0000-000000000004', true);
select throws_ok($$ select give_relight((select v from ids where k = 'a'), 'Guest') $$, '42501', null, 'an anonymous session cannot relight');
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000002');
select lives_ok($$ select give_relight((select v from ids where k = 'a'), 'Bilal') $$, 'a friend relights it');
select pg_temp.act_as('cccccccc-0000-0000-0000-000000000003');
select throws_ok($$ select give_relight((select v from ids where k = 'a'), 'Carim') $$, '23505', null, 'only once');
select is((select relight_preview((select v from ids where k = 'a')) ->> 'state'), 'relit', 'the preview shows it relit');

-- The owner takes it once
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select is((select take_relights() -> 0 ->> 'helper'), 'Bilal', 'the owner learns who relit it');
select is((select jsonb_array_length(take_relights())), 0, 'and takes it only once');

-- Expired asks cannot be relit
reset role;
update relights set expires_at = now() - interval '1 minute', relit_at = null, helper_id = null where id = (select v from ids where k = 'a');
select pg_temp.act_as('cccccccc-0000-0000-0000-000000000003');
select throws_ok($$ select give_relight((select v from ids where k = 'a'), 'Carim') $$, '22023', null, 'an expired ask cannot be relit');

select * from finish();
rollback;
