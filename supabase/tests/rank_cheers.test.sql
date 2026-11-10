-- Friend challenge gestures (supabase/migrations/20261111100000_rank_cheers.sql): only the two players, only
-- while it runs, five set gestures, at most 5 a day; the table cannot be read.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(10);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000021', 'hana@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000022', 'idris@example.com'),
  ('cccccccc-0000-0000-0000-000000000023', 'jamal@example.com');

create function pg_temp.act_as(uid text) returns void language sql as $$
  reset role;
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  set local role authenticated;
$$;
create temp table ids (k text primary key, v text);
grant all on ids to authenticated;

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000021');
select rank_report(current_date, 1, 0, 0, 0, 'Hana');
insert into ids select 'code', rank_challenge_create() ->> 'code';
reset role;
insert into ids select 'id', (select id::text from rank_challenges where code = (select v from ids where k = 'code'));
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000021');
select throws_ok($$ select rank_challenge_cheer((select v::uuid from ids where k = 'id'), 0) $$, '22023', null, 'not before the friend accepts');

select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000022');
select rank_report(current_date, 1, 0, 0, 0, 'Idris');
select rank_challenge_accept((select v from ids where k = 'code'), current_date);
select is(rank_challenge_cheer((select v::uuid from ids where k = 'id'), 1), 4, 'a gesture is sent');
select throws_ok($$ select rank_challenge_cheer((select v::uuid from ids where k = 'id'), 7) $$, '22023', null, 'only the five gestures');

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000021');
select is((rank_challenge_cheers() -> 0 ->> 'kind')::int, 1, 'the friend sees it');
select is((rank_challenge_cheers() -> 0 ->> 'mine')::boolean, false, 'as received');
select lives_ok($$ select rank_challenge_cheer((select v::uuid from ids where k = 'id'), 0) $$, 'and can answer');
select lives_ok($$ select rank_challenge_cheer((select v::uuid from ids where k = 'id'), 2), rank_challenge_cheer((select v::uuid from ids where k = 'id'), 3), rank_challenge_cheer((select v::uuid from ids where k = 'id'), 4), rank_challenge_cheer((select v::uuid from ids where k = 'id'), 0) $$, 'five in a day');
select throws_ok($$ select rank_challenge_cheer((select v::uuid from ids where k = 'id'), 0) $$, '22023', null, 'not a sixth');

select pg_temp.act_as('cccccccc-0000-0000-0000-000000000023');
select throws_ok($$ select rank_challenge_cheer((select v::uuid from ids where k = 'id'), 0) $$, 'P0002', null, 'nobody else');
select throws_ok($$ select * from rank_cheers $$, '42501', null, 'the table cannot be read');

select * from finish();
rollback;
