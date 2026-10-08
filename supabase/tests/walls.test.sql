-- T8 Dua & ayah wall (supabase/migrations/20261011000000_t8_walls.sql): hosts open walls; guests add
-- one checked entry each through add_wall_entry(); the host reads every entry and can hide them; a
-- guest reads only their own; nobody else sees anything; nobody writes the tables directly.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(42);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aisha@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bilal@example.com'),
  ('cccccccc-0000-0000-0000-000000000003', 'carim@example.com');
insert into auth.users (id, is_anonymous) values ('dddddddd-0000-0000-0000-000000000004', true);

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
create temp table ids (k text primary key, v text);
grant all on ids to authenticated, anon;

-- Aisha (host) opens a wall
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
insert into ids select 'w', w ->> 'id' from (select create_wall('  Yusuf &   Maryam''s wedding ', 'wedding', '{"textMode":"line","scenes":["night"]}', 7) w) x;
insert into ids select 'code', join_code from walls where id = (select v::uuid from ids where k = 'w');
select ok((select v ~ '^[A-HJ-NP-Z2-9]{6}$' from ids where k = 'code'), 'a 6-character join code');
select is((select title from walls where id = (select v::uuid from ids where k = 'w')), 'Yusuf & Maryam''s wedding', 'the title is tidied');
select throws_ok($$ select create_wall('x', 'party', '{}', 7) $$, '22023', null, 'an unknown occasion is refused');
select throws_ok($$ select create_wall('x', 'eid', '{"textEffect":"shake"}', 7) $$, '22023', null, 'a forged look is refused');
select throws_ok($$ select create_wall('x', 'eid', '{}', 168) $$, '22023', null, 'a reciter the app does not offer is refused');
select throws_ok($$ select create_wall('   ', 'eid', '{}', 7) $$, '22023', null, 'a title is needed');
select throws_ok($$ insert into walls (host_id, title, occasion, join_code, look, reciter)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'x', 'eid', 'ABCDEF', '{}', 7) $$, '42501', null, 'nobody inserts walls directly');
select is((wall_preview((select v from ids where k = 'code')) ->> 'host')::boolean, true, 'the host sees the wall as hers');

-- A signed-out visitor sees only the preview
select pg_temp.act_as_visitor();
select is((wall_preview(lower((select v from ids where k = 'code'))) ->> 'title'), 'Yusuf & Maryam''s wedding', 'a visitor sees the title (any case)');
select is((wall_preview((select v from ids where k = 'code')) ->> 'open')::boolean, true, 'and that it is open');
select is(wall_preview('ZZZZZZ'), null, 'an unknown code shows nothing');
select throws_ok($$ select * from walls $$, '42501', null, 'a visitor cannot list walls');
select throws_ok($$ select add_wall_entry((select v from ids where k = 'code'), 'Guest', null, 1, 1, 1) $$, '42501', null, 'a visitor cannot add');

