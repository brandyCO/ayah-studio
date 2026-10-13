-- Studio styles and popular reciters (2026-10-13).
-- 1. Shared looks (gifts) may carry the word highlight (`highlight`, colour `colors.hl`) and the
--    finishing touches `grain` / `vignette`. Same function as in 20261014100000_l2_light_looks.sql
--    otherwise; existing grants are kept.
-- 2. Six reciters without word timings (everyayah only, Ayah mode: ids 1001-1006 in src/data/reciters.ts).
-- 3. "Popular this week": anonymous daily counts of exported reels per reciter and per ayah range.
--    No user id, no device id, nothing per person is stored. Nobody reads the table; the summary
--    function only answers once at least 20 reels were made in the last 7 days.

create or replace function public.valid_gift_look(l jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  k text;
  v jsonb;
  e jsonb;
begin
  if l is null or jsonb_typeof(l) <> 'object' or octet_length(l::text) > 4000 then return false; end if;
  for k, v in select * from jsonb_each(l) loop
    case k
      when 'textMode' then if v not in ('"ayah"', '"line"', '"half"', '"words"') then return false; end if;
      when 'wordsPerStep' then if v not in ('1', '2', '3') then return false; end if;
      when 'translationMode' then if v not in ('"words"', '"ayah"') then return false; end if;
      when 'titlePos' then if v not in ('"top"', '"below"', '"bottom"') then return false; end if;
      when 'titleSize', 'textSize' then if v not in ('"s"', '"m"', '"l"') then return false; end if;
      when 'textEffect' then
        if jsonb_typeof(v) <> 'string' or not (v #>> '{}') = any (array['rise','fade','blur-in','focus','ink','glow','sweep','bloom',
          'dissolve','mist','lines','drift','settle','zoom','push','descend','still']) then return false; end if;
      when 'sceneMode' then if v not in ('"single"', '"ayah"', '"even"', '"custom"') then return false; end if;
      when 'transition' then
        if jsonb_typeof(v) <> 'string' or not (v #>> '{}') = any (array['crossfade','blur','black','white','zoom','leak','mist',
          'parallax','wipe','iris','lightbloom','clouddrift','cut']) then return false; end if;
      when 'grade' then if v not in ('"none"', '"warm"', '"golden"', '"cool"', '"dusk"', '"mono"') then return false; end if;
      when 'scrim' then if v not in ('"light"', '"normal"', '"strong"') then return false; end if;
      when 'textPos' then if v not in ('"upper"', '"center"', '"lower"') then return false; end if;
      when 'enFont' then if v not in ('"serif"', '"sans"', '"round"') then return false; end if;
      when 'pause' then if v not in ('0', '0.5', '1', '2') then return false; end if;
      when 'gap' then if v not in ('"hold"', '"clear"') then return false; end if;
      when 'showTranslation', 'surahName', 'sceneSnap', 'intro', 'outro', 'credit', 'watermark', 'highlight', 'grain', 'vignette' then
        if jsonb_typeof(v) <> 'boolean' then return false; end if;
      when 'colors' then
        if jsonb_typeof(v) <> 'object' or exists (select 1 from jsonb_each(v) c
          where c.key not in ('ar', 'en', 'title', 'hl') or jsonb_typeof(c.value) <> 'string' or (c.value #>> '{}') !~ '^#[0-9a-fA-F]{6}$')
        then return false; end if;
      when 'scenes' then
        if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) not between 1 and 10 then return false; end if;
        for e in select * from jsonb_array_elements(v) loop
          if jsonb_typeof(e) <> 'string' or not (e #>> '{}') = any (array['mist','motes','dunes','night','kid-moon','kid-dunes','kid-clouds','midnight','forest','charcoal',
            'light:dawn','light:stars','light:aurora','light:lanterns','light:rays'])
          then return false; end if;
        end loop;
      when 'clips' then
        if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) > 10 then return false; end if;
        for e in select * from jsonb_array_elements(v) loop
          if jsonb_typeof(e) = 'null' then continue; end if;
          if jsonb_typeof(e) <> 'object' or jsonb_typeof(e -> 'in') <> 'number' or (e ->> 'in')::numeric < 0
            or (e ->> 'in')::numeric > 3600 or coalesce(e ->> 'fit', '') not in ('loop', 'slow', 'hold')
            or exists (select 1 from jsonb_object_keys(e) x where x not in ('in', 'fit')) then return false; end if;
        end loop;
      when 'sceneLengths' then
        if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) > 10 then return false; end if;
        for e in select * from jsonb_array_elements(v) loop
          if jsonb_typeof(e) <> 'number' or (e #>> '{}')::numeric <= 0 or (e #>> '{}')::numeric > 100000 then return false; end if;
        end loop;
      else return false; -- unknown key
    end case;
  end loop;
  return true;
end $$;

create or replace function public.valid_reciter(r int) returns boolean
language sql immutable set search_path = '' as $$
  select r = any (array[7, 173, 3, 10, 6, 12, 2, 1, 9, 4, 5, 97, 161, 1001, 1002, 1003, 1004, 1005, 1006]);
$$;

create table if not exists public.reel_counts (
  day date not null,
  kind text not null check (kind in ('reciter', 'ayah')),
  key text not null check (char_length(key) <= 16),
  n int not null default 0 check (n >= 0),
  primary key (day, kind, key)
);
alter table public.reel_counts enable row level security;
-- No policies: the table is reached only through the two functions below.

create or replace function public.record_reel(reciter_id int, s int, a_from int, a_to int) returns void
language plpgsql security definer set search_path = '' as $$
declare
  d date := (now() at time zone 'utc')::date;
  k text;
begin
  if not public.valid_reciter(reciter_id) then raise exception 'Unknown reciter' using errcode = '22023'; end if;
  if s is null or s < 1 or s > 114 or a_from is null or a_to is null or a_from < 1
    or a_to < a_from or a_to > public.ayah_count(s) or a_to - a_from >= 10 then
    raise exception 'Not a valid selection' using errcode = '22023';
  end if;
  k := s || ':' || a_from || case when a_to > a_from then '-' || a_to else '' end;
  insert into public.reel_counts as c (day, kind, key, n) values (d, 'reciter', reciter_id::text, 1)
    on conflict (day, kind, key) do update set n = least(c.n + 1, 1000000);
  insert into public.reel_counts as c (day, kind, key, n) values (d, 'ayah', k, 1)
    on conflict (day, kind, key) do update set n = least(c.n + 1, 1000000);
  -- Only the last few weeks are ever needed.
  if random() < 0.02 then delete from public.reel_counts where day < d - 60; end if;
end $$;

create or replace function public.popular_this_week() returns jsonb
language sql stable security definer set search_path = '' as $$
  with recent as (
    select kind, key, sum(n)::int as n from public.reel_counts
    where day > (now() at time zone 'utc')::date - 7 group by kind, key
  ), total as (select coalesce(sum(n), 0) as n from recent where kind = 'reciter')
  select case when (select n from total) < 20 then jsonb_build_object('total', (select n from total), 'reciters', '[]'::jsonb, 'ayat', '[]'::jsonb)
  else jsonb_build_object(
    'total', (select n from total),
    'reciters', coalesce((select jsonb_agg(jsonb_build_object('id', key::int, 'n', n) order by n desc, key)
      from (select key, n from recent where kind = 'reciter' order by n desc, key limit 5) r), '[]'::jsonb),
    'ayat', coalesce((select jsonb_agg(jsonb_build_object('key', key, 'n', n) order by n desc, key)
      from (select key, n from recent where kind = 'ayah' order by n desc, key limit 5) a), '[]'::jsonb))
  end;
$$;

revoke all on public.reel_counts from anon, authenticated;
revoke all on function public.record_reel(int, int, int, int) from public;
revoke all on function public.popular_this_week() from public;
grant execute on function public.record_reel(int, int, int, int) to anon, authenticated;
grant execute on function public.popular_this_week() to anon, authenticated;
