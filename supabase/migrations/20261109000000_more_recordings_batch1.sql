-- 53 more mp3quran.net recordings (ids 1051–1103 in src/data/reciters.ts; ayah and word times by alignment),
-- so popular counts accept them.
create or replace function public.valid_reciter(r int) returns boolean
language sql immutable set search_path = '' as $$
  select r = any (array[7, 173, 3, 10, 6, 12, 2, 1, 9, 4, 5, 97, 161]) or r between 1001 and 1103;
$$;
