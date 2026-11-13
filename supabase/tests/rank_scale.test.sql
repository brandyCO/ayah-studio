-- Ranks at scale (supabase/migrations/20261113300000_rank_scale.sql): the pairing job gives every active player a
-- rival in one pass, a waiter is paired with the next one to wait, the pulse changes with the league, the Hall of
-- fame is kept but faces stay the viewer's own; players can't run the job.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
create or replace function public.rank_xp_mult(d date) returns numeric language sql stable as 'select 1::numeric';

select plan(15);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000071', 'a71@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000072', 'b72@example.com'),
  ('cccccccc-0000-0000-0000-000000000073', 'c73@example.com'),
  ('dddddddd-0000-0000-0000-000000000074', 'd74@example.com'),
  ('eeeeeeee-0000-0000-0000-000000000075', 'e75@example.com');

create function pg_temp.act_as(uid text) returns void language sql as $$
  reset role;
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  set local role authenticated;
$$;

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000071');
select rank_report(current_date, 5, 0, 0, 0, 'Amina');
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000072');
select rank_report(current_date, 1, 0, 0, 0, 'Bashir');
select pg_temp.act_as('cccccccc-0000-0000-0000-000000000073');
select rank_report(current_date, 4, 0, 0, 0, 'Chadia');
select pg_temp.act_as('dddddddd-0000-0000-0000-000000000074');
select rank_report(current_date, 1, 0, 0, 0, 'Dawud');
select pg_temp.act_as('eeeeeeee-0000-0000-0000-000000000075');
select rank_report(current_date, 2, 0, 0, 0, 'Eman');
reset role;
-- Earlier days: Amina and Chadia busy, Bashir and Dawud quiet, Eman far ahead of everyone.
insert into rank_days (user_id, day, score) values
  ('aaaaaaaa-0000-0000-0000-000000000071', current_date - 3, 300),
  ('cccccccc-0000-0000-0000-000000000073', current_date - 3, 280),
  ('bbbbbbbb-0000-0000-0000-000000000072', current_date - 3, 10),
  ('dddddddd-0000-0000-0000-000000000074', current_date - 3, 12),
  ('eeeeeeee-0000-0000-0000-000000000075', current_date - 3, 500);

-- 1. Players can't run the job.
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000071');
select throws_ok($$ select rank_pair_duels() $$, '42501', null, 'players cannot run the pairing job');
select throws_ok($$ select * from rank_duel_wait $$, '42501', null, 'the waiting list cannot be read');
reset role;

-- 2. The job: one pass, every active player paired with the closest average, the odd one left.
select is(rank_pair_duels(), 2, 'five active players make two pairs');
select is((select count(*)::int from rank_duels where week = rank_week(current_date)), 2, 'two duels this week');
select ok(exists (select 1 from rank_duels where week = rank_week(current_date)
  and 'aaaaaaaa-0000-0000-0000-000000000071' in (a, b) and 'cccccccc-0000-0000-0000-000000000073' in (a, b)), 'the two busy players face each other');
select ok(exists (select 1 from rank_duels where week = rank_week(current_date)
  and 'bbbbbbbb-0000-0000-0000-000000000072' in (a, b) and 'dddddddd-0000-0000-0000-000000000074' in (a, b)), 'the two quiet players face each other');
select is(rank_pair_duels(), 0, 'running it again pairs nobody twice');
select is((select avg_day from rank_players where user_id = 'aaaaaaaa-0000-0000-0000-000000000071'), current_date, 'averages kept for the day');

-- 3. The one left waits; the next to arrive is their rival at once.
select pg_temp.act_as('eeeeeeee-0000-0000-0000-000000000075');
select is(rank_my_duel(current_date) -> 'duel', 'null'::jsonb, 'nobody free: Eman waits');
reset role;
insert into auth.users (id, email) values ('ffffffff-0000-0000-0000-000000000076', 'f76@example.com');
select pg_temp.act_as('ffffffff-0000-0000-0000-000000000076');
select rank_report(current_date, 1, 0, 0, 0, 'Faris');
select is(rank_my_duel(current_date) -> 'duel' -> 'rival' ->> 'name', 'Eman', 'a newcomer meets the one waiting');
select pg_temp.act_as('eeeeeeee-0000-0000-0000-000000000075');
select is(rank_my_duel(current_date) -> 'duel' -> 'rival' ->> 'name', 'Faris', 'and she sees him');
reset role;
select is((select count(*)::int from rank_duel_wait), 0, 'nobody left waiting');

-- 4. The pulse stays while nothing changes and changes with the league.
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000071');
select rank_league(current_date);
create temp table pulse (v text);
grant all on pulse to authenticated;
insert into pulse select rank_pulse(current_date);
select is(rank_pulse(current_date), (select v from pulse), 'nothing changed: the same pulse');
reset role;
update rank_weeks set score = score + 50 where week = rank_week(current_date) and user_id = 'aaaaaaaa-0000-0000-0000-000000000071';
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000071');
select isnt(rank_pulse(current_date), (select v from pulse), 'a score in the league changed: the pulse changes');

-- 5. Hall of fame from the kept list.
reset role;
insert into rank_prizes (user_id, week, place, tier, light) values ('aaaaaaaa-0000-0000-0000-000000000071', rank_week(current_date) - 7, 1, 0, 300);
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000071');
select is(rank_hall() -> 'recent' -> 0 ->> 'me', 'true', 'the hall marks the viewer''s own win');
reset role;

select * from finish();
rollback;
