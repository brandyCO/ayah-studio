-- Report and block players (supabase/migrations/20261118000000_rank_block_report.sql).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
create or replace function public.rank_xp_mult(d date) returns numeric language sql stable as 'select 1::numeric';

select plan(22);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000061', 'amal@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000062', 'bilal@example.com'),
  ('cccccccc-0000-0000-0000-000000000063', 'dina@example.com'),
  ('dddddddd-0000-0000-0000-000000000064', 'omar@example.com');

create function pg_temp.act_as(uid text) returns void language sql as $$
  reset role;
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  set local role authenticated;
$$;
create temp table ids (k text primary key, v text);
grant all on ids to authenticated;

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000061');
select rank_report(current_date, 2, 0, 0, 0, 'Amal');
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000062');
select rank_report(current_date, 1, 0, 0, 0, 'Rude name');
select pg_temp.act_as('cccccccc-0000-0000-0000-000000000063');
select rank_report(current_date, 1, 0, 0, 0, 'Dina');
select pg_temp.act_as('dddddddd-0000-0000-0000-000000000064');
select rank_report(current_date, 1, 0, 0, 0, 'Omar');
reset role;
insert into ids select 'a', pid from rank_players where user_id = 'aaaaaaaa-0000-0000-0000-000000000061';
insert into ids select 'b', pid from rank_players where user_id = 'bbbbbbbb-0000-0000-0000-000000000062';

-- Friends first, then Amal blocks Bilal.
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000061');
select is(rank_friend_ask((select v from ids where k = 'b')), 'sent', 'an ask is sent');
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000062');
select is(rank_friend_ask((select v from ids where k = 'a')), 'friend', 'asked back: friends');
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000061');
select lives_ok($$select rank_block((select v from ids where k = 'b'))$$, 'a player can be blocked');
select lives_ok($$select rank_block((select v from ids where k = 'b'))$$, 'blocking twice is fine');
select throws_ok($$select rank_block((select v from ids where k = 'a'))$$, '22023', null, 'you cannot block yourself');
select throws_ok($$select rank_block('nobody')$$, 'P0002', null, 'nor a player that does not exist');

-- The blocker sees "Blocked player" everywhere rank_face is used.
select is(rank_profile((select v from ids where k = 'b'), current_date) ->> 'blocked', 'true', 'the profile says blocked');
select is(rank_profile((select v from ids where k = 'b'), current_date) ->> 'name', null, 'without the name');
select is(rank_profile((select v from ids where k = 'b'), current_date) ->> 'figure', null, 'or the character');
select is((select count(*) from jsonb_array_elements(rank_league(current_date) -> 'players') x
  where x ->> 'name' = 'Rude name')::int, 0, 'the league never shows the blocked name');
select is(rank_profile((select v from ids where k = 'b'), current_date) ->> 'relation', 'none', 'the friendship ended');
select is(rank_my_blocks() -> 0 ->> 'name', 'Rude name', 'the blocked list names them, to unblock');

-- Others still see Bilal as before.
select pg_temp.act_as('cccccccc-0000-0000-0000-000000000063');
select is(rank_profile((select v from ids where k = 'b'), current_date) ->> 'name', 'Rude name', 'others are not affected');

-- Nothing passes between the two, either way.
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000062');
select throws_ok($$select rank_friend_ask((select v from ids where k = 'a'))$$, '42501', null, 'the blocked player cannot ask to be friends');
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000061');
select throws_ok($$select rank_friend_ask((select v from ids where k = 'b'))$$, '42501', null, 'nor can the blocker while blocked');

-- Unblock: back to normal.
select lives_ok($$select rank_unblock((select v from ids where k = 'b'))$$, 'unblock');
select is(rank_profile((select v from ids where k = 'b'), current_date) ->> 'name', 'Rude name', 'the name shows again');
select is(jsonb_array_length(rank_my_blocks()), 0, 'the blocked list is empty');

-- Reports.
select throws_ok($$select rank_report_player((select v from ids where k = 'b'), 'mean', null)$$, '22023', null, 'a reason from the list only');
select rank_report_player((select v from ids where k = 'b'), 'name', 'not a nice name');
select pg_temp.act_as('cccccccc-0000-0000-0000-000000000063');
select rank_report_player((select v from ids where k = 'b'), 'name', null);
select pg_temp.act_as('dddddddd-0000-0000-0000-000000000064');
select rank_report_player((select v from ids where k = 'b'), 'name', null);
reset role;
select is((select count(*) from rank_player_reports)::int, 3, 'three reports are kept');
select is((select name from rank_players where user_id = 'bbbbbbbb-0000-0000-0000-000000000062'), 'Reader', 'a name three players reported becomes Reader');

-- Nobody reads the tables.
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000061');
select throws_ok($$select * from rank_player_reports$$, '42501', null, 'reports are not readable from the app');

select * from finish();
rollback;
