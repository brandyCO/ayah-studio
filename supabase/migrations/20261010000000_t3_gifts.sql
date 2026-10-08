-- T3 Gift an ayah (docs/together.md): a link that plays a few ayat in the sender's reel look, with an
-- optional short message. Anyone holding the link can open it (signed out too) through get_gift(id);
-- nobody can list gifts. Gifts are written only through send_gift(), which checks the reference
-- against the ayah counts, the reciter, the look (the same checks as applyLook() in the app) and the
-- lengths; afterwards a gift never changes (its author can delete it). Only references are stored —
-- never Quran text. Replies point at the gift they answer (reply_to), so two gifts form a thread;
-- anonymous sessions (once enabled in the project) may only send replies.

-- Ayat per surah (Hafs, 6236 in all; public/data/meta.json).
create or replace function public.ayah_count(s int) returns int
language sql immutable set search_path = '' as $$
  select (array[7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,112,78,118,64,77,227,93,88,
    69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,
    30,52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,
    3,5,4,5,6])[s];
$$;

-- A reel look as the app stores it (src/engine/project.ts LOOK_KEYS / applyLook): known keys only,
-- each with its allowed values; backgrounds only from the built-in set (the sender's own media stays
-- on their device).
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
          'parallax','wipe','iris','cut']) then return false; end if;
      when 'grade' then if v not in ('"none"', '"warm"', '"golden"', '"cool"', '"dusk"', '"mono"') then return false; end if;
      when 'scrim' then if v not in ('"light"', '"normal"', '"strong"') then return false; end if;
      when 'textPos' then if v not in ('"upper"', '"center"', '"lower"') then return false; end if;
      when 'enFont' then if v not in ('"serif"', '"sans"') then return false; end if;
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
          if jsonb_typeof(e) <> 'string' or not (e #>> '{}') = any (array['mist','motes','dunes','night','midnight','forest','charcoal'])
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

-- Reciters the app offers (src/data/reciters.ts; QDC recitation ids, 168 excluded).
create or replace function public.valid_reciter(r int) returns boolean
language sql immutable set search_path = '' as $$
  select r = any (array[7, 173, 3, 10, 6, 12, 2, 1, 9, 4, 5, 97, 161]);
$$;

create table if not exists public.gifts (
  id text primary key check (id ~ '^[a-hj-km-np-z2-9]{12}$'),
  from_id uuid not null references auth.users (id) on delete cascade,
  from_name text not null check (char_length(btrim(from_name)) between 1 and 40),
  surah smallint not null check (surah between 1 and 114),
  ayah_from smallint not null check (ayah_from >= 1),
  ayah_to smallint not null,
  reciter int not null check (public.valid_reciter(reciter)),
  look jsonb not null check (public.valid_gift_look(look)),
  message text check (message is null or char_length(message) between 1 and 140),
  reply_to text references public.gifts (id) on delete set null,
  created_at timestamptz not null default now(),
  opens int not null default 0,
  check (ayah_to between ayah_from and least(ayah_from + 9, public.ayah_count(surah)))
);
create index if not exists gifts_from on public.gifts (from_id, created_at desc);
create index if not exists gifts_reply on public.gifts (reply_to);

alter table public.gifts enable row level security;
-- No policies: nobody reads or writes the table directly (no listing); only the functions below.

-- Send a gift (or a reply). Returns the new gift's id for the link.
create or replace function public.send_gift(
  s int, a_from int, a_to int, reciter_id int, gift_look jsonb, sender_name text,
  msg text default null, reply text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  anon boolean := coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
  gid text;
  m text := nullif(btrim(regexp_replace(coalesce(msg, ''), '[\r\n\t]+', ' ', 'g')), '');
begin
  if me is null then raise exception 'Sign in to send a gift' using errcode = '42501'; end if;
  if anon and reply is null then raise exception 'Sign in with Google to send a gift' using errcode = '42501'; end if;
  if s is null or s not between 1 and 114 or a_from is null or a_to is null or a_from < 1
    or a_to < a_from or a_to > public.ayah_count(s) or a_to - a_from >= 10 then
    raise exception 'Not a valid selection of ayat' using errcode = '22023';
  end if;
  if not public.valid_reciter(reciter_id) then raise exception 'Unknown reciter' using errcode = '22023'; end if;
  if not public.valid_gift_look(gift_look) then raise exception 'Not a valid look' using errcode = '22023'; end if;
  if public.clean_name(sender_name, 40) is null then raise exception 'A name is needed' using errcode = '22023'; end if;
  if char_length(m) > 140 then raise exception 'The message can be up to 140 characters' using errcode = '22023'; end if;
  if reply is not null and not exists (select 1 from public.gifts where id = reply) then
    raise exception 'The gift you are replying to is not there any more' using errcode = 'P0002';
  end if;
  if (select count(*) from public.gifts where from_id = me and created_at > now() - interval '1 day') >= (case when anon then 5 else 30 end) then
    raise exception 'That is a lot of gifts for one day — please try again tomorrow';
  end if;
  loop
    -- 12 characters from the random bytes of a UUID (skipping the version/variant bytes): unguessable links.
    select string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', 1 + get_byte(b, i) % 31, 1), '' order by i) into gid
      from (select decode(replace(gen_random_uuid()::text, '-', ''), 'hex') b) u,
           unnest(array[0, 1, 2, 3, 4, 5, 7, 9, 10, 11, 12, 13]) i;
    exit when not exists (select 1 from public.gifts where id = gid);
  end loop;
  insert into public.gifts (id, from_id, from_name, surah, ayah_from, ayah_to, reciter, look, message, reply_to)
    values (gid, me, public.clean_name(sender_name, 40), s, a_from, a_to, reciter_id, gift_look, m, reply);
  return gid;
end $$;

-- Open a gift by its id (anyone with the link, signed out too). Counts opens by others. Its author
-- also sees the replies it received.
create or replace function public.get_gift(gift_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  g public.gifts;
  mine boolean;
begin
  select * into g from public.gifts where id = gift_id;
  if g.id is null then return null; end if;
  mine := auth.uid() is not null and g.from_id = auth.uid();
  if not mine then update public.gifts set opens = opens + 1 where id = g.id; end if;
  return jsonb_build_object(
    'id', g.id, 'from_name', g.from_name, 'surah', g.surah, 'ayah_from', g.ayah_from, 'ayah_to', g.ayah_to,
    'reciter', g.reciter, 'look', g.look, 'message', g.message, 'reply_to', g.reply_to, 'created_at', g.created_at,
    'mine', mine, 'opens', case when mine then g.opens end,
    'replies', case when mine then coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'from_name', r.from_name,
      'surah', r.surah, 'ayah_from', r.ayah_from, 'ayah_to', r.ayah_to, 'created_at', r.created_at) order by r.created_at)
      from public.gifts r where r.reply_to = g.id), '[]'::jsonb) end);
