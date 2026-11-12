-- The week ends at each player's own Friday Maghrib; leagues by clock; results wait for the last member
-- (supabase/migrations/20261112300000_maghrib_week.sql).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
create or replace function public.rank_xp_mult(d date) returns numeric language sql stable as 'select 1::numeric';

select plan(25);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000081', 'a@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000082', 'b@example.com'),
  ('cccccccc-0000-0000-0000-000000000083', 'c@example.com'),
  ('dddddddd-0000-0000-0000-000000000084', 'd@example.com'),
  ('eeeeeeee-0000-0000-0000-000000000085', 'e@example.com');

create function pg_temp.act_as(uid text) returns void language sql as $$
  reset role;
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  set local role authenticated;
$$;

-- 1. Weeks: the bridge week of 9 November ends on Friday 13th, then Saturday → Friday.
select is(rank_week(date '2026-11-12'), date '2026-11-09', 'Thursday 12th is in the bridge week');
select is(rank_week(date '2026-11-13'), date '2026-11-09', 'so is Friday 13th');
select is(rank_week(date '2026-11-14'), date '2026-11-14', 'Saturday 14th starts a week');
select is(rank_week(date '2026-11-20'), date '2026-11-14', 'which ends on Friday 20th');
select is(rank_week(date '2026-11-21'), date '2026-11-21', 'the next starts on Saturday 21st');
select is(rank_week(date '2026-11-03'), date '2026-11-02', 'weeks before stay Monday weeks');
select is(rank_prev_week(date '2026-11-14'), date '2026-11-09', 'the week before the first Saturday week is the bridge');
select is(rank_prev_week(date '2026-11-21'), date '2026-11-14', 'then seven days back');
select is(rank_week_last(date '2026-11-09'), date '2026-11-13', 'the bridge week ends on Friday');
select is(array[rank_week_no(date '2026-11-09'), rank_week_no(date '2026-11-14'), rank_week_no(date '2026-11-21')], array[0, 1, 2], 'rotations go on in order');
select lives_ok($$ select rank_check_day(current_date + 2) $$, 'an Islamic day two ahead of UTC can be reported');

-- 2. Leagues by clock: within 2 hours share a league, far apart do not.
select pg_temp.act_as('cccccccc-0000-0000-0000-000000000083');
select rank_report(current_date, 1, 0, 0, 0, 'C', 0, 0, 0, null, 0);
select pg_temp.act_as('dddddddd-0000-0000-0000-000000000084');
select rank_report(current_date, 1, 0, 0, 0, 'D', 0, 0, 0, null, 600);
select pg_temp.act_as('eeeeeeee-0000-0000-0000-000000000085');
select rank_report(current_date, 1, 0, 0, 0, 'E', 0, 0, 0, now() + interval '1 day', 60);
reset role;
select is((select utc_off from rank_players where user_id = 'dddddddd-0000-0000-0000-000000000084'), 600::smallint, 'the clock is kept');
select isnt((select league from rank_weeks where user_id = 'dddddddd-0000-0000-0000-000000000084' and week = rank_week(current_date)),
            (select league from rank_weeks where user_id = 'cccccccc-0000-0000-0000-000000000083' and week = rank_week(current_date)),
            '10 hours apart: another league');
select is((select league from rank_weeks where user_id = 'eeeeeeee-0000-0000-0000-000000000085' and week = rank_week(current_date)),
          (select league from rank_weeks where user_id = 'cccccccc-0000-0000-0000-000000000083' and week = rank_week(current_date)),
          '1 hour apart: the same league');
select ok((select ends_at from rank_weeks where user_id = 'eeeeeeee-0000-0000-0000-000000000085' and week = rank_week(current_date))
          <= ((rank_week_last(rank_week(current_date)) + 1)::timestamp + interval '8 hours') at time zone 'UTC',
          'a week end is never later than Saturday morning UTC');

-- 3. Waiting for the others' Maghrib: A's week is over, B's is not.
insert into rank_players (user_id, name, utc_off) values
  ('aaaaaaaa-0000-0000-0000-000000000081', 'A', 0), ('bbbbbbbb-0000-0000-0000-000000000082', 'B', 60);
insert into rank_leagues (id, week, tier, size, off) values
  ('11111111-0000-0000-0000-000000000001', rank_prev_week(rank_week(current_date)), 0, 3, 0);
insert into rank_weeks (user_id, week, league, score, ends_at) values
  ('aaaaaaaa-0000-0000-0000-000000000081', rank_prev_week(rank_week(current_date)), '11111111-0000-0000-0000-000000000001', 200, now() - interval '1 hour'),
  ('bbbbbbbb-0000-0000-0000-000000000082', rank_prev_week(rank_week(current_date)), '11111111-0000-0000-0000-000000000001', 100, now() + interval '1 hour');
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000081');
select ok(rank_status(current_date) -> 'waiting' is not null and jsonb_typeof(rank_status(current_date) -> 'waiting') = 'object', 'A waits for B''s Maghrib');
select is((rank_status(current_date) -> 'waiting' ->> 'place')::int, 1, 'with last week''s place as it stands');
select is(rank_status(current_date) -> 'last', 'null'::jsonb, 'no result yet');
select is((rank_league(current_date) ->> 'waiting')::boolean, true, 'the league shown is last week''s, waiting');
select is(jsonb_array_length(rank_league(current_date) -> 'players'), 2, 'with both of them');
select rank_report(current_date, 3, 0, 0, 0, 'A', 0, 0, 0, null, 0);
reset role;
select is((select count(*)::int from rank_weeks where user_id = 'aaaaaaaa-0000-0000-0000-000000000081' and week = rank_week(current_date)), 0,
          'no new league while waiting, but the day is kept');
-- B's Maghrib passes.
update rank_weeks set ends_at = now() - interval '1 minute' where user_id = 'bbbbbbbb-0000-0000-0000-000000000082';
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000081');
select is((rank_status(current_date) -> 'last' ->> 'place')::int, 1, 'then the result: first');
select is((rank_status(current_date) ->> 'week')::int, 50, 'the new week holds what was read while waiting');
reset role;
select is((select place from rank_prizes where user_id = 'aaaaaaaa-0000-0000-0000-000000000081'), 1::smallint, 'and the prize is given');

-- 4. Hall of fame.
select pg_temp.act_as('cccccccc-0000-0000-0000-000000000083');
select is(rank_hall() -> 'recent' -> 0 ->> 'name', 'A', 'the winner is on the hall of fame');

select * from finish();
rollback;
