-- News page: milestones of readers near you and of people you follow (supabase/migrations/20261123000000_rank_news.sql).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
create or replace function public.rank_xp_mult(d date) returns numeric language sql stable as 'select 1::numeric';

select plan(12);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000081', 'amal@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000082', 'bilal@example.com'),
  ('cccccccc-0000-0000-0000-000000000083', 'dina@example.com'),
  ('dddddddd-0000-0000-0000-000000000084', 'omar@example.com'),
  ('eeeeeeee-0000-0000-0000-000000000085', 'sara@example.com');

create function pg_temp.act_as(uid text) returns void language sql as $$
  reset role;
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  set local role authenticated;
$$;
create temp table ids (k text primary key, v text);
grant all on ids to authenticated;

-- Amal (LB), Bilal (LB), Dina (LB, private), Omar (FR), Sara (FR, followed by Amal).
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000081');
select rank_report(current_date, 2, 0, 0, 0, 'Amal');
select rank_set_flag('LB');
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000082');
select rank_report(current_date, 1, 0, 0, 0, 'Bilal');
select rank_set_flag('LB');
select rank_feat('streak', 7);
select rank_feat('level', 3);
select rank_feat('surah', 67);
select pg_temp.act_as('cccccccc-0000-0000-0000-000000000083');
select rank_report(current_date, 1, 0, 0, 0, 'Dina');
select rank_set_flag('LB');
select rank_feat('streak', 7);
select pg_temp.act_as('dddddddd-0000-0000-0000-000000000084');
select rank_report(current_date, 1, 0, 0, 0, 'Omar');
select rank_set_flag('FR');
select rank_feat('streak', 30);
select pg_temp.act_as('eeeeeeee-0000-0000-0000-000000000085');
select rank_report(current_date, 1, 0, 0, 0, 'Sara');
select rank_set_flag('FR');
select rank_feat('juz', 30);
reset role;
update rank_players set private = true where user_id = 'cccccccc-0000-0000-0000-000000000083';
insert into rank_feats (user_id, kind, n) select 'cccccccc-0000-0000-0000-000000000083', 'level', 9;
insert into ids select 'e', pid from rank_players where user_id = 'eeeeeeee-0000-0000-0000-000000000085';
insert into ids select 'b', pid from rank_players where user_id = 'bbbbbbbb-0000-0000-0000-000000000082';

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000081');
select rank_follow((select v from ids where k = 'e'));
create temp table feed as select rank_feats_near() as f;
select is((select count(*)::int from feed, jsonb_array_elements(f) x where x ->> 'name' = 'Bilal'), 2, 'a reader near you shows, at most 2 milestones');
select is((select count(*)::int from feed, jsonb_array_elements(f) x where x ->> 'name' = 'Sara'), 1, 'someone you follow shows from anywhere');
select is((select x ->> 'scope' from feed, jsonb_array_elements(f) x where x ->> 'name' = 'Sara'), 'follow', 'marked as followed');
select is((select x ->> 'scope' from feed, jsonb_array_elements(f) x where x ->> 'name' = 'Bilal' limit 1), 'near', 'marked as near');
select is((select count(*)::int from feed, jsonb_array_elements(f) x where x ->> 'name' = 'Omar'), 0, 'another country is left out');
select is((select count(*)::int from feed, jsonb_array_elements(f) x where (x ->> 'private')::boolean), 0, 'a private reader never shows');
select ok((select bool_and(x ->> 'id' is not null) from feed, jsonb_array_elements(f) x), 'every row carries its milestone id');

-- MashaAllah on a reader near you (not a friend).
select is(rank_feat_cheer((select (x ->> 'id')::bigint from feed, jsonb_array_elements(f) x where x ->> 'name' = 'Bilal' limit 1)), 1, 'MashaAllah on a public reader');
select throws_ok($$select rank_feat_cheer((select id from rank_feats where user_id = 'cccccccc-0000-0000-0000-000000000083' limit 1))$$,
  '22023', null, 'not on a private reader who is not a friend');

-- Friends stay in the friends feed, not here.
reset role;
insert into rank_friends (a, b) values ('aaaaaaaa-0000-0000-0000-000000000081', 'bbbbbbbb-0000-0000-0000-000000000082');
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000081');
select is((select count(*)::int from jsonb_array_elements(rank_feats_near()) x where x ->> 'name' = 'Bilal'), 0, 'a friend is not repeated here');

-- Blocking hides a reader.
reset role;
delete from rank_friends where a = 'aaaaaaaa-0000-0000-0000-000000000081';
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000081');
select rank_block((select v from ids where k = 'b'));
select is((select count(*)::int from jsonb_array_elements(rank_feats_near()) x where x ->> 'name' = 'Bilal'), 0, 'a blocked reader is hidden');

select pg_temp.act_as('dddddddd-0000-0000-0000-000000000084');
select is((select count(*)::int from jsonb_array_elements(rank_feats_near()) x where x ->> 'name' = 'Sara'), 1, 'Omar sees Sara, both in France');

select finish();
rollback;
