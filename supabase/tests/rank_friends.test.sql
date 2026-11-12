-- Friends (supabase/migrations/20261111400000_rank_friends.sql): public ids, profiles with what a player shows, asks
-- that become friends, invite links, the friend streak, and tables nobody can read.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(20);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000031', 'amal@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000032', 'bilal@example.com'),
  ('cccccccc-0000-0000-0000-000000000033', 'dina@example.com');

create function pg_temp.act_as(uid text) returns void language sql as $$
  reset role;
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  set local role authenticated;
$$;
create temp table ids (k text primary key, v text);
grant all on ids to authenticated;

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000031');
select rank_report(current_date, 2, 0, 0, 0, 'Amal');
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000032');
select rank_report(current_date, 1, 0, 0, 0, 'Bilal');
select pg_temp.act_as('cccccccc-0000-0000-0000-000000000033');
select rank_report(current_date, 1, 0, 0, 0, 'Dina');
reset role;
insert into ids select 'a', pid from rank_players where user_id = 'aaaaaaaa-0000-0000-0000-000000000031';
insert into ids select 'b', pid from rank_players where user_id = 'bbbbbbbb-0000-0000-0000-000000000032';
insert into ids select 'c', pid from rank_players where user_id = 'cccccccc-0000-0000-0000-000000000033';
select isnt((select v from ids where k = 'a'), null, 'every player has a public id');

-- The league row carries it.
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000031');
select is((rank_league(current_date) -> 'players' -> 0 ->> 'pid') is not null, true, 'league rows carry the public id');

-- A profile shows what the player chose.
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000032');
select rank_set_profile(1, 12);
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000031');
select is(rank_profile((select v from ids where k = 'b'), current_date) ->> 'name', 'Bilal', 'a profile opens');
select is(rank_profile((select v from ids where k = 'b'), current_date) ? 'week', true, 'with this week''s points (chosen)');
select is(rank_profile((select v from ids where k = 'b'), current_date) ? 'streak', false, 'not the streak (not chosen)');
select is(rank_profile((select v from ids where k = 'b'), current_date) ->> 'relation', 'none', 'not friends yet');
select throws_ok($$ select rank_set_profile(99, 1) $$, '22023', null, 'only the five choices');

-- Ask, then the other side accepts.
select is(rank_friend_ask((select v from ids where k = 'b')), 'sent', 'an ask is sent');
select is(rank_profile((select v from ids where k = 'b'), current_date) ->> 'relation', 'sent', 'shown as sent');
select throws_ok($$ select rank_friend_ask((select v from ids where k = 'a')) $$, '22023', null, 'not yourself');
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000032');
select is(jsonb_array_length(rank_my_friends(current_date) -> 'asks'), 1, 'the ask waits for them');
select lives_ok($$ select rank_friend_answer((select v from ids where k = 'a'), true) $$, 'and is accepted');
select is(rank_profile((select v from ids where k = 'a'), current_date) ->> 'relation', 'friend', 'now friends');
select is((rank_my_friends(current_date) -> 'friends' -> 0 ->> 'streak')::int, 1, 'both earned points today: a streak of 1');
select is((rank_profile((select v from ids where k = 'a'), current_date) -> 'friend' ->> 'meToday')::boolean, true, 'today counted for both');

-- An invite link makes friends at once.
select pg_temp.act_as('cccccccc-0000-0000-0000-000000000033');
insert into ids select 'inv', rank_friend_invite();
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000031');
select is(rank_friend_invite_preview((select v from ids where k = 'inv')) ->> 'name', 'Dina', 'the invite shows who sent it');
select lives_ok($$ select rank_friend_join((select v from ids where k = 'inv')) $$, 'joining it');
select is(jsonb_array_length(rank_my_friends(current_date) -> 'friends'), 2, 'makes friends at once');
select lives_ok($$ select rank_friend_remove((select v from ids where k = 'c')) $$, 'a friend can be removed');

select throws_ok($$ select * from rank_friends $$, '42501', null, 'the table cannot be read');

select * from finish();
rollback;
