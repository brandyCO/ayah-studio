-- Help improve the harakat check (supabase/migrations/20261111000000_harakat_clips.sql): Google accounts add
-- their own short clips through a function, nobody reads the table, only teachers see and label clips
-- (never who shared them), a learner can delete all of theirs, 40 a day.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(16);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aisha@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'teacher@example.com');
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

select pg_temp.act_as('dddddddd-0000-0000-0000-000000000004', true);
select throws_ok($$ select harakat_clip_add(1, 2, array['x'], 0, 0, true, 'none', (select b from pcm)) $$, '42501', null, 'guests cannot share');
select pg_temp.act_as_visitor();
select throws_ok($$ select harakat_clip_add(1, 2, array['x'], 0, 0, true, 'none', (select b from pcm)) $$, '42501', null, 'visitors cannot share');

select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000002');
select is(jsonb_array_length(harakat_review_queue()), 2, 'a teacher sees the waiting clips');
select ok(not (harakat_review_queue() -> 0 ? 'user_id'), 'without who shared them');
select lives_ok($$ select harakat_label((harakat_review_queue() -> 0 ->> 'id')::bigint, 'wrong', 'damma said as fatha') $$, 'a teacher labels one');
select is((harakat_review_counts() ->> 'open')::int, 1, 'one left to label');

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select is(harakat_forget_mine(), 2, 'the learner deletes all their clips');

select * from finish();
rollback;
