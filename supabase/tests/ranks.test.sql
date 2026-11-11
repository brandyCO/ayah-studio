-- Ranks (supabase/migrations/20261110000000_ranks.sql, 20261110100000_rank_moves.sql,
-- 20261110200000_ranks_more.sql, 20261110300000_rank_prizes.sql, 20261110400000_rank_prize_items.sql, 20261110500000_rank_challenges.sql, 20261110710000_rank_figures.sql, 20261110900000_rank_prize_pieces.sql, 20261111300000_rank_figure_more.sql, 20261111310000_rank_rooms.sql): Google accounts only; nobody reads the tables;
-- reported totals are capped, never go down and grow only as fast as time allows; leagues of ≤ 15;
-- the global board and own boards (invite code, members only).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(81);

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
-- Places moved since yesterday: Bilal led before today, Aisha passed him today (nothing moves on a Monday).
reset role;
update rank_weeks set score = 1200 where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
update rank_weeks set score = 500 where user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
insert into ids values ('mv', case when current_date = rank_week(current_date) then '0' else '1' end);
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000002');
select is((rank_league(current_date) -> 'players' -> 0 ->> 'move')::int, (select v::int from ids where k = 'mv'), 'Aisha moved up a place');
select is((rank_league(current_date) -> 'players' -> 1 ->> 'move')::int, -(select v::int from ids where k = 'mv'), 'Bilal moved down one');
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
-- Measures, goals, quest, rival, avatars and private mode
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select is((rank_board((select v::uuid from ids where k = 'bid'), current_date, 'listen') -> 1 ->> 'score')::int, 10, 'a board by minutes listened');
select throws_ok($$ select rank_global(current_date, false, 'dhikr') $$, '22023', null, 'dhikr is never ranked');
select throws_ok($$ select rank_set_board_goal((select v::uuid from ids where k = 'bid'), 100) $$, '42501', null, 'only the owner sets the goal');
select is(rank_status(current_date) -> 'quest' ->> 'bonus', '50', 'the status has this week''s quest');
select lives_ok($$ select rank_set_look(5, false) $$, 'an avatar can be picked');
select throws_ok($$ select rank_set_look(99, false) $$, '22023', null, 'only one of ours');
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000002');
select lives_ok($$ select rank_set_board_goal((select v::uuid from ids where k = 'bid'), 100) $$, 'the owner sets a goal');
select is((rank_board_goal((select v::uuid from ids where k = 'bid'), current_date) ->> 'goal')::int, 100, 'members see it');
select is((rank_status(current_date) -> 'rival' ->> 'gap')::int, 700, 'my rival is 700 points ahead');
select is((rank_league(current_date) -> 'players' -> 0 ->> 'avatar')::int, 5, 'with their avatar');
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select lives_ok($$ select rank_set_look(5, true) $$, 'a player can go private');
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000002');
select is(rank_league(current_date) -> 'players' -> 0 ->> 'name', null, 'others no longer see the name');
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000002');
select lives_ok($$ select rank_leave_board((select v::uuid from ids where k = 'bid')) $$, 'the owner leaving deletes the board');

-- Prizes: Emre won last week's league of 3, so this week he moves up and wins a trophy, Light and a freeze.
reset role;
insert into auth.users (id, email) values ('eeeeeeee-0000-0000-0000-000000000005', 'emre@example.com'),
  ('ffffffff-0000-0000-0000-000000000006', 'farah@example.com'), ('99999999-0000-0000-0000-000000000007', 'gamal@example.com');
insert into rank_players (user_id, name) values ('eeeeeeee-0000-0000-0000-000000000005', 'Emre');
insert into rank_leagues (id, week, tier, size) values ('11111111-0000-0000-0000-000000000001', rank_week(current_date) - 7, 0, 3);
insert into rank_weeks (user_id, week, score, league) values
  ('eeeeeeee-0000-0000-0000-000000000005', rank_week(current_date) - 7, 900, '11111111-0000-0000-0000-000000000001'),
  ('ffffffff-0000-0000-0000-000000000006', rank_week(current_date) - 7, 500, '11111111-0000-0000-0000-000000000001'),
  ('99999999-0000-0000-0000-000000000007', rank_week(current_date) - 7, 300, '11111111-0000-0000-0000-000000000001');
