-- Studio styles and popular reciters (supabase/migrations/20261015000000_studio_styles_popular.sql).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(14);

select ok(valid_gift_look('{"highlight":true,"grain":false,"vignette":true}'), 'highlight, grain and vignette are accepted');
select ok(valid_gift_look('{"colors":{"ar":"#ffffff","hl":"#f2c46b"}}'), 'the highlight colour is accepted');
select ok(not valid_gift_look('{"highlight":"yes"}'), 'highlight must be a boolean');
select ok(not valid_gift_look('{"colors":{"hl":"gold"}}'), 'the highlight colour must be #rrggbb');
select ok(valid_gift_look('{"transition":"lightbloom","scenes":["light:dawn"]}'), 'earlier looks still pass');
select ok(valid_reciter(1001) and valid_reciter(1006) and valid_reciter(7), 'the new reciters and the earlier ones are known');
select ok(not valid_reciter(1007), 'an unknown reciter is rejected');

select is((popular_this_week() -> 'reciters'), '[]'::jsonb, 'nothing is shown before 20 reels');
select throws_ok($$ select record_reel(9999, 1, 1, 7) $$, '22023', 'Unknown reciter', 'an unknown reciter is refused');
select throws_ok($$ select record_reel(7, 1, 1, 8) $$, '22023', 'Not a valid selection', 'a range past the surah is refused');
select throws_ok($$ select record_reel(7, 2, 1, 11) $$, '22023', 'Not a valid selection', 'more than 10 ayat is refused');

select record_reel(7, 1, 1, 7) from generate_series(1, 15);
select record_reel(1001, 55, 13, 13) from generate_series(1, 6);
select is((popular_this_week() -> 'reciters' -> 0 ->> 'id')::int, 7, 'the most used reciter comes first');
select is((popular_this_week() -> 'ayat' -> 1 ->> 'key'), '55:13', 'ayah ranges are counted as s:a or s:a-b');

set local role anon;
select throws_ok($$ select * from public.reel_counts $$, '42501', null, 'nobody reads the counts directly');
reset role;

select * from finish();
rollback;
