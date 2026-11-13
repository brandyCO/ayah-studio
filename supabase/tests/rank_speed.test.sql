-- Ranks at scale (supabase/migrations/20261111500000_rank_speed.sql): profiles in one call, counts kept for a
-- minute, the measure boards' top 100 kept for a minute, a board by a measure from its members only.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
-- Scores here are for an ordinary day (Friday counts twice: light_value.test.sql).
create or replace function public.rank_xp_mult(d date) returns numeric language sql stable as 'select 1::numeric';

select plan(13);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000051', 'amal@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000052', 'bilal@example.com'),
  ('cccccccc-0000-0000-0000-000000000053', 'dina@example.com');

create function pg_temp.act_as(uid text) returns void language sql as $$
  reset role;
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  set local role authenticated;
$$;
create temp table ids (k text primary key, v text);
grant all on ids to authenticated;

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000051');
select rank_report(current_date, 3, 0, 0, 0, 'Amal');
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000052');
select rank_report(current_date, 1, 0, 0, 0, 'Bilal');
select pg_temp.act_as('cccccccc-0000-0000-0000-000000000053');
select rank_report(current_date, 2, 0, 0, 0, 'Dina');
reset role;
insert into ids select 'a', pid from rank_players where user_id = 'aaaaaaaa-0000-0000-0000-000000000051';
insert into ids select 'b', pid from rank_players where user_id = 'bbbbbbbb-0000-0000-0000-000000000052';

-- 1. Profiles in one call.
select pg_temp.act_as('cccccccc-0000-0000-0000-000000000053');
select is(rank_profiles(array[(select v from ids where k = 'a'), (select v from ids where k = 'b')], current_date)
  -> (select v from ids where k = 'b') ->> 'name', 'Bilal', 'several profiles come in one call, keyed by public id');
select is(rank_profiles(array[(select v from ids where k = 'a'), 'nobody'], current_date) -> 'nobody', 'null'::jsonb, 'an unknown id is null');
select is((select count(*) from jsonb_object_keys(rank_profiles(array[(select v from ids where k = 'a'), (select v from ids where k = 'a')], current_date)))::int, 1, 'each player once');
select throws_ok($$ select rank_profiles(array_fill('x'::text, array[41]), current_date) $$, '22023', null, 'at most 40 at once');

-- 2. Counts.
select is((rank_status(current_date) ->> 'weekPlayers')::int, 3, 'players this week');
select is((rank_status(current_date) ->> 'allPlayers')::int, 3, 'all players');
select throws_ok($$ select * from rank_counts $$, '42501', null, 'the kept counts cannot be read');

-- 3. The measure boards.
select is(rank_global(current_date, false, 'pages') -> 0 ->> 'name', 'Amal', 'most pages first');
select is(jsonb_array_length(rank_global(current_date, false, 'pages')), 3, 'everyone with pages');
select throws_ok($$ select * from rank_measure_top $$, '42501', null, 'the kept top 100 cannot be read');
reset role;
select is((select count(*) from rank_measure_top where metric = 'pages')::int, 1, 'the top 100 is kept, once');

-- A board by a measure adds up its members only.
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000052');
insert into ids select 'board', (rank_create_board('Family') ->> 'code');
select pg_temp.act_as('cccccccc-0000-0000-0000-000000000053');
insert into ids select 'bid', rank_join_board((select v from ids where k = 'board'))::text;
select is(jsonb_array_length(rank_board((select v from ids where k = 'bid')::uuid, current_date, 'pages')), 2, 'the board''s two members');
select is(rank_board((select v from ids where k = 'bid')::uuid, current_date, 'pages') -> 0 ->> 'score', '2', 'with their own pages');

select * from finish();
rollback;
