-- The lamp wall (supabase/migrations/20261112400000_lamp_wall.sql).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(18);
create function pg_temp.lamp(n text) returns jsonb language sql as $$
  select x from jsonb_array_elements(public.rank_lamp_wall() -> 'lamps') x where x ->> 'for' like n || '%' $$;
grant execute on function pg_temp.lamp(text) to authenticated;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000081', 'amal@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000082', 'bilal@example.com'),
  ('cccccccc-0000-0000-0000-000000000083', 'dina@example.com'),
  ('dddddddd-0000-0000-0000-000000000084', 'eman@example.com');

create function pg_temp.act_as(uid text) returns void language sql as $$
  reset role;
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  set local role authenticated;
$$;
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;

select pg_temp.act_as('dddddddd-0000-0000-0000-000000000084');
select throws_ok($$ select rank_lamp_light('Fatimah', false, 0, 50) $$, '42501', null, 'only players in the ranks');
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000081');
select rank_report(current_date, 1, 0, 0, 0, 'Amal');
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000082');
select rank_report(current_date, 1, 0, 0, 0, 'Bilal');
select pg_temp.act_as('cccccccc-0000-0000-0000-000000000083');
select rank_report(current_date, 1, 0, 0, 0, 'Dina');
select pg_temp.act_as('dddddddd-0000-0000-0000-000000000084');
select rank_report(current_date, 1, 0, 0, 0, 'Eman');

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000081');
select throws_ok($$ select rank_lamp_light('see www.spam.com', true, 0, 50) $$, '22023', null, 'no links');
select throws_ok($$ select rank_lamp_light('Ali 123', true, 0, 50) $$, '22023', null, 'no numbers');
select throws_ok($$ select rank_lamp_light('', true, 0, 50) $$, '22023', null, 'a name is needed');
select throws_ok($$ select rank_lamp_light('Ali', true, 0, 70) $$, '22023', null, 'only 50, 100 or 250 Light');
select throws_ok($$ select rank_lamp_light('Ali', true, 7, 50) $$, '22023', null, 'one of the four du''as');
insert into ids select 'a1', rank_lamp_light('  Fatimah   Zahra ', false, 1, 100, true);
insert into ids select 'a2', rank_lamp_light('عبد الله', true, 0, 50);
insert into ids select 'a3', rank_lamp_light('Yusuf', true, 2, 250);
select throws_ok($$ select rank_lamp_light('Maryam', false, 0, 50) $$, '22023', null, '3 lamps a day');
select is(pg_temp.lamp('Fatimah') ->> 'for', 'Fatimah Zahra', 'the name is tidied');
select is((pg_temp.lamp('عبد') ->> 'for'), 'عبد الله', 'Arabic names too');
select is((pg_temp.lamp('Fatimah') ->> 'by'), 'Amal', 'the giver shows when they chose it');
select is((pg_temp.lamp('Yusuf') ->> 'by'), null, 'hidden otherwise');

select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000082');
select is((rank_lamp_wall() ->> 'total')::int, 3, 'everyone sees the wall');
select is((rank_lamp_wall() -> 'lamps' -> 0 ->> 'me')::boolean, false, 'not mine');
select is(rank_lamp_ameen((select v from ids where k = 'a1')), 1, 'Ameen is counted');
select rank_lamp_ameen((select v from ids where k = 'a1'));
select is((pg_temp.lamp('Fatimah') ->> 'ameen')::int, 1, 'once per player');
select throws_ok($$ select * from rank_lamps $$, '42501', null, 'no table access');
select rank_lamp_remove((select v from ids where k = 'a3'));
select rank_lamp_report((select v from ids where k = 'a3'));
select pg_temp.act_as('cccccccc-0000-0000-0000-000000000083');
select rank_lamp_report((select v from ids where k = 'a3'));
select pg_temp.act_as('dddddddd-0000-0000-0000-000000000084');
select rank_lamp_report((select v from ids where k = 'a3'));
select is((rank_lamp_wall() ->> 'total')::int, 2, 'three reports hide a lamp; nobody else can remove it');
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000081');
select rank_lamp_remove((select v from ids where k = 'a2'));
select is((rank_lamp_wall() ->> 'total')::int, 1, 'the giver can take their lamp down');

select * from finish();
rollback;
