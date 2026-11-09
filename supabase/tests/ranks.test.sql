-- Ranks (supabase/migrations/20261110000000_ranks.sql): Google accounts only; nobody reads the tables;
-- reported totals are capped, never go down and grow only as fast as time allows; leagues of ≤ 15;
-- the global board and own boards (invite code, members only).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(24);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aisha@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bilal@example.com'),
  ('cccccccc-0000-0000-0000-000000000003', 'carim@example.com');
insert into auth.users (id, is_anonymous) values ('dddddddd-0000-0000-0000-000000000004', true);

create function pg_temp.act_as(uid text, anonymous boolean default false) returns void language sql as $$
  reset role;
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'is_anonymous', anonymous)::text, true);
  set local role authenticated;
$$;
create function pg_temp.act_as_visitor() returns void language sql as $$
  reset role;
  select set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
$$;
create temp table ids (k text primary key, v text);
grant all on ids to authenticated, anon;

-- Who can play
select pg_temp.act_as('dddddddd-0000-0000-0000-000000000004', true);
select throws_ok($$ select rank_report(current_date, 1, 0, 0, 0, 'Guest') $$, '42501', null, 'an anonymous session cannot play');
select pg_temp.act_as_visitor();
select throws_ok($$ select rank_report(current_date, 1, 0, 0, 0, 'Visitor') $$, '42501', null, 'a visitor cannot play');

-- Reporting
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select throws_ok($$ select rank_report(current_date - 10, 1, 0, 0, 0, 'Aisha') $$, '22023', null, 'an old day cannot be reported');
select is(rank_report(current_date, 500, 999999, 50, 50, 'Aisha'), 60 * 10 + 65 * 2 + 10 * 30 + 3 * 15 + 20, 'capped: 60 pages, 10 surahs, 3 reels, listening ≤ the hour since joining + 5 min');
select throws_ok($$ select * from rank_days $$, '42501', null, 'the tables cannot be read directly');
select throws_ok($$ select * from rank_players $$, '42501', null, 'nor the players');
-- A minute later (the report time moved back).
reset role;
update rank_days set updated_at = now() - interval '1 minute' where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select is(rank_report(current_date, 1, 0, 0, 0, 'Aisha'), 60 * 10 + 65 * 2 + 10 * 30 + 3 * 15 + 20, 'numbers never go down');
select is(rank_report(current_date - 1, 40, 0, 0, 0, 'Aisha'), 3 * 10 + 20, 'right after a report a day grows by 3 pages at most');
select is(rank_report(current_date - 1, 40, 0, 0, 0, 'Aisha'), 3 * 10 + 20, 'a second report within 20 s changes nothing');
select is((rank_status(current_date) ->> 'name'), 'Aisha', 'the status has the name');
select is((rank_status(current_date) ->> 'weekPlace')::int, 1, 'first this week');
select lives_ok($$ select rank_set_name('Aisha B') $$, 'the name can change');
select throws_ok($$ select rank_set_name('  ') $$, '22023', null, 'not to nothing');

-- Leagues and the global board
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000002');
select is(rank_report(current_date, 2, 600, 0, 0, 'Bilal'), 2 * 10 + 10 * 2 + 20, 'Bilal reports');
select is(jsonb_array_length(rank_league(current_date) -> 'players'), 2, 'both are in the same league');
select is((rank_league(current_date) -> 'players' -> 0 ->> 'name'), 'Aisha B', 'best first');
select is(jsonb_array_length(rank_global(current_date, false)), 2, 'the weekly global board lists both');
select is((rank_global(current_date, true) -> 1 ->> 'me')::boolean, true, 'and marks me');

-- Own boards
select throws_ok($$ select rank_create_board('') $$, '22023', null, 'a board needs a name');
insert into ids select 'b', rank_create_board('Family') ->> 'code';
select pg_temp.act_as('cccccccc-0000-0000-0000-000000000003');
select throws_ok($$ select rank_join_board((select v from ids where k = 'b')) $$, '22023', null, 'a player who never reported cannot join');
select pg_temp.act_as_visitor();
select is((rank_board_preview((select v from ids where k = 'b')) ->> 'members')::int, 1, 'anyone sees the invite');
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
insert into ids select 'bid', rank_join_board((select v from ids where k = 'b'))::text;
select is(jsonb_array_length(rank_board((select v::uuid from ids where k = 'bid'), current_date)), 2, 'a member sees the board');
select pg_temp.act_as('cccccccc-0000-0000-0000-000000000003');
select throws_ok($$ select rank_board((select v::uuid from ids where k = 'bid'), current_date) $$, '42501', null, 'others do not');
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000002');
select lives_ok($$ select rank_leave_board((select v::uuid from ids where k = 'bid')) $$, 'the owner leaving deletes the board');

select * from finish();
rollback;
