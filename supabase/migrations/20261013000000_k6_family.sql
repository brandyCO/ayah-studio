-- K6 Family encouragement (docs/kids.md): a family circle is a circle of kind 'family'. Its members
-- (parents, grandparents, relatives — all with accounts) add children by first name only (children
-- have no accounts), follow the short surahs each child is learning or has learned (lit lanterns), and
-- leave short du'a notes for a child that the Kids space shows on the parent's device. Like T2, members
-- read everything in their circle and nobody writes these tables directly: every change goes through
-- the checked functions below. Only names, surah numbers and short notes (user text, length-limited)
-- are stored — never Quran text.

alter table public.circles add column if not exists kind text not null default 'khatm';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'circles_kind_check') then
    alter table public.circles add constraint circles_kind_check check (kind in ('khatm', 'family'));
  end if;
end $$;

-- The surahs of the Kids space: Al-Fatiha and Juz 'Amma (An-Naba … An-Nas).
create or replace function public.kids_surah(s int) returns boolean
language sql immutable set search_path = '' as $$
  select s is not null and (s = 1 or s between 78 and 114);
$$;

create table if not exists public.circle_children (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 24),
  added_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists circle_children_circle on public.circle_children (circle_id);

create table if not exists public.family_parts (
  child_id uuid not null references public.circle_children (id) on delete cascade,
  circle_id uuid not null references public.circles (id) on delete cascade,
  surah smallint not null check (public.kids_surah(surah)),
  status text not null check (status in ('learning', 'learned')),
  at timestamptz not null default now(),
  primary key (child_id, surah)
);
create index if not exists family_parts_circle on public.family_parts (circle_id);

create table if not exists public.family_notes (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles (id) on delete cascade,
  child_id uuid not null references public.circle_children (id) on delete cascade,
  surah smallint check (surah is null or public.kids_surah(surah)),
  from_id uuid not null references auth.users (id) on delete cascade,
  from_name text not null check (char_length(btrim(from_name)) between 1 and 40),
  body text not null check (char_length(btrim(body)) between 1 and 140),
  created_at timestamptz not null default now(),
  seen_at timestamptz
);
create index if not exists family_notes_child on public.family_notes (child_id);

alter table public.circle_children enable row level security;
alter table public.family_parts enable row level security;
alter table public.family_notes enable row level security;

drop policy if exists "members read children" on public.circle_children;
create policy "members read children" on public.circle_children for select to authenticated
  using ((select public.is_circle_member(circle_id)));
drop policy if exists "members read family parts" on public.family_parts;
create policy "members read family parts" on public.family_parts for select to authenticated
  using ((select public.is_circle_member(circle_id)));
drop policy if exists "members read notes" on public.family_notes;
create policy "members read notes" on public.family_notes for select to authenticated
  using ((select public.is_circle_member(circle_id)));
-- (no insert/update/delete policies: changes only through the functions below)

