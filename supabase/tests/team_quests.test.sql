-- Team quests: a friend challenge towards one shared goal (supabase/migrations/20261114100000_team_quests.sql).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
create or replace function public.rank_xp_mult(d date) returns numeric language sql stable as 'select 1::numeric';

select plan(10);

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

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000071');
select rank_report(current_date, 1, 0, 0, 0, 'Amal');
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000072');
select rank_report(current_date, 1, 0, 0, 0, 'Bilal');
select pg_temp.act_as('cccccccc-0000-0000-0000-000000000073');
select rank_report(current_date, 1, 0, 0, 0, 'Dina');
reset role;
insert into ids select 'b', pid from rank_players where user_id = 'bbbbbbbb-0000-0000-0000-000000000072';
insert into ids select 'c', pid from rank_players where user_id = 'cccccccc-0000-0000-0000-000000000073';
insert into rank_friends (a, b) values ('aaaaaaaa-0000-0000-0000-000000000071', 'bbbbbbbb-0000-0000-0000-000000000072');

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000071');
select throws_ok($$ select rank_challenge_team((select v from ids where k = 'c'), 'pages', 50) $$, '22023', null, 'only with friends');
select throws_ok($$ select rank_challenge_team((select v from ids where k = 'b'), 'pages', 0) $$, '22023', null, 'a goal is needed');
select throws_ok($$ select rank_challenge_team((select v from ids where k = 'b'), 'pages', 99999) $$, '22023', null, 'a goal within reason');
insert into ids select 'ch', rank_challenge_team((select v from ids where k = 'b'), 'pages', 3)::text;
select is((rank_my_challenges(current_date) -> 0 ->> 'goal')::int, 3, 'the sender sees the shared goal');
select throws_ok($$ select rank_challenge_friend((select v from ids where k = 'b'), 'dhikr') $$, '22023', null, 'one challenge with a friend at a time');
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000072');
select is(rank_my_challenges(current_date) -> 0 ->> 'incoming', 'true', 'the friend sees it coming in');
select lives_ok($$ select rank_challenge_answer((select v from ids where k = 'ch')::uuid, true, current_date) $$, 'the friend says yes');

-- After the week: both pages together reach the goal of 3 → 100 Light each.
reset role;
update rank_challenges set start = current_date - 8 where id = (select v from ids where k = 'ch')::uuid;
insert into rank_days (user_id, day, pages) values ('aaaaaaaa-0000-0000-0000-000000000071', current_date - 7, 2), ('bbbbbbbb-0000-0000-0000-000000000072', current_date - 7, 1)
  on conflict (user_id, day) do update set pages = excluded.pages;
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000071');
select is(rank_challenge_claim((select v from ids where k = 'ch')::uuid) ->> 'result', 'reached', 'reached together');
select is(rank_challenge_claim((select v from ids where k = 'ch')::uuid), null, 'the chest opens once');
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000072');
select is((rank_challenge_claim((select v from ids where k = 'ch')::uuid) ->> 'light')::int, 100, 'the friend gets 100 Light too');
reset role;

select * from finish();
rollback;