insert into ids values ('lastwk', (rank_week(current_date) - 7)::text),
  ('item', rank_prize_item(rank_week(current_date) - 7, 1)), ('other', rank_prize_item(rank_week(current_date), 1));
select pg_temp.act_as('eeeeeeee-0000-0000-0000-000000000005');
select is((rank_status(current_date) ->> 'tier')::int, 1, 'the winner moves up a tier');
select is((rank_my_prizes() -> 0 ->> 'light')::int, 350, '#1: 300 Light, and 50 for moving up');
select is((rank_my_prizes() -> 0 ->> 'freeze')::boolean, true, 'and a streak freeze');
select is((rank_claim_prize((select v::date from ids where k = 'lastwk')) ->> 'light')::int, 350, 'claimed once');
select is(rank_claim_prize((select v::date from ids where k = 'lastwk')), null, 'not twice');
select lives_ok($$ select rank_set_look(36, false, 5) $$, 'a champion avatar and the gold laurel, won');
select throws_ok($$ select rank_set_look(37, false, 0) $$, '42501', null, 'the next champion avatar needs 3 wins');
select throws_ok($$ select rank_set_look(0, false, 4) $$, '42501', null, 'the sun frame needs the Sun tier');
select is(rank_my_prizes() -> 0 ->> 'item', (select v from ids where k = 'item'), 'the week''s avatar comes with #1');
select lives_ok($$ select rank_set_look(substr((select v from ids where k = 'item'), 4)::int, false, 0) $$, 'and can be worn');
select throws_ok($$ select rank_set_look(substr((select v from ids where k = 'other'), 4)::int, false, 0) $$, '42501', null, 'another week''s avatar cannot');
select throws_ok($$ select rank_set_look(0, false, 8) $$, '42501', null, 'nor a frame won by #2 or #3');
-- Characters (20261110710000_rank_figures.sql): any well-formed one, the champion's outfit only for a #1.
select lives_ok($$ select rank_set_figure('02010110600000') $$, 'Emre (a #1) can wear the champion''s outfit');
select is(rank_my_figure(), '02010110600000', 'and it is kept');
select throws_ok($$ select rank_set_figure('nope') $$, '22023', null, 'only a well-formed character');
select is((select f ->> 'figure' from jsonb_array_elements(rank_league(current_date) -> 'players') f where (f ->> 'me')::boolean), '02010110600000', 'the boards show it');
-- Prize pieces (20261110900000_rank_prize_pieces.sql): the week's piece comes with a top-3 place and only its winners wear it.
select is(rank_my_prizes() -> 0 ->> 'piece', rank_prize_piece((select v::date from ids where k = 'lastwk')), 'the week''s character piece comes with the place');
select lives_ok(format($$ select rank_set_figure(%L) $$, (select case split_part(p, ':', 1) when 'outfit' then '02010110700000' when 'glasses' then '02010110003000' when 'hold' then '02010110000' || split_part(p, ':', 2) || '00' else '0201011000000' || split_part(p, ':', 2) end
  from (select rank_prize_piece((select v::date from ids where k = 'lastwk')) p) x)), 'and can be worn');
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000002');
select throws_ok($$ select rank_set_figure('02010110700000') $$, '42501', null, 'a prize robe not won cannot');
select throws_ok($$ select rank_set_figure('02010110000009') $$, '42501', null, 'nor a prize background');
select throws_ok($$ select rank_set_figure('02010110600000') $$, '42501', null, 'not without a week won at #1');
select lives_ok($$ select rank_set_figure('02010110000000') $$, 'any other character');
select lives_ok($$ select rank_set_figure('0201011000000021301214') $$, 'a round-5 character with 22 digits');
select throws_ok($$ select rank_set_figure('020101100000002') $$, '22023', null, 'but not 15');
select throws_ok($$ select rank_set_figure('0201011070000021301214') $$, '42501', null, 'and the prize robe is still checked');
-- Rooms (20261111310000_rank_rooms.sql): a short code of what stands in the room, shown on the boards.
select lives_ok($$ select rank_set_room('wall:zellige,pet:ginger,b:42,c:13') $$, 'a room can be kept');
select throws_ok($$ select rank_set_room('<script>') $$, '22023', null, 'only a well-formed room');
select is((select f ->> 'room' from jsonb_array_elements(rank_league(current_date) -> 'players') f where (f ->> 'me')::boolean), 'wall:zellige,pet:ginger,b:42,c:13', 'the boards show it');
select lives_ok($$ select rank_set_figure(null) $$, 'and back to the avatar disc');

