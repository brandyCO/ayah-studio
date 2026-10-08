-- T0 (docs/together.md): personal data synced between a user's devices.
-- One row per synced item: drafts, bookmarks, reading state, settings, day summaries (later also
-- reflections and lamps). The app keeps everything on the device first and mirrors it here when
-- the user is signed in with Google. Quran text is never stored here — only references.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text check (char_length(name) <= 80),
  avatar_url text check (char_length(avatar_url) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_docs (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('draft', 'bookmark', 'state', 'setting', 'day', 'reflection', 'lamp')),
  id text not null check (char_length(id) between 1 and 64),
  data jsonb not null default '{}'::jsonb check (pg_column_size(data) <= 512000),
  deleted boolean not null default false,
  device_id text check (char_length(device_id) <= 64),
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, id)
);

-- Pulling changes since the last sync.
create index if not exists user_docs_user_updated on public.user_docs (user_id, updated_at);

-- The server sets the time of every write, so "changed since" never depends on device clocks.
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists user_docs_touch on public.user_docs;
create trigger user_docs_touch before insert or update on public.user_docs
  for each row execute function public.touch_updated_at();
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before insert or update on public.profiles
  for each row execute function public.touch_updated_at();

-- At most 3000 items per person (abuse guard; a heavy user has a few hundred).
create or replace function public.user_docs_limit() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.user_docs where user_id = new.user_id) >= 3000 then
    raise exception 'Too many synced items for this account';
  end if;
  return new;
end $$;

drop trigger if exists user_docs_limit on public.user_docs;
create trigger user_docs_limit before insert on public.user_docs
  for each row execute function public.user_docs_limit();

-- Row-level security: each person sees and changes only their own rows. Anonymous sessions (used
-- later for gift replies and wall guests) cannot sync personal data.
alter table public.profiles enable row level security;
alter table public.user_docs enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for all to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "own docs" on public.user_docs;
create policy "own docs" on public.user_docs for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );

-- A profile row for every new account, filled from the Google account (name, picture).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name, avatar_url)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), 80),
    left(new.raw_user_meta_data ->> 'avatar_url', 500)
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- "Delete my account" (☰ → Account): removes the user and, through the foreign keys, all their data.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end $$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
