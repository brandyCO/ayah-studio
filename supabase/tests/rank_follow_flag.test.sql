-- Following, flags and badges on profiles (supabase/migrations/20261118100000_rank_follow_flag.sql).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
create or replace function public.rank_xp_mult(d date) returns numeric language sql stable as 'select 1::numeric';

select plan(34);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000071', 'amal@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000072', 'bilal@example.com'),
  ('cccccccc-0000-0000-0000-000000000073', 'dina@example.com'),
  ('dddddddd-0000-0000-0000-000000000074', 'omar@example.com');

create function pg_temp.act_as(uid text) returns void language sql as $$
  reset role;
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  set local role authenticated;
$$;
create temp table ids (k text primary key, v text);
grant all on ids to authenticated;

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000071');
select rank_report(current_date, 2, 0, 0, 0, 'Amal');
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000072');
select rank_report(current_date, 1, 0, 0, 0, 'Bilal');
select pg_temp.act_as('cccccccc-0000-0000-0000-000000000073');
select rank_report(current_date, 1, 0, 0, 0, 'Dina');
select pg_temp.act_as('dddddddd-0000-0000-0000-000000000074');
select rank_report(current_date, 1, 0, 0, 0, 'Omar');
reset role;
insert into ids select 'a', pid from rank_players where user_id = 'aaaaaaaa-0000-0000-0000-000000000071';
insert into ids select 'b', pid from rank_players where user_id = 'bbbbbbbb-0000-0000-0000-000000000072';
insert into ids select 'c', pid from rank_players where user_id = 'cccccccc-0000-0000-0000-000000000073';
insert into ids select 'd', pid from rank_players where user_id = 'dddddddd-0000-0000-0000-000000000074';

-- One tap, no request.
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000071');
select is(rank_follow((select v from ids where k = 'b')), 'following', 'a player is followed at once');
select is(rank_follow((select v from ids where k = 'b')), 'following', 'following twice is fine');
select throws_ok($$select rank_follow((select v from ids where k = 'a'))$$, '22023', null, 'you cannot follow yourself');
select throws_ok($$select rank_follow('nobody')$$, 'P0002', null, 'nor a player that does not exist');
select is(rank_profile((select v from ids where k = 'b'), current_date) -> 'follow' ->> 'on', 'true', 'the profile says you follow them');
select is(rank_profile((select v from ids where k = 'b'), current_date) -> 'follow' ->> 'back', 'false', 'and that they do not follow you');
select is(rank_profile((select v from ids where k = 'b'), current_date) -> 'follow' ->> 'followers', '1', 'they have one follower');
select is(rank_profile((select v from ids where k = 'b'), current_date) ->> 'relation', 'none', 'following is not friendship');
select is(jsonb_array_length(rank_my_follows(current_date) -> 'following'), 1, 'they are in your Following list');

-- Bilal sees a new follower and follows back.
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000072');
select is(rank_my_follows(current_date) -> 'followers' -> 0 ->> 'name', 'Amal', 'the new follower shows for the bell');
select is(rank_my_follows(current_date) -> 'followers' -> 0 ->> 'on', 'false', 'not followed back yet');
select is(rank_follow((select v from ids where k = 'a')), 'following', 'following back');
select is(rank_profile((select v from ids where k = 'a'), current_date) -> 'follow' ->> 'back', 'true', 'both follow each other');
select is(jsonb_array_length(rank_follow_list((select v from ids where k = 'a'), 'followers')), 1, 'a followers list');
select is(rank_follow_list((select v from ids where k = 'a'), 'following') -> 0 ->> 'name', 'Bilal', 'a following list');
select throws_ok($$select rank_follow_list((select v from ids where k = 'a'), 'everyone')$$, '22023', null, 'only those two lists');

-- Unfollow and remove a follower.
select lives_ok($$select rank_unfollow((select v from ids where k = 'a'))$$, 'unfollow');
select is(rank_profile((select v from ids where k = 'a'), current_date) -> 'follow' ->> 'on', 'false', 'no longer following');
select lives_ok($$select rank_drop_follower((select v from ids where k = 'a'))$$, 'remove a follower');
select is(rank_profile((select v from ids where k = 'a'), current_date) -> 'follow' ->> 'back', 'false', 'they no longer follow you');

-- Flags: chosen, checked, shown with the face.
select pg_temp.act_as('cccccccc-0000-0000-0000-000000000073');
select lives_ok($$select rank_set_flag('lb')$$, 'a flag is chosen (any case)');
select throws_ok($$select rank_set_flag('ZZ')$$, '22023', null, 'only real countries');
select pg_temp.act_as('dddddddd-0000-0000-0000-000000000074');
select is(rank_profile((select v from ids where k = 'c'), current_date) ->> 'flag', 'LB', 'others see the flag');
select is((select x ->> 'flag' from jsonb_array_elements(rank_league(current_date) -> 'players') x where x ->> 'name' = 'Dina'), 'LB',
  'boards show it too');

-- Badges on the profile.
select pg_temp.act_as('cccccccc-0000-0000-0000-000000000073');
select lives_ok($$select rank_set_badges(array['streak-2', 'pages-1'], 9)$$, 'best badges are sent');
select throws_ok($$select rank_set_badges(array['<b>'], 1)$$, '22023', null, 'only badge ids');
select pg_temp.act_as('dddddddd-0000-0000-0000-000000000074');
select is(rank_profile((select v from ids where k = 'c'), current_date) -> 'badges' ->> 'n', '9', 'others see the badges');

-- Friends follow each other from the start.
select is(rank_friend_ask((select v from ids where k = 'c')), 'sent', 'Omar asks Dina');
select pg_temp.act_as('cccccccc-0000-0000-0000-000000000073');
select is(rank_friend_ask((select v from ids where k = 'd')), 'friend', 'Dina accepts');
select is(rank_profile((select v from ids where k = 'd'), current_date) -> 'follow' ->> 'on', 'true', 'friends follow each other');

-- Blocking ends follows and refuses new ones; private players cannot be followed.
select lives_ok($$select rank_block((select v from ids where k = 'd'))$$, 'Dina blocks Omar');
select pg_temp.act_as('dddddddd-0000-0000-0000-000000000074');
select throws_ok($$select rank_follow((select v from ids where k = 'c'))$$, '42501', null, 'a blocked player cannot follow');
reset role;
update rank_players set private = true where user_id = 'bbbbbbbb-0000-0000-0000-000000000072';
select pg_temp.act_as('dddddddd-0000-0000-0000-000000000074');
select throws_ok($$select rank_follow((select v from ids where k = 'b'))$$, '42501', null, 'a private player cannot be followed');
select is(jsonb_array_length(rank_follow_list((select v from ids where k = 'b'), 'followers')), 0, 'nor their lists seen');
select finish();
rollback;
