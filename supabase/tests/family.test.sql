-- K6 Family encouragement (supabase/migrations/20261013000000_k6_family.sql): family circles hold
-- children by first name, their short surahs and du'a notes. Members read; nobody writes the tables
-- directly; only a child's parent (who added them) or the owner manages the child; any member may leave
-- a note (3 a day); strangers and anonymous sessions see and change nothing.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(36);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aisha@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'grandma@example.com'),
  ('cccccccc-0000-0000-0000-000000000003', 'stranger@example.com');
insert into auth.users (id, is_anonymous) values ('dddddddd-0000-0000-0000-000000000004', true);

create function pg_temp.act_as(uid text, anonymous boolean default false) returns void language sql as $$
  reset role;
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'is_anonymous', anonymous)::text, true);
  set local role authenticated;
$$;
create temp table ids (k text primary key, v text);
grant all on ids to authenticated, anon;

-- Aisha (a parent) creates a family circle and adds her daughter
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
insert into ids select 'c', create_family_circle('Our family', 'Mum');
select is((select kind from circles), 'family', 'a family circle');
select is((select count(*)::int from circle_parts), 0, 'it has no juz parts');
insert into ids select 'code', invite_code from circles;
insert into ids select 'maryam', add_child((select v::uuid from ids where k = 'c'), '  Maryam  ');
select is((select name from circle_children), 'Maryam', 'the child is added by first name, tidied');
select throws_ok($$ select add_child((select v::uuid from ids where k = 'c'), '   ') $$, '22023', null, 'a blank name is refused');
insert into ids select 'long', add_child((select v::uuid from ids where k = 'c'), repeat('x', 30));
select is((select char_length(name) from circle_children where id = (select v::uuid from ids where k = 'long')), 24,
  'a long name is kept to 24 characters');
select lives_ok($$ select set_child_surah((select v::uuid from ids where k = 'maryam'), 112, 'learning') $$, 'she is learning Al-Ikhlas');
select lives_ok($$ select set_child_surah((select v::uuid from ids where k = 'maryam'), 1, 'learned') $$, 'she learned Al-Fatiha');
select is((select status from family_parts where surah = 112), 'learning', 'the surah is marked as learning');
select lives_ok($$ select set_child_surah((select v::uuid from ids where k = 'maryam'), 112, 'learned') $$, 'then learned');
select is((select count(*)::int from family_parts where status = 'learned'), 2, 'two lanterns lit');
select throws_ok($$ select set_child_surah((select v::uuid from ids where k = 'maryam'), 2, 'learned') $$, '22023', null,
  'only the short surahs of the Kids space');
select throws_ok($$ select set_child_surah((select v::uuid from ids where k = 'maryam'), 113, 'mastered') $$, '22023', null,
  'an unknown state is refused');
select throws_ok($$ insert into family_parts (child_id, circle_id, surah, status)
  values ((select v::uuid from ids where k = 'maryam'), (select v::uuid from ids where k = 'c'), 114, 'learned') $$,
  '42501', null, 'members cannot write parts directly');
update circle_children set name = 'X' where true;
select is((select name from circle_children where id = (select v::uuid from ids where k = 'maryam')), 'Maryam', 'members cannot rename children directly');
select throws_ok($$ select take_part((select v::uuid from ids where k = 'c'), 1) $$, 'P0001', null, 'a family circle has no juz to take');

-- Grandma joins, sees the child and leaves notes
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000002');
select is((select count(*)::int from circle_children), 0, 'before joining she sees no children');
select lives_ok($$ select join_circle((select v from ids where k = 'code'), 'Grandma') $$, 'she joins with the code');
select is((select count(*)::int from circle_children), 2, 'now she sees the children');
select is((select count(*)::int from family_parts), 2, 'and her lanterns');
insert into ids select 'n1', leave_note((select v::uuid from ids where k = 'maryam'), 112, 'May Allah make the Quran the light of your heart');
select is((select from_name from family_notes), 'Grandma', 'the note carries her name in the circle');
select throws_ok($$ select leave_note((select v::uuid from ids where k = 'maryam'), null, repeat('x', 141)) $$, '22023', null,
  'notes are at most 140 characters');
select throws_ok($$ select leave_note((select v::uuid from ids where k = 'maryam'), 50, 'hi') $$, '22023', null,
  'a note names only a short surah');
select lives_ok($$ select leave_note((select v::uuid from ids where k = 'maryam'), null, 'Proud of you') $$, 'a second note');
select lives_ok($$ select leave_note((select v::uuid from ids where k = 'maryam'), null, 'Love, Grandma') $$, 'a third note');
select throws_ok($$ select leave_note((select v::uuid from ids where k = 'maryam'), null, 'One more') $$, 'P0001', null,
  'up to 3 notes a day');
select throws_ok($$ select set_child_surah((select v::uuid from ids where k = 'maryam'), 113, 'learned') $$, '42501', null,
  'only the parent manages the child');
select throws_ok($$ select remove_child((select v::uuid from ids where k = 'maryam')) $$, '42501', null, 'she cannot remove the child');
select throws_ok($$ select mark_note_seen((select v::uuid from ids where k = 'n1')) $$, '42501', null, 'she cannot mark notes as seen');
update family_notes set body = 'changed' where true;
select is((select count(*)::int from family_notes where body = 'changed'), 0, 'notes cannot be edited directly');

-- A stranger and an anonymous session
select pg_temp.act_as('cccccccc-0000-0000-0000-000000000003');
select is((select count(*)::int from family_notes), 0, 'a stranger reads no notes');
select throws_ok($$ select leave_note((select v::uuid from ids where k = 'maryam'), null, 'hello') $$, '42501', null,
  'a stranger cannot leave a note');
select throws_ok($$ select add_child((select v::uuid from ids where k = 'c'), 'Zaid') $$, '42501', null, 'a stranger cannot add a child');
select pg_temp.act_as('dddddddd-0000-0000-0000-000000000004', true);
select throws_ok($$ select create_family_circle('x', 'y') $$, '42501', null, 'anonymous sessions cannot create family circles');

-- The parent sees the note on her device, marks it seen, and deletes the circle's child
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select lives_ok($$ select mark_note_seen((select v::uuid from ids where k = 'n1')) $$, 'the parent marks a note as seen');
select lives_ok($$ select delete_note((select v::uuid from ids where k = 'n1')) $$, 'and may delete a note for her child');
select lives_ok($$ select remove_child((select v::uuid from ids where k = 'maryam')) $$, 'removing the child');

select * from finish();
rollback;
