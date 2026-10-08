-- T3 Gift an ayah (supabase/migrations/20261010000000_t3_gifts.sql): anyone with a link opens the gift,
-- nobody lists gifts; gifts are written only through send_gift(), which rejects invalid references,
-- reciters, looks and messages; replies form a thread visible to the gift's author.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(43);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aisha@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bilal@example.com');
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

-- The look checks (same rules as applyLook() in the app)
select ok(valid_gift_look('{}'), 'an empty look is valid (defaults)');
select ok(valid_gift_look('{"textMode":"words","wordsPerStep":2,"showTranslation":true,"translationMode":"words","titlePos":"top",
  "titleSize":"m","surahName":true,"scenes":["mist","dunes"],"clips":[{"in":1.5,"fit":"loop"},null],"sceneMode":"even",
  "sceneLengths":[1,2],"sceneSnap":true,"transition":"crossfade","textEffect":"rise","colors":{"ar":"#ffffff","en":"#F1ECE2","title":"#f3e3bc"},
  "grade":"none","scrim":"normal","textSize":"m","textPos":"center","enFont":"serif","pause":0.5,"gap":"clear","intro":false,
  "outro":true,"credit":false,"watermark":true}'), 'a full look from the app is valid');
select ok(not valid_gift_look('{"textEffect":"shake"}'), 'an unknown text effect is rejected');
select ok(not valid_gift_look('{"scenes":["u:123"]}'), 'own media cannot be in a gift');
select ok(not valid_gift_look('{"scenes":[]}'), 'no scenes is rejected');
select ok(not valid_gift_look('{"colors":{"ar":"red"}}'), 'a colour must be #rrggbb');
select ok(not valid_gift_look('{"colors":{"ar":"#ffffff","x":"#000000"}}'), 'unknown colour keys are rejected');
select ok(not valid_gift_look('{"pause":3}'), 'a pause not offered is rejected');
select ok(not valid_gift_look('{"wordsPerStep":"2"}'), 'a number given as text is rejected');
select ok(not valid_gift_look('{"intro":"yes"}'), 'a switch must be true/false');
select ok(not valid_gift_look('{"clips":[{"in":-1,"fit":"loop"}]}'), 'a negative in-point is rejected');
select ok(not valid_gift_look('{"closing":{"title":"x","names":[]}}'), 'unknown keys are rejected');
select ok(not valid_gift_look('[]'), 'a look must be an object');
select is(ayah_count(2), 286, '286 ayat in Al-Baqarah');
select is((select sum(ayah_count(s))::int from generate_series(1, 114) s), 6236, '6236 ayat in all');

-- Aisha sends a gift
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
insert into ids select 'g', send_gift(2, 255, 257, 7, '{"textMode":"line","scenes":["night"]}', '  Aisha  ', ' Thinking
of you ');
select ok((select v ~ '^[a-hj-km-np-z2-9]{12}$' from ids where k = 'g'), 'a 12-character link id');
select is((get_gift((select v from ids where k = 'g')) ->> 'message'), 'Thinking of you', 'the message is tidied to one line');
select is((get_gift((select v from ids where k = 'g')) ->> 'mine')::boolean, true, 'she sees it as hers');
select throws_ok($$ select send_gift(2, 286, 287, 7, '{}', 'Aisha') $$, '22023', null, 'an ayah past the end of the surah is refused');
select throws_ok($$ select send_gift(115, 1, 1, 7, '{}', 'Aisha') $$, '22023', null, 'surah 115 is refused');
select throws_ok($$ select send_gift(2, 1, 11, 7, '{}', 'Aisha') $$, '22023', null, 'more than 10 ayat are refused');
select throws_ok($$ select send_gift(2, 5, 4, 7, '{}', 'Aisha') $$, '22023', null, 'a backwards range is refused');
select throws_ok($$ select send_gift(2, 1, 1, 168, '{}', 'Aisha') $$, '22023', null, 'a reciter the app does not offer is refused');
select throws_ok($$ select send_gift(2, 1, 1, 7, '{"textEffect":"spin"}', 'Aisha') $$, '22023', null, 'a forged look is refused');
select throws_ok($$ select send_gift(2, 1, 1, 7, '{}', '   ') $$, '22023', null, 'a name is needed');
select throws_ok($$ select send_gift(2, 1, 1, 7, '{}', 'Aisha', repeat('x', 141)) $$, '22023', null, 'a message over 140 characters is refused');
select throws_ok($$ insert into gifts (id, from_id, from_name, surah, ayah_from, ayah_to, reciter, look)
  values ('abcdefghjkmn', 'aaaaaaaa-0000-0000-0000-000000000001', 'A', 1, 1, 1, 7, '{}') $$, '42501', null, 'nobody inserts directly');

-- A signed-out visitor opens the link
select pg_temp.act_as_visitor();
select is((get_gift((select v from ids where k = 'g')) ->> 'from_name'), 'Aisha', 'a visitor opens the gift');
select is((get_gift((select v from ids where k = 'g')) ->> 'mine')::boolean, false, 'not theirs');
select ok((get_gift((select v from ids where k = 'g')) -> 'replies') = 'null'::jsonb, 'a visitor does not see replies');
select is(get_gift('zzzzzzzzzzzz'), null, 'an unknown id opens nothing');
select throws_ok($$ select * from gifts $$, '42501', null, 'a visitor cannot list gifts');
select throws_ok($$ select send_gift(1, 1, 7, 7, '{}', 'Guest') $$, '42501', null, 'a visitor cannot send');

-- Bilal cannot list or change gifts; he replies
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000002');
select throws_ok($$ select * from gifts $$, '42501', null, 'a signed-in user cannot list gifts');
select throws_ok($$ select delete_gift((select v from ids where k = 'g')) $$, '42501', null, 'nobody else can delete her gift');
insert into ids select 'r', send_gift(94, 5, 6, 3, '{}', 'Bilal', 'For you too', (select v from ids where k = 'g'));
select is((get_gift((select v from ids where k = 'r')) ->> 'reply_to'), (select v from ids where k = 'g'), 'the reply points at her gift');

-- An anonymous session may only reply
select pg_temp.act_as('dddddddd-0000-0000-0000-000000000004', true);
select throws_ok($$ select send_gift(1, 1, 7, 7, '{}', 'Guest') $$, '42501', null, 'an anonymous session cannot start a gift');
select lives_ok($$ select send_gift(1, 1, 7, 7, '{}', 'Guest', null, (select v from ids where k = 'g')) $$, 'but can reply');

-- Aisha sees the thread and the opens
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select is(jsonb_array_length(get_gift((select v from ids where k = 'g')) -> 'replies'), 2, 'she sees both replies on her gift');
select is((select count(*)::int from my_gifts() where kind = 'reply'), 2, 'and in her gifts list');
select is((select opens from my_gifts() where kind = 'sent'), 3, 'opens by others are counted, hers are not');
select lives_ok($$ select delete_gift((select v from ids where k = 'g')) $$, 'she deletes her gift');
select is(get_gift((select v from ids where k = 'r')) ->> 'reply_to', null, 'the reply stays, without the thread');

select * from finish();
rollback;
