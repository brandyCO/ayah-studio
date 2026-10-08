-- T8 Dua & ayah wall (docs/together.md): a host (Google account) opens a wall for an occasion; guests
-- join with its 6-character code (or the QR code), signed in with Google or — once enabled in the
-- project — anonymously, and add one entry each: their name, ≤ 3 ayat (a reference only, never Quran
-- text) and an optional short dua in their own words. The host's screen shows the entries live and
-- can hide any of them; the keepsake reel uses the visible ones. Guest text is seen only by the host
-- and the guest who wrote it (no listing, nothing public). Nobody writes the tables directly: only
-- the functions below, which check every value.

create table if not exists public.walls (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  occasion text not null check (occasion in ('wedding', 'eid', 'ramadan', 'birth', 'gathering', 'memorial', 'other')),
  join_code text not null unique check (join_code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  status text not null default 'open' check (status in ('open', 'closed')),
  look jsonb not null check (public.valid_gift_look(look)),
  reciter int not null check (public.valid_reciter(reciter)),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists walls_host on public.walls (host_id, created_at desc);

create table if not exists public.wall_entries (
  id uuid primary key default gen_random_uuid(),
  wall_id uuid not null references public.walls (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  dua text check (dua is null or char_length(dua) between 1 and 140),
  surah smallint not null check (surah between 1 and 114),
  ayah_from smallint not null check (ayah_from >= 1),
  ayah_to smallint not null,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wall_id, user_id),
  check (ayah_to between ayah_from and least(ayah_from + 2, public.ayah_count(surah)))
);
create index if not exists wall_entries_wall on public.wall_entries (wall_id, created_at);
create index if not exists wall_entries_user on public.wall_entries (user_id, created_at desc);

alter table public.walls enable row level security;
alter table public.wall_entries enable row level security;

-- The host reads their walls and every entry on them (hidden ones too, to show them again); a guest
-- reads only their own entry. Realtime (the host's live screen) follows the same policies.
drop policy if exists "hosts read walls" on public.walls;
create policy "hosts read walls" on public.walls for select to authenticated using (host_id = auth.uid());
drop policy if exists "host and author read entries" on public.wall_entries;
create policy "host and author read entries" on public.wall_entries for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.walls w where w.id = wall_id and w.host_id = auth.uid()));

revoke all on table public.walls, public.wall_entries from anon, authenticated;
grant select on table public.walls, public.wall_entries to authenticated;

-- Open a wall. Returns its id and join code.
create or replace function public.create_wall(wall_title text, wall_occasion text, wall_look jsonb, reciter_id int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.require_account();
  w uuid;
  code text;
begin
  if public.clean_name(wall_title, 80) is null then raise exception 'A title is needed' using errcode = '22023'; end if;
  if wall_occasion is null or wall_occasion not in ('wedding', 'eid', 'ramadan', 'birth', 'gathering', 'memorial', 'other') then
    raise exception 'Unknown occasion' using errcode = '22023';
  end if;
  if not public.valid_gift_look(wall_look) then raise exception 'Not a valid look' using errcode = '22023'; end if;
  if not public.valid_reciter(reciter_id) then raise exception 'Unknown reciter' using errcode = '22023'; end if;
  if (select count(*) from public.walls where host_id = me and status = 'open') >= 5 then
    raise exception 'You can have up to 5 open walls — close one first';
  end if;
  if (select count(*) from public.walls where host_id = me) >= 50 then
    raise exception 'You can keep up to 50 walls — delete an old one first';
  end if;
  loop
    code := (select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
             from generate_series(1, 6));
    exit when not exists (select 1 from public.walls where join_code = code);
  end loop;
  insert into public.walls (host_id, title, occasion, join_code, look, reciter)
    values (me, public.clean_name(wall_title, 80), wall_occasion, code, wall_look, reciter_id) returning id into w;
  return jsonb_build_object('id', w, 'code', code);
end $$;

-- The host changes the title, occasion, look or reciter (the keepsake reel's).
create or replace function public.update_wall(wall_id uuid, wall_title text, wall_occasion text, wall_look jsonb, reciter_id int)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := public.require_account();
begin
  if public.clean_name(wall_title, 80) is null then raise exception 'A title is needed' using errcode = '22023'; end if;
  if wall_occasion is null or wall_occasion not in ('wedding', 'eid', 'ramadan', 'birth', 'gathering', 'memorial', 'other') then
    raise exception 'Unknown occasion' using errcode = '22023';
  end if;
  if not public.valid_gift_look(wall_look) then raise exception 'Not a valid look' using errcode = '22023'; end if;
  if not public.valid_reciter(reciter_id) then raise exception 'Unknown reciter' using errcode = '22023'; end if;
  update public.walls set title = public.clean_name(wall_title, 80), occasion = wall_occasion, look = wall_look, reciter = reciter_id
    where id = wall_id and host_id = me;
  if not found then raise exception 'Not your wall' using errcode = '42501'; end if;
end $$;

-- Close a wall (no new entries; it stays for the keepsake reel) or open it again.
create or replace function public.set_wall_open(wall_id uuid, open boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := public.require_account();
begin
  if open and (select count(*) from public.walls where host_id = me and status = 'open' and id <> wall_id) >= 5 then
    raise exception 'You can have up to 5 open walls — close one first';
  end if;
  update public.walls set status = case when open then 'open' else 'closed' end,
    closed_at = case when open then null else now() end
    where id = wall_id and host_id = me;
  if not found then raise exception 'Not your wall' using errcode = '42501'; end if;
end $$;

create or replace function public.delete_wall(wall_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := public.require_account();
begin
  delete from public.walls where id = wall_id and host_id = me;
  if not found then raise exception 'Not your wall' using errcode = '42501'; end if;
end $$;

-- The host hides an entry from the wall and the keepsake reel (or shows it again).
create or replace function public.hide_wall_entry(entry_id uuid, hide boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := public.require_account();
begin
  update public.wall_entries e set hidden = hide
    where e.id = entry_id and exists (select 1 from public.walls w where w.id = e.wall_id and w.host_id = me);
  if not found then raise exception 'Not your wall' using errcode = '42501'; end if;
end $$;

-- What a guest sees before joining (signed out too): the wall's title, occasion and whether it is
-- open; signed in, also their own entry.
create or replace function public.wall_preview(code text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  w public.walls;
  e public.wall_entries;
begin
  select * into w from public.walls where join_code = upper(btrim(code));
  if w.id is null then return null; end if;
  if auth.uid() is not null then select * into e from public.wall_entries where wall_id = w.id and user_id = auth.uid(); end if;
  return jsonb_build_object('title', w.title, 'occasion', w.occasion, 'open', w.status = 'open', 'host', w.host_id = auth.uid(),
    'entry', case when e.id is null then null else jsonb_build_object('id', e.id, 'name', e.name, 'dua', e.dua, 'surah', e.surah,
      'ayah_from', e.ayah_from, 'ayah_to', e.ayah_to, 'hidden', e.hidden) end);
end $$;

-- Add (or change) your entry on an open wall: one per person.
create or replace function public.add_wall_entry(code text, guest_name text, guest_dua text, s int, a_from int, a_to int)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  anon boolean := coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
  w public.walls;
  eid uuid;
  d text := nullif(btrim(regexp_replace(coalesce(guest_dua, ''), '\s+', ' ', 'g')), '');
begin
  if me is null then raise exception 'Sign in to add to the wall' using errcode = '42501'; end if;
  select * into w from public.walls where join_code = upper(btrim(code));
  if w.id is null then raise exception 'This wall is not there any more' using errcode = 'P0002'; end if;
  if w.status <> 'open' or w.created_at < now() - interval '30 days' then
    raise exception 'This wall is closed' using errcode = '42501';
  end if;
  if s is null or s not between 1 and 114 or a_from is null or a_to is null or a_from < 1
    or a_to < a_from or a_to > public.ayah_count(s) or a_to - a_from >= 3 then
    raise exception 'Choose one to three ayat' using errcode = '22023';
  end if;
  if public.clean_name(guest_name, 40) is null then raise exception 'A name is needed' using errcode = '22023'; end if;
  if char_length(d) > 140 then raise exception 'The dua can be up to 140 characters' using errcode = '22023'; end if;
  select id into eid from public.wall_entries where wall_id = w.id and user_id = me;
  if eid is null then
    if (select count(*) from public.wall_entries where wall_id = w.id) >= 300 then
      raise exception 'This wall is full';
    end if;
    if (select count(*) from public.wall_entries where user_id = me and created_at > now() - interval '1 day') >= (case when anon then 5 else 20 end) then
      raise exception 'That is a lot of walls for one day — please try again tomorrow';
    end if;
    insert into public.wall_entries (wall_id, user_id, name, dua, surah, ayah_from, ayah_to)
      values (w.id, me, public.clean_name(guest_name, 40), d, s, a_from, a_to) returning id into eid;
  else
    update public.wall_entries set name = public.clean_name(guest_name, 40), dua = d, surah = s, ayah_from = a_from, ayah_to = a_to,
      updated_at = now() where id = eid;
  end if;
  return eid;
end $$;

-- A guest takes their own entry off the wall.
create or replace function public.remove_wall_entry(entry_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  delete from public.wall_entries where id = entry_id and user_id = auth.uid();
  if not found then raise exception 'Not your entry' using errcode = '42501'; end if;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'create_wall(text, text, jsonb, int)', 'update_wall(uuid, text, text, jsonb, int)', 'set_wall_open(uuid, boolean)',
    'delete_wall(uuid)', 'hide_wall_entry(uuid, boolean)', 'add_wall_entry(text, text, text, int, int, int)', 'remove_wall_entry(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke all on function public.wall_preview(text) from public;
grant execute on function public.wall_preview(text) to anon, authenticated;

-- Live updates on the host's screen (Realtime respects the select policies above).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'wall_entries') then
      alter publication supabase_realtime add table public.wall_entries;
    end if;
  end if;
end $$;
