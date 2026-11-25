-- Leftovers of removed features are gone (supabase/migrations/20261124100000_drop_leftovers.sql);
-- family circles still join, pass on and close as before.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(12);

select hasnt_table('public', 'walls', 'the wall table is gone');
select hasnt_table('public', 'wall_entries', 'the wall entries are gone');
select hasnt_table('public', 'gifts', 'the ayah gifts table is gone');
select hasnt_table('public', 'circle_parts', 'the khatm juz parts are gone');
select hasnt_function('public', 'send_gift', 'send_gift is gone');
select hasnt_function('public', 'take_part', 'take_part is gone');
select hasnt_function('public', 'valid_gift_look', 'valid_gift_look is gone');
select has_table('public', 'rank_gifts', 'Light gifts between friends stay');

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aisha@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'grandma@example.com');
create function pg_temp.act_as(uid text) returns void language sql as $$
  reset role;
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;
create temp table ids (k text primary key, v text);
grant all on ids to authenticated;

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
insert into ids select 'c', create_family_circle('Our family', 'Mum');
insert into ids select 'code', invite_code from circles;
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000002');
select lives_ok($$ select join_circle((select v from ids where k = 'code'), 'Grandma') $$, 'a family member joins with the code');
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select lives_ok($$ select leave_circle((select v::uuid from ids where k = 'c')) $$, 'the owner leaves');
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000002');
select is((select owner_id::text from circles), 'bbbbbbbb-0000-0000-0000-000000000002', 'the circle passes to the next member');
select leave_circle((select v::uuid from ids where k = 'c'));
reset role;
select is((select count(*)::int from circles), 0, 'the last member out closes it');

select * from finish();
rollback;