-- Create a family circle: the creator becomes its first member. No juz parts.
create or replace function public.create_family_circle(circle_name text, member_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.require_account();
  c uuid;
  code text;
begin
  if (select count(*) from public.circles where owner_id = me) >= 10 then
    raise exception 'You can have up to 10 circles';
  end if;
  if (select count(*) from public.circle_members where user_id = me) >= 20 then
    raise exception 'You can be in up to 20 circles';
  end if;
  if public.clean_name(circle_name, 60) is null or public.clean_name(member_name, 40) is null then
    raise exception 'A name is needed' using errcode = '22023';
  end if;
  loop
    code := (select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
             from generate_series(1, 8));
    exit when not exists (select 1 from public.circles where invite_code = code);
  end loop;
  insert into public.circles (name, owner_id, invite_code, kind)
    values (public.clean_name(circle_name, 60), me, code, 'family') returning id into c;
  insert into public.circle_members (circle_id, user_id, name, color) values (c, me, public.clean_name(member_name, 40), 0);
  return c;
end $$;

-- A family circle the caller is in (raises otherwise).
create or replace function public.family_member(c uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_account();
  if not public.is_circle_member(c) or not exists (select 1 from public.circles where id = c and kind = 'family') then
    raise exception 'Not in this family circle' using errcode = '42501';
  end if;
end $$;

-- The child's circle, if the caller may manage the child (the member who added them, or the owner).
create or replace function public.child_guardian(ch uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := public.require_account();
  c uuid;
begin
  select k.circle_id into c from public.circle_children k join public.circles ci on ci.id = k.circle_id
    where k.id = ch and public.is_circle_member(k.circle_id) and (k.added_by = me or ci.owner_id = me);
  if c is null then raise exception 'Only the parent who added this child (or the circle owner) can do this' using errcode = '42501'; end if;
  return c;
end $$;

create or replace function public.add_child(c uuid, child_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  ch uuid;
begin
  perform public.family_member(c);
  if public.clean_name(child_name, 24) is null then raise exception 'A name is needed' using errcode = '22023'; end if;
  if (select count(*) from public.circle_children where circle_id = c) >= 8 then
    raise exception 'A family circle can have up to 8 children';
  end if;
  insert into public.circle_children (circle_id, name, added_by) values (c, public.clean_name(child_name, 24), auth.uid())
    returning id into ch;
  return ch;
end $$;

create or replace function public.rename_child(ch uuid, child_name text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.child_guardian(ch);
  if public.clean_name(child_name, 24) is null then raise exception 'A name is needed' using errcode = '22023'; end if;
  update public.circle_children set name = public.clean_name(child_name, 24) where id = ch;
end $$;

create or replace function public.remove_child(ch uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.child_guardian(ch);
  delete from public.circle_children where id = ch;
end $$;

-- A child's surah: 'learning' (the surah they are on now), 'learned' (the lantern is lit) or 'none'.
create or replace function public.set_child_surah(ch uuid, s int, state text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  c uuid := public.child_guardian(ch);
begin
  if not public.kids_surah(s) then raise exception 'Not one of the short surahs' using errcode = '22023'; end if;
  if state = 'none' then
    delete from public.family_parts where child_id = ch and surah = s;
  elsif state in ('learning', 'learned') then
    insert into public.family_parts (child_id, circle_id, surah, status) values (ch, c, s, state)
      on conflict (child_id, surah) do update set status = excluded.status, at = now();
  else
    raise exception 'Unknown state' using errcode = '22023';
  end if;
end $$;

-- A short du'a note for a child from any member (optionally for one surah); 3 a day per author.
create or replace function public.leave_note(ch uuid, s int, note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.require_account();
  c uuid;
  who text;
  n uuid;
begin
  select circle_id into c from public.circle_children where id = ch;
  if c is null then raise exception 'Not in this family circle' using errcode = '42501'; end if;
  perform public.family_member(c);
  if s is not null and not public.kids_surah(s) then raise exception 'Not one of the short surahs' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(note, ''))) not between 1 and 140 then
    raise exception 'A note is 1 to 140 characters' using errcode = '22023';
  end if;
  if (select count(*) from public.family_notes where from_id = me and created_at > now() - interval '1 day') >= 3 then
    raise exception 'Up to 3 notes a day — thank you for your kindness';
  end if;
  select name into who from public.circle_members where circle_id = c and user_id = me;
  insert into public.family_notes (circle_id, child_id, surah, from_id, from_name, body)
    values (c, ch, s, me, who, btrim(regexp_replace(note, '[\r\n\t]+', ' ', 'g'))) returning id into n;
  return n;
end $$;

-- Delete a note: its author, or whoever manages the child.
create or replace function public.delete_note(note uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.require_account();
  r record;
begin
  select * into r from public.family_notes where id = note;
  if not found or not public.is_circle_member(r.circle_id) then raise exception 'Note not found' using errcode = 'P0002'; end if;
  if r.from_id <> me then perform public.child_guardian(r.child_id); end if;
  delete from public.family_notes where id = note;
end $$;

-- The child was shown the note (on the parent's device, in the Kids space).
create or replace function public.mark_note_seen(note uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  ch uuid;
begin
  select child_id into ch from public.family_notes where id = note;
  if ch is null then raise exception 'Note not found' using errcode = 'P0002'; end if;
  perform public.child_guardian(ch);
  update public.family_notes set seen_at = coalesce(seen_at, now()) where id = note;
end $$;

revoke all on function public.kids_surah(int) from public, anon;
grant execute on function public.kids_surah(int) to authenticated;
revoke all on function public.family_member(uuid) from public, anon, authenticated;
revoke all on function public.child_guardian(uuid) from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array[
    'create_family_circle(text, text)', 'add_child(uuid, text)', 'rename_child(uuid, text)', 'remove_child(uuid)',
    'set_child_surah(uuid, int, text)', 'leave_note(uuid, int, text)', 'delete_note(uuid)', 'mark_note_seen(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Live updates while a family circle is open.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'family_parts') then
      alter publication supabase_realtime add table public.family_parts, public.family_notes, public.circle_children;
    end if;
  end if;
end $$;
