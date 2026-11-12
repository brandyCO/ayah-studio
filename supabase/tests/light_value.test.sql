-- Friday double XP, Light frames, the lamp of Light and gifts between friends
-- (supabase/migrations/20261112200000_light_value.sql).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(23);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000071', 'amal@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000072', 'bilal@example.com'),
  ('cccccccc-0000-0000-0000-000000000073', 'dina@example.com');

create function pg_temp.act_as(uid text) returns void language sql as $$
  reset role;
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  set local role authenticated;
$$;
create temp table ids (k text primary key, v text);
grant all on ids to authenticated;

-- 1. Friday counts twice, every other day once.
select is(rank_xp_mult(date '2026-11-13'), 2::numeric, 'a Friday counts twice');
select is(rank_xp_mult(date '2026-11-12'), 1::numeric, 'a Thursday once');
select is(rank_xp_mult(date '2026-11-14'), 1::numeric, 'a Saturday once');
select is(rank_xp_mult(date '2027-03-02'), 2::numeric, 'the 23rd night of Ramadan 1448 counts twice');
select is(rank_xp_mult(date '2027-03-01'), 1.5, 'an even night of the last ten 1.5 times');
select is(rank_xp_mult(date '2027-03-09'), 1::numeric, 'Eid day once');
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000071');
select is(rank_report(current_date, 2, 0, 0, 0, 'Amal'), round(40 * rank_xp_mult(current_date))::int, 'the day''s score uses it');
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000072');
select rank_report(current_date, 1, 0, 0, 0, 'Bilal');
select pg_temp.act_as('cccccccc-0000-0000-0000-000000000073');
select rank_report(current_date, 1, 0, 0, 0, 'Dina');
reset role;
insert into ids select 'a', pid from rank_players where user_id = 'aaaaaaaa-0000-0000-0000-000000000071';
insert into ids select 'b', pid from rank_players where user_id = 'bbbbbbbb-0000-0000-0000-000000000072';
insert into ids select 'c', pid from rank_players where user_id = 'cccccccc-0000-0000-0000-000000000073';
insert into rank_friends (a, b) values ('aaaaaaaa-0000-0000-0000-000000000071', 'bbbbbbbb-0000-0000-0000-000000000072');

-- 2. Light frames 14–19 can be worn; the weekly prize frames still need winning.
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000071');
select lives_ok($$ select rank_set_look(0, false, 16) $$, 'a Light frame can be worn');
select throws_ok($$ select rank_set_look(0, false, 9) $$, '42501', null, 'a prize frame still needs winning');
select throws_ok($$ select rank_set_look(0, false, 20) $$, '22023', null, 'no frame past 19');

-- 3. The lamp of Light.
select lives_ok($$ select rank_set_lamp(9) $$, 'the lamp is reported');
reset role;
select is((select lamp from rank_players where user_id = 'aaaaaaaa-0000-0000-0000-000000000071')::int, 4, 'kept between 0 and 4');
select is((select rank_face(p, 'bbbbbbbb-0000-0000-0000-000000000072') ->> 'lamp' from rank_players p where user_id = 'aaaaaaaa-0000-0000-0000-000000000071'), '4', 'shown with the player''s row');

-- 4. Gifts.
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000071');
select throws_ok($$ select rank_gift_send((select v from ids where k = 'c'), 50) $$, '42501', null, 'only to friends');
select throws_ok($$ select rank_gift_send((select v from ids where k = 'b'), 5000) $$, '22023', null, 'Light between 10 and 200');
select throws_ok($$ select rank_gift_send((select v from ids where k = 'b'), 0, 'av:40') $$, '22023', null, 'never a prize piece');
insert into ids select 'g1', rank_gift_send((select v from ids where k = 'b'), 50)::text;
insert into ids select 'g2', rank_gift_send((select v from ids where k = 'b'), 0, 'fr:14')::text;
select throws_ok($$ select rank_gift_send((select v from ids where k = 'b'), 0, 'fr:14') $$, '22023', null, 'the same piece once');
select rank_gift_send((select v from ids where k = 'b'), 10);
select throws_ok($$ select rank_gift_send((select v from ids where k = 'b'), 10) $$, '22023', null, 'three gifts a day');
select is(jsonb_array_length(rank_my_gifts()), 0, 'the sender has none waiting');
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000072');
select is(jsonb_array_length(rank_my_gifts()), 3, 'the friend has three waiting');
select is(rank_gift_open((select v from ids where k = 'g1')::uuid) ->> 'light', '50', 'opened once, with its Light');
select is(rank_gift_open((select v from ids where k = 'g1')::uuid), null, 'never twice');

select * from finish();
rollback;
