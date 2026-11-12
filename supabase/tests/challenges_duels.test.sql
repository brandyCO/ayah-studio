-- Friend challenges by kind and weekly duels (supabase/migrations/20261112000000_challenges_duels.sql,
-- 20261112100000_duels_for_all.sql).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
-- Scores here are for an ordinary day (Friday counts twice: light_value.test.sql).
create or replace function public.rank_xp_mult(d date) returns numeric language sql stable as 'select 1::numeric';

select plan(23);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000061', 'amal@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000062', 'bilal@example.com'),
  ('cccccccc-0000-0000-0000-000000000063', 'dina@example.com');

create function pg_temp.act_as(uid text) returns void language sql as $$
  reset role;
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  set local role authenticated;
$$;
create temp table ids (k text primary key, v text);
grant all on ids to authenticated;

-- 1. Adhkar and dhikr are kept, under the pace limit, and never change the league score.
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000061');
select is(rank_report(current_date, 2, 0, 0, 0, 'Amal', 0, 2, 300), 40, 'adhkar and dhikr add no league points');
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000062');
select rank_report(current_date, 1, 0, 0, 0, 'Bilal', 0, 50, 999999);
select pg_temp.act_as('cccccccc-0000-0000-0000-000000000063');
select rank_report(current_date, 1, 0, 0, 0, 'Dina');
reset role;
select is((select adhkar from rank_days where user_id = 'aaaaaaaa-0000-0000-0000-000000000061' and day = current_date)::int, 2, 'adhkar sessions kept');
select is((select dhikr from rank_days where user_id = 'aaaaaaaa-0000-0000-0000-000000000061' and day = current_date), 300, 'dhikr kept');
select is((select adhkar from rank_days where user_id = 'bbbbbbbb-0000-0000-0000-000000000062' and day = current_date)::int, 12, 'at most 12 adhkar sessions a day');
select is((select dhikr from rank_days where user_id = 'bbbbbbbb-0000-0000-0000-000000000062' and day = current_date), 3000, 'at most 3000 dhikr a day');
update rank_days set updated_at = now() - interval '10 seconds' where user_id = 'aaaaaaaa-0000-0000-0000-000000000061';
update rank_days set dhikr = 300 where user_id = 'aaaaaaaa-0000-0000-0000-000000000061';
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000061');
select rank_report(current_date, 2, 0, 0, 0, 'Amal', 0, 2, 5000);
reset role;
select ok((select dhikr from rank_days where user_id = 'aaaaaaaa-0000-0000-0000-000000000061' and day = current_date) <= 300 + 10 * 2 + 40 + 2,
  'dhikr cannot grow faster than about 2 a second');
insert into ids select 'b', pid from rank_players where user_id = 'bbbbbbbb-0000-0000-0000-000000000062';
insert into ids select 'c', pid from rank_players where user_id = 'cccccccc-0000-0000-0000-000000000063';
insert into rank_friends (a, b) values ('aaaaaaaa-0000-0000-0000-000000000061', 'bbbbbbbb-0000-0000-0000-000000000062');

-- 2. Friend challenges by kind.
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000061');
select throws_ok($$ select rank_challenge_friend((select v from ids where k = 'c'), 'dhikr') $$, '22023', null, 'only friends can be challenged');
select throws_ok($$ select rank_challenge_friend((select v from ids where k = 'b'), 'music') $$, '22023', null, 'only known kinds');
insert into ids select 'ch', rank_challenge_friend((select v from ids where k = 'b'), 'dhikr')::text;
select throws_ok($$ select rank_challenge_friend((select v from ids where k = 'b'), 'pages') $$, '22023', null, 'one challenge with a friend at a time');
select is(rank_my_challenges(current_date) -> 0 ->> 'asked', 'true', 'the sender sees it waiting for an answer');
select is(rank_my_challenges(current_date) -> 0 ->> 'kind', 'dhikr', 'with its kind');
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000062');
select is(rank_my_challenges(current_date) -> 0 ->> 'incoming', 'true', 'the friend sees it coming in');
select lives_ok($$ select rank_challenge_answer((select v from ids where k = 'ch')::uuid, true, current_date) $$, 'the friend says yes');
select is((rank_my_challenges(current_date) -> 0 ->> 'me')::int, 3000, 'points are the kind''s own count (dhikr)');
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000061');
select ok((rank_my_challenges(current_date) -> 0 ->> 'me')::int >= 300, 'and the sender''s');
select is(rank_challenge_claim((select v from ids where k = 'ch')::uuid), null, 'no chest before the week is over');
select is((rank_challenge_create('lessons') ->> 'code') is not null, true, 'a link challenge takes a kind');

-- 3. Duels: everyone has a rival at once (no opt-in, no way out), the closest first; the same quests; chest after the week.
select is(rank_my_duel(current_date) -> 'duel' -> 'rival' ->> 'name', 'Bilal', 'a rival at once, without turning anything on');
select rank_set_duels(false);
select is(rank_my_duel(current_date) ->> 'on', 'true', 'weekly rivals cannot be stopped mid-week');
select is(jsonb_array_length(rank_my_duel(current_date) -> 'quests'), 2, 'two duel quests today');
select pg_temp.act_as('cccccccc-0000-0000-0000-000000000063');
select is(rank_my_duel(current_date) -> 'duel', 'null'::jsonb, 'the odd one out waits for the next free player');
select is(rank_my_duel(current_date) -> 'quests', 'null'::jsonb, 'no quests before there is a rival');
select throws_ok($$ select * from rank_duels $$, '42501', null, 'the duels table cannot be read');
reset role;

select * from finish();
rollback;
