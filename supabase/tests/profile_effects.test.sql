-- Profile effects (supabase/migrations/20261124310000_profile_effects.sql).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
create or replace function public.rank_xp_mult(d date) returns numeric language sql stable as 'select 1::numeric';

select plan(9);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000081', 'amal@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000082', 'bilal@example.com');

create function pg_temp.act_as(uid text) returns void language sql as $$
  reset role;
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  set local role authenticated;
$$;
create temp table ids (k text primary key, v text);
grant all on ids to authenticated;

select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000082');
select throws_ok($$ select rank_set_effect(3) $$, '22023', 'Not playing yet', 'no effect before playing');
select rank_report(current_date, 1, 0, 0, 0, 'Bilal');
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000081');
select rank_report(current_date, 2, 0, 0, 0, 'Amal');
reset role;
insert into ids select 'a', pid from rank_players where user_id = 'aaaaaaaa-0000-0000-0000-000000000081';

select is((select fx from rank_players where user_id = 'aaaaaaaa-0000-0000-0000-000000000081'), 0::smallint, 'no effect at first');
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000081');
select lives_ok($$ select rank_set_effect(10) $$, 'an effect can be set');
select throws_ok($$ select rank_set_effect(13) $$, '22023', 'No such effect', 'no effect past 12');
select throws_ok($$ select rank_set_effect(-1) $$, '22023', 'No such effect', 'no negative effect');

select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000082');
select is(rank_profile((select v from ids where k = 'a'), current_date) ->> 'fx', '10', 'others see the effect on the profile');
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000081');
select rank_set_look(0, true, 0);
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000082');
select is(rank_profile((select v from ids where k = 'a'), current_date) ->> 'fx', null, 'a private player shows none');
reset role;
select throws_ok($$ update rank_players set fx = 20 where user_id = 'aaaaaaaa-0000-0000-0000-000000000081' $$, '23514', null, 'the table refuses an unknown effect');
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000081');
select throws_ok($$ select fx from rank_players $$, '42501', null, 'nobody reads the table directly');

select * from finish();
rollback;
