-- Help improve the harakat check (supabase/migrations/20261111000000_harakat_clips.sql): Google accounts add
-- their own short clips through a function, nobody reads the table, only teachers see and label clips
-- (never who shared them), a learner can delete all of theirs, 40 a day.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(29);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aisha@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'teacher@example.com'),
  ('cccccccc-0000-0000-0000-000000000003', 'omar@example.com');
insert into auth.users (id, is_anonymous) values ('dddddddd-0000-0000-0000-000000000004', true);
insert into harakat_reviewers (user_id) values ('bbbbbbbb-0000-0000-0000-000000000002');

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
-- 0.25 s of silence as base64 (8000 bytes)
create temp table pcm as select encode(decode(repeat('00', 8000), 'hex'), 'base64') b;
grant select on pcm to authenticated, anon;

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select lives_ok($$ select harakat_clip_add(1, 2, array['ٱلۡحَمۡدُ', 'لِلَّهِ'], 0, -7.5, true, 'right', (select b from pcm)) $$, 'a learner shares a clip');
select lives_ok($$ select harakat_clip_add(1, 2, array['رَبِّ'], 0, 4.2, false, 'none', (select b from pcm)) $$, 'and one that was not flagged');
select throws_ok($$ select * from harakat_clips $$, '42501', null, 'the clips cannot be read directly');
select throws_ok($$ insert into harakat_clips (user_id, surah, ayah, words, target, flagged, learner, audio)
  values (auth.uid(), 1, 1, array['x'], 0, true, 'none', '\x00') $$, '42501', null, 'nor written directly');
select is(jsonb_array_length(harakat_my_clips()), 2, 'the learner sees their own clips');
select throws_ok($$ select harakat_review_queue() $$, '42501', null, 'a learner cannot open the review queue');
select throws_ok($$ select harakat_clip_add(1, 2, array['x'], 1, 0, true, 'none', (select b from pcm)) $$, '22023', null, 'the target is one of the words');
select throws_ok($$ select harakat_clip_add(1, 2, array['x'], 0, 0, true, 'none', 'AAAA') $$, '23514', null, 'too short a clip is refused');
select throws_ok($$ select harakat_clip_add(115, 2, array['x'], 0, 0, true, 'none', (select b from pcm)) $$, '23514', null, 'surah must exist');

-- New clips are files in the private bucket harakat-clips (20261113100000_harakat_clips_storage.sql)
select lives_ok($$ insert into storage.objects (bucket_id, name, metadata)
  values ('harakat-clips', 'aaaaaaaa-0000-0000-0000-000000000001/clipabcd1234.pcm', '{"size": 8000}') $$, 'a learner uploads a clip file into their own folder');
select throws_ok($$ insert into storage.objects (bucket_id, name, metadata)
  values ('harakat-clips', 'cccccccc-0000-0000-0000-000000000003/clipabcd1234.pcm', '{"size": 8000}') $$, '42501', null, 'but not into someone else''s');
select lives_ok($$ select harakat_clip_add_file(1, 3, array['ٱلرَّحۡمَٰنِ'], 0, -8.1, true, 'wrong',
  'aaaaaaaa-0000-0000-0000-000000000001/clipabcd1234.pcm') $$, 'and shares it by its path');
select throws_ok($$ select harakat_clip_add_file(1, 3, array['x'], 0, 0, true, 'none',
  'aaaaaaaa-0000-0000-0000-000000000001/missing12345.pcm') $$, '22023', null, 'a file that was not uploaded is refused');
select throws_ok($$ select harakat_clip_add_file(1, 3, array['x'], 0, 0, true, 'none',
  'cccccccc-0000-0000-0000-000000000003/clipabcd1234.pcm') $$, '22023', null, 'so is another learner''s path');
select is(jsonb_array_length(harakat_my_clips()), 3, 'the file clip is among the learner''s clips');
select is((select count(*)::int from storage.objects where bucket_id = 'harakat-clips'), 1, 'the learner sees their own file');

select pg_temp.act_as('cccccccc-0000-0000-0000-000000000003');
select is((select count(*)::int from storage.objects where bucket_id = 'harakat-clips'), 0, 'another learner sees no file');
select throws_ok($$ select harakat_clip_add_file(1, 3, array['x'], 0, 0, true, 'none',
  'aaaaaaaa-0000-0000-0000-000000000001/clipabcd1234.pcm') $$, '22023', null, 'nor can share it as theirs');

select pg_temp.act_as('dddddddd-0000-0000-0000-000000000004', true);
select throws_ok($$ select harakat_clip_add(1, 2, array['x'], 0, 0, true, 'none', (select b from pcm)) $$, '42501', null, 'guests cannot share');
select pg_temp.act_as_visitor();
select throws_ok($$ select harakat_clip_add(1, 2, array['x'], 0, 0, true, 'none', (select b from pcm)) $$, '42501', null, 'visitors cannot share');

select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000002');
select is(jsonb_array_length(harakat_review_queue()), 3, 'a teacher sees the waiting clips');
select ok(not (harakat_review_queue() -> 0 ? 'user_id'), 'without who shared them');
select is((select count(*)::int from jsonb_array_elements(harakat_review_queue()) c where c ->> 'audio' is not null), 2, 'old clips still come with their sound');
select is((select c ->> 'path' from jsonb_array_elements(harakat_review_queue()) c where c ->> 'path' is not null),
  'aaaaaaaa-0000-0000-0000-000000000001/clipabcd1234.pcm', 'a file clip comes with its path');
select is((select count(*)::int from storage.objects where bucket_id = 'harakat-clips'), 1, 'and the teacher can download the file');
select throws_ok($$ insert into storage.objects (bucket_id, name, metadata)
  values ('harakat-clips', 'aaaaaaaa-0000-0000-0000-000000000001/teacher12345.pcm', '{"size": 8000}') $$, '42501', null, 'but cannot put a file in a learner''s folder');
select lives_ok($$ select harakat_label((harakat_review_queue() -> 0 ->> 'id')::bigint, 'wrong', 'damma said as fatha') $$, 'a teacher labels one');
select is((harakat_review_counts() ->> 'open')::int, 2, 'two left to label');

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select is(harakat_forget_mine(), 3, 'the learner deletes all their clips');

select * from finish();
rollback;
