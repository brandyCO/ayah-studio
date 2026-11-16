-- Friends' milestones + MashaAllah (supabase/migrations/20261114200000_friend_feats.sql).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
create or replace function public.rank_xp_mult(d date) returns numeric language sql stable as 'select 1::numeric';

select plan(15);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000081', 'amal@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000082', 'bilal@example.com'),
  ('cccccccc-0000-0000-0000-000000000083', 'dina@example.com');

create function pg_temp.act_as(uid text) returns void language sql as $$
  reset role;
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  set local role authenticated;
$$;
create temp table ids (k text primary key, v text);
grant all on ids to authenticated;

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000081');
select rank_report(current_date, 1, 0, 0, 0, 'Amal');
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000082');
select rank_report(current_date, 1, 0, 0, 0, 'Bilal');
select pg_temp.act_as('cccccccc-0000-0000-0000-000000000083');
select rank_report(current_date, 1, 0, 0, 0, 'Dina');
reset role;
insert into rank_friends (a, b) values ('aaaaaaaa-0000-0000-0000-000000000081', 'bbbbbbbb-0000-0000-0000-000000000082');

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000081');
select throws_ok($$ select rank_feat('badge', 1) $$, '22023', null, 'only known milestones');
select throws_ok($$ select rank_feat('surah', 200) $$, '22023', null, 'a surah number within the Quran');
select is(rank_feat('streak', 30), true, 'a 30-day streak is shared');
select is(rank_feat('streak', 30), false, 'the same one twice a day is kept once');
reset role;
insert into ids select 'f', id::text from rank_feats where user_id = 'aaaaaaaa-0000-0000-0000-000000000081';

select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000082');
select is(jsonb_array_length(rank_feats_feed() -> 'friends'), 1, 'a friend sees it');
select is(rank_feats_feed() -> 'friends' -> 0 ->> 'name', 'Amal', 'with the friend''s name');
select is(rank_feat_cheer((select v from ids where k = 'f')::bigint), 1, 'MashaAllah counts');
select is(rank_feat_cheer((select v from ids where k = 'f')::bigint), 1, 'once each');
select is(rank_feats_feed() -> 'friends' -> 0 ->> 'cheered', 'true', 'the friend sees they said it');

select pg_temp.act_as('cccccccc-0000-0000-0000-000000000083');
select is(jsonb_array_length(rank_feats_feed() -> 'friends'), 0, 'not a friend: nothing shown');
select throws_ok($$ select rank_feat_cheer((select v from ids where k = 'f')::bigint) $$, '22023', null, 'and no MashaAllah');

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000081');
select throws_ok($$ select rank_live('play') $$, '22023', null, 'only reading or listening');
select lives_ok($$ select rank_live('read') $$, 'reading now is noted');
select is(rank_feats_feed() -> 'mine' -> 0 -> 'by' ->> 0, 'Bilal', 'the owner sees who said MashaAllah');
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000082');
select is(rank_my_friends(current_date) -> 'friends' -> 0 ->> 'live', 'read', 'a friend sees the live dot');
reset role;

select * from finish();
rollback;
