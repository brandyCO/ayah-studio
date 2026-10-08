-- T2 Khatm circles (supabase/migrations/20261009000000_t2_circles.sql): members only see their
-- circles; every change goes through the functions; completion is set once by the database.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(40);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aisha@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bilal@example.com'),
  ('cccccccc-0000-0000-0000-000000000003', 'carim@example.com');

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

-- Aisha creates a circle
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
insert into ids select 'c', create_circle('  Family   Ramadan Khatm ', 'Aisha', '2027-03-01');
select is((select name from circles), 'Family Ramadan Khatm', 'the circle name is tidied');
select ok((select invite_code ~ '^[A-HJ-NP-Z2-9]{8}$' from circles), 'an 8-character invite code');
select is((select count(*)::int from circle_parts where status = 'free'), 30, '30 free parts');
select is((select owner_id::text from circles), 'aaaaaaaa-0000-0000-0000-000000000001', 'she owns it');
insert into ids select 'code', invite_code from circles;
select throws_ok($$ select create_circle('   ', 'Aisha') $$, '22023', null, 'a blank name is refused');
select throws_ok($$ insert into circle_parts (circle_id, round, juz) values ((select v::uuid from ids where k = 'c'), 1, 31) $$,
  '42501', null, 'members cannot insert parts directly');
update circle_parts set status = 'done' where true;
select is((select count(*)::int from circle_parts where status = 'done'), 0, 'members cannot update parts directly');
update circles set status = 'complete' where true;
select is((select count(*)::int from circles where status = 'complete'), 0, 'the circle cannot be completed by hand');

-- Bilal sees nothing until he joins with the code
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000002');
select is((select count(*)::int from circles), 0, 'non-members see no circle');
select is((select count(*)::int from circle_parts), 0, 'non-members see no parts');
select is((select members from circle_preview((select v from ids where k = 'code'))), 1, 'the invite preview shows the member count');
select throws_ok($$ select take_part((select v::uuid from ids where k = 'c'), 3) $$, '42501', null, 'non-members cannot take a juz');
select throws_ok($$ select join_circle('ZZZZZZZZ', 'Bilal') $$, 'P0002', null, 'an unknown code is refused');
select lives_ok($$ select join_circle(lower((select v from ids where k = 'code')), 'Bilal') $$, 'he joins with the code');
select is((select count(*)::int from circle_members), 2, 'now he sees both members');
select is((select count(*)::int from circle_parts), 30, 'and the 30 parts');
select is(take_part((select v::uuid from ids where k = 'c'), 5), 5, 'he takes juz 5');

-- Aisha cannot take or change Bilal's juz
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select throws_ok($$ select take_part((select v::uuid from ids where k = 'c'), 5) $$, 'P0001', 'Someone has just taken this juz',
  'a taken juz cannot be taken again');
select throws_ok($$ select set_part((select v::uuid from ids where k = 'c'), 5, 'done') $$, '42501', null,
  'nobody else can finish his juz');
select ok(take_part((select v::uuid from ids where k = 'c')) between 1 and 30, '"pick one for me" takes a free juz');

-- Carim (not a member) and anonymous sessions
select pg_temp.act_as('cccccccc-0000-0000-0000-000000000003');
select is((select count(*)::int from circle_members), 0, 'a stranger sees no members');
select throws_ok($$ select set_part((select v::uuid from ids where k = 'c'), 5, 'free') $$, '42501', null, 'a stranger cannot release a juz');
select pg_temp.act_as('dddddddd-0000-0000-0000-000000000004', true);
select throws_ok($$ select create_circle('x', 'y') $$, '42501', null, 'anonymous sessions cannot create circles');
select pg_temp.act_as_visitor();
select throws_ok($$ select circle_preview('ABCDEFGH') $$, '42501', null, 'signed-out visitors cannot look codes up');

-- Bilal gives juz 5 back and takes it again, then finishes it
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000002');
select lives_ok($$ select set_part((select v::uuid from ids where k = 'c'), 5, 'free') $$, 'he gives his juz back');
select is((select status from circle_parts where juz = 5), 'free', 'juz 5 is free again');
select is(take_part((select v::uuid from ids where k = 'c'), 5), 5, 'and takes it again');

-- Every other juz finished (as the database owner), then Bilal finishes the last one
reset role;
update circle_parts set user_id = 'aaaaaaaa-0000-0000-0000-000000000001', status = 'done', done_at = now() where juz <> 5;
select is((select status from circles), 'open', 'not complete while one juz is left');
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000002');
select lives_ok($$ select set_part((select v::uuid from ids where k = 'c'), 5, 'done') $$, 'he finishes the last juz');
select is((select status from circles), 'complete', 'the Khatm is complete');
select ok((select completed_at is not null from circles), 'with its date');
select throws_ok($$ select set_part((select v::uuid from ids where k = 'c'), 5, 'taken') $$, '42501', null,
  'a completed round cannot be changed');
select throws_ok($$ select new_round((select v::uuid from ids where k = 'c')) $$, '42501', null, 'only the owner starts a new round');

-- Aisha starts round 2, then leaves: the circle passes to Bilal; the last one out deletes it
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select is(new_round((select v::uuid from ids where k = 'c')), 2, 'round 2');
select is((select count(*)::int from circle_parts where round = 2 and status = 'free'), 30, 'with 30 free parts');
select take_part((select v::uuid from ids where k = 'c'), 1);
select leave_circle((select v::uuid from ids where k = 'c'));
reset role;
select is((select owner_id::text from circles), 'bbbbbbbb-0000-0000-0000-000000000002', 'the owner leaving hands the circle on');
select is((select status from circle_parts where round = 2 and juz = 1), 'free', 'her unfinished juz is free again');
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000002');
select leave_circle((select v::uuid from ids where k = 'c'));
reset role;
select is((select count(*)::int from circles) + (select count(*)::int from circle_parts), 0, 'the last member leaving deletes the circle');

-- Deleting an account hands the owner's circle on instead of deleting it for everyone
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
insert into ids select 'c2', create_circle('Second circle', 'Aisha');
insert into ids select 'code2', invite_code from circles where name = 'Second circle';
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000002');
select join_circle((select v from ids where k = 'code2'), 'Bilal');
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select delete_my_account();
reset role;
select is((select owner_id::text from circles where name = 'Second circle'), 'bbbbbbbb-0000-0000-0000-000000000002',
  'deleting the owner''s account hands the circle to the next member');
select is((select count(*)::int from circle_members where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 0, 'and removes her membership');

select * from finish();
rollback;
