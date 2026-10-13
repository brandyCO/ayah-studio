-- Islam Sobhi (id 1037 in src/data/reciters.ts): mp3quran.net recording with ayah times made by alignment
-- and checked (scripts/make-mp3quran-timings.py; Ayah mode, verified surahs only), so gifts can use him.
create or replace function public.valid_reciter(r int) returns boolean
language sql immutable set search_path = '' as $$
  select r = any (array[7, 173, 3, 10, 6, 12, 2, 1, 9, 4, 5, 97, 161]) or r between 1001 and 1037;
$$;
