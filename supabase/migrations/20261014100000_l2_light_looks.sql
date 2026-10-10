-- L2 Light reel backgrounds (docs/light.md): looks shared in gifts and walls may use the five
-- built-in light scenes (light:dawn, light:stars, light:aurora, light:lanterns, light:rays) and the
-- two light transitions (lightbloom, clouddrift). Same function as in 20261012000000_k5_kid_looks.sql
-- otherwise; existing grants are kept.
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
      when 'showTranslation', 'surahName', 'sceneSnap', 'intro', 'outro', 'credit', 'watermark' then
        if jsonb_typeof(v) <> 'boolean' then return false; end if;
      when 'colors' then
        if jsonb_typeof(v) <> 'object' or exists (select 1 from jsonb_each(v) c
          where c.key not in ('ar', 'en', 'title') or jsonb_typeof(c.value) <> 'string' or (c.value #>> '{}') !~ '^#[0-9a-fA-F]{6}$')
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
