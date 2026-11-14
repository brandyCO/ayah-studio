-- Round 3 (supabase/migrations/20261114300000_round3_lighter.sql): the nightly tidy-up takes old news,
-- finished challenges, old duels and long-opened gifts and nothing fresh; usage counts stop taking new words
-- once a day has 3000; the live dot lasts 4 minutes.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(12);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000091', 'a91@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000092', 'b92@example.com');

insert into rank_feats (user_id, kind, n, day, at) values
  ('aaaaaaaa-0000-0000-0000-000000000091', 'streak', 7, current_date - 40, now() - interval '40 days'),
  ('aaaaaaaa-0000-0000-0000-000000000091', 'streak', 30, current_date, now());
insert into rank_challenges (code, a, b, start, created_at) values
  ('r3old00001', 'aaaaaaaa-0000-0000-0000-000000000091', 'bbbbbbbb-0000-0000-0000-000000000092', current_date - 100, now() - interval '101 days'),
  ('r3new00001', 'aaaaaaaa-0000-0000-0000-000000000091', 'bbbbbbbb-0000-0000-0000-000000000092', current_date - 20, now() - interval '21 days'),
  ('r3open0001', 'aaaaaaaa-0000-0000-0000-000000000091', null, null, now() - interval '40 days'),
  ('r3open0002', 'aaaaaaaa-0000-0000-0000-000000000091', null, null, now() - interval '2 days');
insert into rank_duels (week, a, b) values
  (current_date - 70, 'aaaaaaaa-0000-0000-0000-000000000091', 'bbbbbbbb-0000-0000-0000-000000000092'),
  (current_date - 7, 'aaaaaaaa-0000-0000-0000-000000000091', 'bbbbbbbb-0000-0000-0000-000000000092');
insert into rank_gifts (from_id, to_id, light, at, opened_at) values
  ('aaaaaaaa-0000-0000-0000-000000000091', 'bbbbbbbb-0000-0000-0000-000000000092', 50, now() - interval '400 days', now() - interval '399 days'),
  ('aaaaaaaa-0000-0000-0000-000000000091', 'bbbbbbbb-0000-0000-0000-000000000092', 50, now() - interval '400 days', null),
  ('aaaaaaaa-0000-0000-0000-000000000091', 'bbbbbbbb-0000-0000-0000-000000000092', 50, now() - interval '3 days', now() - interval '2 days');

select is(tidy_db() - array['cheers', 'relights', 'friend_asks', 'reports', 'days'],
  '{"feats": 1, "challenges": 2, "duels": 1, "gifts": 1}'::jsonb, 'takes the old rows only');
select is((select count(*)::int from rank_feats where user_id = 'aaaaaaaa-0000-0000-0000-000000000091'), 1, 'this week''s news stays');
select is((select array_agg(code order by code) from rank_challenges where a = 'aaaaaaaa-0000-0000-0000-000000000091'),
  array['r3new00001', 'r3open0002'], 'a recent challenge and a fresh invite stay');
select is((select count(*)::int from rank_duels where a = 'aaaaaaaa-0000-0000-0000-000000000091'), 1, 'last week''s duel stays');
select is((select count(*)::int from rank_gifts where from_id = 'aaaaaaaa-0000-0000-0000-000000000091'), 2,
  'an unopened gift stays however old');
select is(tidy_db() - array['cheers', 'relights', 'friend_asks', 'reports', 'days'],
  '{"feats": 0, "challenges": 0, "duels": 0, "gifts": 0}'::jsonb, 'running again removes nothing');

-- Usage: a day full of made-up words takes no new ones, but known words keep counting.
insert into usage_daily (day, key, shard, n) select current_date, 'ev:x' || g, 0, 1 from generate_series(1, 3000) g;
set local role anon;
select is(usage_add(current_date, array['ev:x1', 'ev:brand-new']), 1, 'a full day counts only words it knows');
reset role;
select is((select sum(n)::int from usage_daily where day = current_date and key = 'ev:x1'), 2, 'a known word still counts');
select ok(not exists (select 1 from usage_daily where key = 'ev:brand-new'), 'a new word is left out');
set local role anon;
select is(usage_add(current_date - 1, array['ev:brand-new']), 1, 'another day still takes new words');
reset role;

-- Live dot: 4 minutes.
insert into rank_players (user_id, name) values ('aaaaaaaa-0000-0000-0000-000000000091', 'Amina') on conflict do nothing;
insert into rank_players (user_id, name) values ('bbbbbbbb-0000-0000-0000-000000000092', 'Bashir') on conflict do nothing;
insert into rank_friends (a, b) values ('aaaaaaaa-0000-0000-0000-000000000091', 'bbbbbbbb-0000-0000-0000-000000000092');
update rank_players set live_at = now() - interval '210 seconds', live_kind = 'listen' where user_id = 'bbbbbbbb-0000-0000-0000-000000000092';
select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000091', 'role', 'authenticated', 'is_anonymous', false)::text, true);
set local role authenticated;
select is(rank_my_friends(current_date) -> 'friends' -> 0 ->> 'live', 'listen', 'a friend heard 3½ minutes ago still shows');
reset role;
update rank_players set live_at = now() - interval '5 minutes' where user_id = 'bbbbbbbb-0000-0000-0000-000000000092';
set local role authenticated;
select is(rank_my_friends(current_date) -> 'friends' -> 0 ->> 'live', null, 'after 4 minutes the dot goes');
reset role;

select * from finish();
rollback;
