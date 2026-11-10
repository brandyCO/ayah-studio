-- Learn lessons in Ranks (supabase/migrations/20261110800000_rank_lessons.sql): capped at 20 a day,
-- 15 points each; older apps (no lessons) still report; a fifth quest "Pass 5 Learn lessons".
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(7);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000011', 'amina@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000012', 'bashir@example.com');

create function pg_temp.act_as(uid text) returns void language sql as $$
  reset role;
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  set local role authenticated;
$$;

select is(rank_score(1, 0, 0, 0, 2), 10 + 2 * 15 + 20, 'a lesson is worth 15 points');
select is(rank_score(0, 0, 0, 0, 1), 15 + 20, 'a day with only a lesson is an active day');

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000011');
select is(rank_report(current_date, 0, 0, 0, 0, 'Amina', 50), 20 * 15 + 20, 'lessons are capped at 20 a day');
select is(rank_report(current_date, 0, 0, 0, 0, 'Amina', 1), 20 * 15 + 20, 'and never go down');

select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000012');
select is(rank_report(current_date, 1, 0, 0, 0, 'Bashir'), 10 + 20, 'an app that sends no lessons still reports');

reset role;
select is(rank_quest('bbbbbbbb-0000-0000-0000-000000000012', date '2026-11-09') ->> 'kind', 'pages', 'this week''s quest is unchanged');
insert into rank_days (user_id, day, lessons, score) values ('bbbbbbbb-0000-0000-0000-000000000012', date '2026-12-08', 3, 65);
select is(rank_quest('bbbbbbbb-0000-0000-0000-000000000012', date '2026-12-07'),
  '{"kind": "lessons", "target": 5, "done": 3, "bonus": 50}'::jsonb, 'the lessons quest counts the week''s lessons');

select * from finish();
rollback;