end $$;

-- The signed-in user's sent gifts and the replies they received (newest first).
create or replace function public.my_gifts()
returns table (id text, kind text, from_name text, surah smallint, ayah_from smallint, ayah_to smallint, message text,
  reply_to text, created_at timestamptz, opens int, replies bigint)
language sql stable security definer set search_path = '' as $$
  select * from (
    select g.id, 'sent', g.from_name, g.surah, g.ayah_from, g.ayah_to, g.message, g.reply_to, g.created_at, g.opens,
      (select count(*) from public.gifts r where r.reply_to = g.id)
      from public.gifts g where g.from_id = auth.uid()
    union all
    select r.id, 'reply', r.from_name, r.surah, r.ayah_from, r.ayah_to, r.message, r.reply_to, r.created_at, null, null
      from public.gifts r join public.gifts g on g.id = r.reply_to
      where g.from_id = auth.uid() and r.from_id <> auth.uid()
  ) x order by created_at desc limit 300;
$$;

-- Delete one of your own gifts (its link stops working; replies to it stay, without the thread).
create or replace function public.delete_gift(gift_id text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  delete from public.gifts where id = gift_id and from_id = auth.uid();
  if not found then raise exception 'Not your gift' using errcode = '42501'; end if;
end $$;

revoke all on table public.gifts from anon, authenticated;
revoke all on function public.ayah_count(int) from public;
revoke all on function public.valid_gift_look(jsonb) from public;
revoke all on function public.valid_reciter(int) from public;
grant execute on function public.ayah_count(int) to anon, authenticated;
grant execute on function public.valid_gift_look(jsonb) to anon, authenticated;
grant execute on function public.valid_reciter(int) to anon, authenticated;
revoke all on function public.send_gift(int, int, int, int, jsonb, text, text, text) from public, anon;
grant execute on function public.send_gift(int, int, int, int, jsonb, text, text, text) to authenticated;
revoke all on function public.get_gift(text) from public;
grant execute on function public.get_gift(text) to anon, authenticated;
revoke all on function public.my_gifts() from public, anon;
grant execute on function public.my_gifts() to authenticated;
revoke all on function public.delete_gift(text) from public, anon;
grant execute on function public.delete_gift(text) to authenticated;
