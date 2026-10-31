-- The reel counter split into shards (supabase/migrations/20261031000000_scale_reel_counts.sql).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(4);

select record_reel(7, 1, 1, 7) from generate_series(1, 25);
select is((popular_this_week() ->> 'total')::int, 25, 'every reel is counted once, whatever shard it landed in');
select is((popular_this_week() -> 'reciters' -> 0 ->> 'n')::int, 25, 'a reciter''s shards add up');
select is((popular_this_week() -> 'ayat' -> 0 ->> 'n')::int, 25, 'an ayah range''s shards add up');
select ok((select count(*) from reel_counts where kind = 'reciter' and key = '7') between 1 and 16, 'at most 16 rows a key and day');

select * from finish();
rollback;
