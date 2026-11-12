-- Flawless lessons (supabase/migrations/20261112200000_rank_flawless.sql): 10 extra XP each, never more
-- than the day's lessons, never down, added to the week and the total.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(6);

insert into auth.users (id, email) values ('aaaaaaaa-0000-0000-0000-000000000021', 'amina@example.com');

create function pg_temp.act_as(uid text) returns void language sql as $$
  reset role;
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  set local role authenticated;
$$;

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000021');
select is(rank_flawless(current_date, 1), 0, 'nothing before the day is reported');
select is(rank_report(current_date, 0, 0, 0, 0, 'Amina', 2), 2 * 15 + 20, 'two lessons');
select is(rank_flawless(current_date, 5), 2, 'never more than the day''s lessons');
select is(rank_flawless(current_date, 1), 2, 'never goes down');

reset role;
select is((select total from rank_players where user_id = 'aaaaaaaa-0000-0000-0000-000000000021'), 2 * 15 + 20 + 20, 'the total has the extra XP');
select is((select score from rank_weeks where user_id = 'aaaaaaaa-0000-0000-0000-000000000021' and week = rank_week(current_date)), 2 * 15 + 20 + 20, 'so has the week');

select * from finish();
rollback;