-- Friend challenge (20261110500000_rank_challenges.sql): a week of pages and listening, one friend.
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
insert into ids select 'ch', rank_challenge_create() ->> 'code';
select throws_ok($$ select rank_challenge_accept((select v from ids where k = 'ch'), current_date) $$, '22023', null, 'a challenge is sent to someone else');
select pg_temp.act_as_visitor();
select is((rank_challenge_preview((select v from ids where k = 'ch')) ->> 'taken')::boolean, false, 'anyone sees the challenge invite');
select pg_temp.act_as('dddddddd-0000-0000-0000-000000000004', true);
select throws_ok($$ select rank_challenge_accept((select v from ids where k = 'ch'), current_date) $$, '42501', null, 'an anonymous session cannot accept');
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000002');
insert into ids select 'chid', rank_challenge_accept((select v from ids where k = 'ch'), current_date)::text;
select is(rank_challenge_accept((select v from ids where k = 'ch'), current_date)::text, (select v from ids where k = 'chid'), 'accepting twice is the same challenge');
select is((rank_my_challenges(current_date) -> 0 ->> 'waiting')::boolean, false, 'the friend sees it running');
select is(rank_challenge_claim((select v::uuid from ids where k = 'chid')), null, 'nothing to claim while it runs');
select throws_ok($$ select * from rank_challenges $$, '42501', null, 'the challenges cannot be read directly');
select pg_temp.act_as('cccccccc-0000-0000-0000-000000000003');
select throws_ok($$ select rank_challenge_accept((select v from ids where k = 'ch'), current_date) $$, '22023', null, 'a third player cannot take it');
-- The week is over: Aisha read more.
reset role;
update rank_challenges set start = current_date - 9 where id = (select v::uuid from ids where k = 'chid');
insert into rank_days (user_id, day, pages, listen) values
  ('aaaaaaaa-0000-0000-0000-000000000001', current_date - 5, 5, 600),
  ('bbbbbbbb-0000-0000-0000-000000000002', current_date - 5, 2, 0)
  on conflict (user_id, day) do update set pages = excluded.pages, listen = excluded.listen;
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select is((rank_my_challenges(current_date) -> 0 ->> 'me')::int, 5 * 10 + 10 * 2, 'pages and minutes count');
select is(rank_challenge_claim((select v::uuid from ids where k = 'chid')) ->> 'light', '100', 'the winner gets 100 Light');
select is(rank_challenge_claim((select v::uuid from ids where k = 'chid')), null, 'once');
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000002');
select is(rank_challenge_claim((select v::uuid from ids where k = 'chid')) ->> 'result', 'lost', 'the friend sees the result');
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
insert into ids select 'ch2', rank_challenge_create() ->> 'id';
select lives_ok($$ select rank_challenge_cancel((select v::uuid from ids where k = 'ch2')) $$, 'an untaken invite can be taken back');
select is((select count(*)::int from jsonb_array_elements(rank_my_challenges(current_date))), 1, 'and is gone');

select * from finish();
rollback;
