-- L2 Light reel backgrounds (supabase/migrations/20261014100000_l2_light_looks.sql): shared looks
-- accept the light scenes and the two light transitions; everything else is still checked.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(9);

select ok(valid_gift_look('{"scenes":["light:dawn","light:stars","light:aurora","light:lanterns","light:rays"]}'), 'the light scenes are built in');
select ok(valid_gift_look('{"scenes":["light:dawn","mist","kid-moon"]}'), 'light scenes mix with the other built-in backgrounds');
select ok(not valid_gift_look('{"scenes":["light:sun"]}'), 'an unknown light scene is rejected');
select ok(not valid_gift_look('{"scenes":["light:"]}'), 'an empty light id is rejected');
select ok(valid_gift_look('{"transition":"lightbloom"}'), 'Light bloom is accepted');
select ok(valid_gift_look('{"transition":"clouddrift"}'), 'Drift through clouds is accepted');
select ok(valid_gift_look('{"transition":"crossfade"}'), 'the earlier transitions are still accepted');
select ok(not valid_gift_look('{"transition":"spin"}'), 'an unknown transition is rejected');
select ok(valid_gift_look('{"enFont":"round","scenes":["kid-clouds"]}'), 'the K5 kid looks still pass');

select * from finish();
rollback;