-- Bilal (Google) adds his entry
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000002');
insert into ids select 'eb', add_wall_entry((select v from ids where k = 'code'), ' Bilal ', ' May Allah bless
your home ', 30, 21, 21)::text;
select is((select dua from wall_entries where id = (select v::uuid from ids where k = 'eb')), 'May Allah bless your home', 'the dua is tidied to one line');
select is((wall_preview((select v from ids where k = 'code')) -> 'entry' ->> 'name'), 'Bilal', 'he sees his entry in the preview');
select is((select count(*)::int from walls), 0, 'a guest cannot read the wall row');
select throws_ok($$ select add_wall_entry((select v from ids where k = 'code'), 'Bilal', null, 2, 1, 4) $$, '22023', null, 'more than 3 ayat are refused');
select throws_ok($$ select add_wall_entry((select v from ids where k = 'code'), 'Bilal', null, 1, 7, 8) $$, '22023', null, 'an ayah past the end of the surah is refused');
select throws_ok($$ select add_wall_entry((select v from ids where k = 'code'), 'Bilal', null, 0, 1, 1) $$, '22023', null, 'surah 0 is refused');
select throws_ok($$ select add_wall_entry((select v from ids where k = 'code'), '  ', null, 1, 1, 1) $$, '22023', null, 'a name is needed');
select throws_ok($$ select add_wall_entry((select v from ids where k = 'code'), 'Bilal', repeat('x', 141), 1, 1, 1) $$, '22023', null, 'a dua over 140 characters is refused');
select throws_ok($$ select add_wall_entry('ZZZZZZ', 'Bilal', null, 1, 1, 1) $$, 'P0002', null, 'an unknown code is refused');
-- Adding again changes the one entry
select is(add_wall_entry((select v from ids where k = 'code'), 'Bilal', null, 112, 1, 4 - 1)::text, (select v from ids where k = 'eb'), 'adding again changes his entry');
select is((select count(*)::int from wall_entries), 1, 'still one entry, the only one he can read');
select is((select dua from wall_entries), null, 'the dua is optional');
select throws_ok($$ update wall_entries set hidden = false $$, '42501', null, 'nobody updates entries directly');
select throws_ok($$ select hide_wall_entry((select v::uuid from ids where k = 'eb'), true) $$, '42501', null, 'a guest cannot hide entries');
select throws_ok($$ select set_wall_open((select v::uuid from ids where k = 'w'), false) $$, '42501', null, 'a guest cannot close the wall');

-- An anonymous guest (once anonymous sign-ins are on) adds too
select pg_temp.act_as('dddddddd-0000-0000-0000-000000000004', true);
insert into ids select 'ed', add_wall_entry((select v from ids where k = 'code'), 'Grandma', 'Ameen', 1, 1, 7 - 4)::text;
select is((select count(*)::int from wall_entries), 1, 'an anonymous guest reads only their own entry');
select throws_ok($$ select create_wall('Mine', 'eid', '{}', 7) $$, '42501', null, 'an anonymous session cannot host');

-- Carim (another account) sees nothing of it
select pg_temp.act_as('cccccccc-0000-0000-0000-000000000003');
select is((select count(*)::int from wall_entries), 0, 'someone else reads no entries');
select throws_ok($$ select remove_wall_entry((select v::uuid from ids where k = 'eb')) $$, '42501', null, 'nobody else removes an entry');
select throws_ok($$ select delete_wall((select v::uuid from ids where k = 'w')) $$, '42501', null, 'nobody else deletes the wall');

-- The host reads every entry, hides one, closes the wall
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select is((select count(*)::int from wall_entries where wall_id = (select v::uuid from ids where k = 'w')), 2, 'the host reads every entry');
select lives_ok($$ select hide_wall_entry((select v::uuid from ids where k = 'ed'), true) $$, 'the host hides an entry');
select is((select count(*)::int from wall_entries where not hidden), 1, 'one visible entry left');
select lives_ok($$ select update_wall((select v::uuid from ids where k = 'w'), 'Walimah', 'wedding', '{"scenes":["dunes"]}', 3) $$, 'the host changes the look and reciter');
select lives_ok($$ select set_wall_open((select v::uuid from ids where k = 'w'), false) $$, 'the host closes the wall');

select pg_temp.act_as('cccccccc-0000-0000-0000-000000000003');
select throws_ok($$ select add_wall_entry((select v from ids where k = 'code'), 'Carim', null, 1, 1, 1) $$, '42501', null, 'a closed wall takes no entries');

-- Bilal removes his entry; deleting the wall removes the rest
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000002');
select lives_ok($$ select remove_wall_entry((select v::uuid from ids where k = 'eb')) $$, 'a guest removes their own entry');
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select lives_ok($$ select delete_wall((select v::uuid from ids where k = 'w')) $$, 'the host deletes the wall');
reset role;
select is((select count(*)::int from wall_entries), 0, 'its entries are gone with it');

select * from finish();
rollback;
