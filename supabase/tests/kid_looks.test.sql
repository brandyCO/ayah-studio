-- K5 Kid-friendly reel moods (supabase/migrations/20261012000000_k5_kid_looks.sql): shared looks accept
-- the rounder translation font and the pastel backgrounds; everything else is still checked.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(7);

select ok(valid_gift_look('{"enFont":"round"}'), 'the rounder translation font is accepted');
select ok(valid_gift_look('{"enFont":"serif"}'), 'serif is still accepted');
select ok(not valid_gift_look('{"enFont":"comic"}'), 'an unknown font is rejected');
select ok(valid_gift_look('{"scenes":["kid-moon","kid-dunes","kid-clouds"]}'), 'the pastel backgrounds are built in');
select ok(valid_gift_look('{"scenes":["mist","night"]}'), 'the earlier backgrounds are still built in');
select ok(not valid_gift_look('{"scenes":["kid-unknown"]}'), 'an unknown background is rejected');
select ok(not valid_gift_look('{"scenes":["u:123"]}'), 'own media still cannot be shared');

select * from finish();
rollback;
