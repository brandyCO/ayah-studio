-- Row-level security for T0 (supabase/migrations/20261008180000_t0_user_docs.sql), run by
-- `supabase test db` against a local database (CI: .github/workflows/supabase.yml).
-- Each person reads and writes only their own rows; anonymous sessions and signed-out visitors
-- cannot sync; deleting the account removes everything.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(26);

-- Two Google users (as Supabase Auth would create them) and helpers to act as someone.
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com', '{"full_name":"Aisha","avatar_url":"https://x/a.png"}'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com', '{"name":"Bilal"}');

create function pg_temp.act_as(uid text, anonymous boolean default false) returns void language sql as $$
  reset role;
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'is_anonymous', anonymous)::text, true);
  set local role authenticated;
$$;
create function pg_temp.act_as_visitor() returns void language sql as $$
  reset role;
  reset role;
  select set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
$$;

-- Structure
select ok((select relrowsecurity from pg_class where oid = 'public.user_docs'::regclass), 'RLS on user_docs');
select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'RLS on profiles');
select is((select name from profiles where id = '11111111-1111-1111-1111-111111111111'), 'Aisha', 'profile made from the Google name');
select is((select name from profiles where id = '22222222-2222-2222-2222-222222222222'), 'Bilal', 'profile falls back to "name"');

-- Aisha writes her own documents (all kinds the app syncs, reflections included)
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select lives_ok($$ insert into user_docs (user_id, kind, id, data, device_id) values
  ('11111111-1111-1111-1111-111111111111', 'state', 'bookmarks', '{"items":[]}', 'dev-a'),
  ('11111111-1111-1111-1111-111111111111', 'reflection', 'r1', '{"s":2,"a":255,"entries":[]}', 'dev-a') $$,
  'a user writes her own rows');
select lives_ok($$ insert into user_docs (user_id, kind, id, data, updated_at) values
  ('11111111-1111-1111-1111-111111111111', 'setting', 'prefs', '{}', '2000-01-01') $$, 'a client-sent time is accepted…');
select ok((select updated_at > '2020-01-01' from user_docs where kind = 'setting'), '…but the server sets updated_at');
select throws_ok($$ insert into user_docs (user_id, kind, id) values ('22222222-2222-2222-2222-222222222222', 'state', 'x') $$,
  '42501', null, 'cannot write as another user');
select throws_ok($$ insert into user_docs (user_id, kind, id) values ('11111111-1111-1111-1111-111111111111', 'secret', 'x') $$,
  '23514', null, 'unknown kinds are rejected');
select throws_ok($$ insert into user_docs (user_id, kind, id) values ('11111111-1111-1111-1111-111111111111', 'state', '') $$,
  '23514', null, 'empty ids are rejected');
select is((select count(*)::int from user_docs), 3, 'she sees her three rows');
select lives_ok($$ update profiles set name = 'Aisha K' where id = '11111111-1111-1111-1111-111111111111' $$, 'she renames her profile');

-- Bilal sees and changes nothing of hers
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select is((select count(*)::int from user_docs), 0, 'another user sees none of her rows');
select is((select count(*)::int from profiles), 1, 'another user sees only his own profile');
update user_docs set data = '{"hacked":true}' where user_id = '11111111-1111-1111-1111-111111111111';
delete from user_docs where user_id = '11111111-1111-1111-1111-111111111111';
update profiles set name = 'x' where id = '11111111-1111-1111-1111-111111111111';
select lives_ok($$ insert into user_docs (user_id, kind, id) values ('22222222-2222-2222-2222-222222222222', 'state', 'bookmarks') $$,
  'the same document id is free for another user');
select throws_ok($$ update user_docs set user_id = '11111111-1111-1111-1111-111111111111' $$, '42501', null,
  'cannot move his row to her account');

-- An anonymous session (gift replies / wall guests later) cannot sync
select pg_temp.act_as('33333333-3333-3333-3333-333333333333', true);
select throws_ok($$ insert into user_docs (user_id, kind, id) values ('33333333-3333-3333-3333-333333333333', 'state', 'x') $$,
  '42501', null, 'anonymous sessions cannot write');

-- A signed-out visitor sees and writes nothing
select pg_temp.act_as_visitor();
select is((select count(*)::int from user_docs), 0, 'visitors see no rows');
select is((select count(*)::int from profiles), 0, 'visitors see no profiles');
select throws_ok($$ insert into user_docs (user_id, kind, id) values ('11111111-1111-1111-1111-111111111111', 'state', 'y') $$,
  '42501', null, 'visitors cannot write');
select throws_ok($$ select delete_my_account() $$, '42501', null, 'visitors cannot call delete_my_account');

-- Back as the database owner: her rows were untouched by Bilal
reset role;
select is((select data from user_docs where user_id = '11111111-1111-1111-1111-111111111111' and kind = 'state'),
  '{"items":[]}'::jsonb, 'her bookmarks are unchanged');
select is((select count(*)::int from user_docs where user_id = '11111111-1111-1111-1111-111111111111'), 3, 'her rows still exist');
select is((select name from profiles where id = '11111111-1111-1111-1111-111111111111'), 'Aisha K', 'her profile kept her own rename');

-- At most 3000 items per account
insert into user_docs (user_id, kind, id)
  select '22222222-2222-2222-2222-222222222222', 'day', 'd' || g from generate_series(1, 2999) g;
select throws_ok($$ insert into user_docs (user_id, kind, id) values ('22222222-2222-2222-2222-222222222222', 'day', 'one-more') $$,
  'P0001', 'Too many synced items for this account', 'the 3001st item is refused');

-- Deleting the account removes the user, the profile and every row
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select delete_my_account();
reset role;
select is((select count(*)::int from user_docs where user_id = '11111111-1111-1111-1111-111111111111')
  + (select count(*)::int from profiles where id = '11111111-1111-1111-1111-111111111111')
  + (select count(*)::int from auth.users where id = '11111111-1111-1111-1111-111111111111'), 0,
  'delete_my_account removes everything of hers');

select * from finish();
rollback;
