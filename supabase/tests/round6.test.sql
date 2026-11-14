-- Round 6 (supabase/migrations/20261114600000_round6_social_pulse.sql): friends' and the rival's fingerprint in two parts.
-- A public player's part (asked by the edge proxy, anonymous) changes when they earn, share news or get a MashaAllah;
-- my own part changes with my row, asks and the friends whose part is private; a private player's public part says nothing.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
create or replace function public.rank_xp_mult(d date) returns numeric language sql stable as 'select 1::numeric';

select plan(14);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000161', 'a161@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000162', 'b162@example.com'),
  ('cccccccc-0000-0000-0000-000000000163', 'c163@example.com');

create function pg_temp.act_as(uid text) returns void language sql as $$
  reset role;
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  set local role authenticated;
$$;

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000161');
select rank_report(current_date, 3, 0, 0, 0, 'Amal');
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000162');
select rank_report(current_date, 2, 0, 0, 0, 'Basim');
select pg_temp.act_as('cccccccc-0000-0000-0000-000000000163');
select rank_report(current_date, 1, 0, 0, 0, 'Camil');

reset role;
insert into rank_friends (a, b) values ('aaaaaaaa-0000-0000-0000-000000000161', 'bbbbbbbb-0000-0000-0000-000000000162');
create temp table pids as select (select pid from rank_players where user_id = 'bbbbbbbb-0000-0000-0000-000000000162') b;
grant all on pids to authenticated, anon;

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000161');
create temp table s1 as select rank_my_social(current_date) m;
grant all on s1 to authenticated, anon;
select is((select m -> 'f' from s1), jsonb_build_array((select b from pids)), 'my friends'' public ids come with my part');
select is((select m ->> 'r' from s1), null, 'no rival yet');

reset role;
set local role anon;
create temp table b1 as select rank_player_pulse(array[(select b from pids)], current_date) ->> (select b from pids) v;
grant all on b1 to authenticated, anon;
select is(length((select v from b1)), 32, 'anonymous: a public player''s part');

-- Basim earns more today: his part changes, Amal's own part does not.
reset role;
update rank_days set score = score + 20, pages = pages + 2 where user_id = 'bbbbbbbb-0000-0000-0000-000000000162' and day = current_date;
set local role anon;
select isnt(rank_player_pulse(array[(select b from pids)], current_date) ->> (select b from pids), (select v from b1), 'a friend earning changes their part');
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000161');
select is((rank_my_social(current_date) ->> 'p'), (select m ->> 'p' from s1), 'and not my own part');

-- Basim shares news and Amal says MashaAllah: his part changes each time, and Basim's own part sees the MashaAllah.
reset role;
create temp table b2 as select rank_player_pulse(array[(select b from pids)], current_date) ->> (select b from pids) v;
grant all on b2 to authenticated, anon;
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000162');
select rank_feat('surah', 1);
create temp table sb as select rank_my_social(current_date) ->> 'p' v;
grant all on sb to authenticated, anon;
reset role;
select isnt(rank_player_pulse(array[(select b from pids)], current_date) ->> (select b from pids), (select v from b2), 'news changes their part');
create temp table b3 as select rank_player_pulse(array[(select b from pids)], current_date) ->> (select b from pids) v;
grant all on b3 to authenticated, anon;
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000161');
reset role;
insert into rank_feat_cheers (feat, user_id)
  select f.id, 'aaaaaaaa-0000-0000-0000-000000000161' from rank_feats f where f.user_id = 'bbbbbbbb-0000-0000-0000-000000000162';
select isnt(rank_player_pulse(array[(select b from pids)], current_date) ->> (select b from pids), (select v from b3), 'a MashaAllah changes their part');
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000162');
select isnt((rank_my_social(current_date) ->> 'p'), (select v from sb), 'and Basim''s own part (MashaAllahs on my news)');

-- Camil asks Amal to be friends: Amal's own part changes.
reset role;
insert into rank_friend_asks (from_id, to_id) values ('cccccccc-0000-0000-0000-000000000163', 'aaaaaaaa-0000-0000-0000-000000000161');
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000161');
select isnt((rank_my_social(current_date) ->> 'p'), (select m ->> 'p' from s1), 'an ask to me changes my own part');

-- A weekly rival: his public id comes with my part.
reset role;
insert into rank_duels (week, a, b) values (rank_week(current_date), 'aaaaaaaa-0000-0000-0000-000000000161', 'bbbbbbbb-0000-0000-0000-000000000162');
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000161');
select is((rank_my_social(current_date) ->> 'r'), (select b from pids), 'my rival''s public id');

-- Basim goes private: his public part says nothing, he leaves the public list, and his changes move my own part.
reset role;
update rank_players set private = true where user_id = 'bbbbbbbb-0000-0000-0000-000000000162';
set local role anon;
select is(rank_player_pulse(array[(select b from pids)], current_date) ->> (select b from pids), 'x', 'a private player''s part says nothing');
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000161');
create temp table s2 as select rank_my_social(current_date) m;
grant all on s2 to authenticated;
reset role;
update rank_days set score = score + 5 where user_id = 'bbbbbbbb-0000-0000-0000-000000000162' and day = current_date;
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000161');
select ok((select m -> 'f' from s2) = '[]'::jsonb and (select m ->> 'r' from s2) is null
  and (rank_my_social(current_date) ->> 'p') <> (select m ->> 'p' from s2), 'a private friend is followed through my own part');

reset role;
set local role anon;
select throws_ok($$ select rank_my_social(current_date) $$, '42501', null, 'anonymous: not the own part');
select throws_ok($$ select rank_player_pulse(array_fill('aaaaaaaaaa'::text, array[101]), current_date) $$, '22023', null, 'at most 100 players at once');

select * from finish();
rollback;
