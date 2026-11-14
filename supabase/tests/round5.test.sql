-- Round 5 (supabase/migrations/20261114500000_round5_league_pulse.sql): the league fingerprint in two parts. The
-- league part is the same for every member and changes when anyone in it moves; the own part changes with the
-- player's own row; anonymous callers (the edge proxy) get only the league part.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
create or replace function public.rank_xp_mult(d date) returns numeric language sql stable as 'select 1::numeric';

select plan(10);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000151', 'a151@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000152', 'b152@example.com');

create function pg_temp.act_as(uid text) returns void language sql as $$
  reset role;
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  set local role authenticated;
$$;

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000151');
select rank_report(current_date, 3, 0, 0, 0, 'Amal');
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000152');
select rank_report(current_date, 2, 0, 0, 0, 'Basim');

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000151');
create temp table p1 as select rank_my_pulse(current_date) m, rank_pulse(current_date) full_p;
grant all on p1 to authenticated, anon;
select isnt((select m ->> 'l' from p1), null, 'my pulse names my league');
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000152');
select is((rank_my_pulse(current_date) ->> 'l'), (select m ->> 'l' from p1), 'both are in the same league');
select is(rank_league_pulse((select (m ->> 'l')::uuid from p1), current_date),
  rank_league_pulse((rank_my_pulse(current_date) ->> 'l')::uuid, current_date), 'the league part is the same for every member');
create temp table l1 as select rank_league_pulse((select (m ->> 'l')::uuid from p1), current_date) v;
grant all on l1 to authenticated;

-- Basim earns more this week (a report within 5 s of the last is ignored, so the rows are changed directly):
-- Amal's league part and full pulse change, her own part does not.
reset role;
update rank_weeks set score = score + 20 where user_id = 'bbbbbbbb-0000-0000-0000-000000000152';
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000151');
select isnt(rank_league_pulse((select (m ->> 'l')::uuid from p1), current_date), (select v from l1), 'a member moving changes the league part');
select is((rank_my_pulse(current_date) ->> 'p'), (select m ->> 'p' from p1), 'and not my own part');
select isnt(rank_pulse(current_date), (select full_p from p1), 'as the full pulse changes');

-- Amal earns more: her own part changes.
reset role;
update rank_players set total = total + 20 where user_id = 'aaaaaaaa-0000-0000-0000-000000000151';
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000151');
select isnt((rank_my_pulse(current_date) ->> 'p'), (select m ->> 'p' from p1), 'my own part changes with my points');

-- The proxy (anon) gets the league part only.
reset role;
set local role anon;
select isnt(rank_league_pulse((select (m ->> 'l')::uuid from p1), current_date), null, 'anonymous: the league part');
select throws_ok($$ select rank_my_pulse(current_date) $$, '42501', null, 'anonymous: not the own part');
select is(rank_league_pulse('00000000-0000-0000-0000-000000000000', current_date), md5(''), 'an unknown league says nothing');

select * from finish();
rollback;
