-- 10 reciters from mp3quran.net (ids 1027–1036 in src/data/reciters.ts; Ayah mode, verified surahs only),
-- so gifts can use them.
create or replace function public.valid_reciter(r int) returns boolean
language sql immutable set search_path = '' as $$
  select r = any (array[7, 173, 3, 10, 6, 12, 2, 1, 9, 4, 5, 97, 161]) or r between 1001 and 1036;
$$;
