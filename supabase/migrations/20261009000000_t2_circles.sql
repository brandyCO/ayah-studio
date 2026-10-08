-- T2 Khatm circles (docs/together.md): a group reads the whole Quran together, one juz each.
-- Members see the circle, its members and the 30 parts; nobody writes these tables directly — every
-- change goes through the functions below, which check membership and the rules. Completion is set
-- by a trigger, exactly once per round. Only names (user text, length-limited) and juz numbers are
-- stored — never Quran text.

create table if not exists public.circles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  owner_id uuid not null references auth.users (id) on delete cascade,
  invite_code text not null unique check (invite_code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  round int not null default 1 check (round between 1 and 1000),
  status text not null default 'open' check (status in ('open', 'complete')),
  due_date date,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.circle_members (
  circle_id uuid not null references public.circles (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  color smallint not null check (color between 0 and 11),
  joined_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);
create index if not exists circle_members_user on public.circle_members (user_id);

create table if not exists public.circle_parts (
  circle_id uuid not null references public.circles (id) on delete cascade,
  round int not null,
  juz smallint not null check (juz between 1 and 30),
  user_id uuid references auth.users (id) on delete set null,
  status text not null default 'free' check (status in ('free', 'taken', 'done')),
  taken_at timestamptz,
  done_at timestamptz,
  primary key (circle_id, round, juz),
  check ((status = 'free') = (user_id is null))
);

-- Membership check used by the policies (security definer: no recursion through RLS).
create or replace function public.is_circle_member(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.circle_members m where m.circle_id = c and m.user_id = auth.uid());
$$;
revoke all on function public.is_circle_member(uuid) from public, anon;
grant execute on function public.is_circle_member(uuid) to authenticated;

alter table public.circles enable row level security;
alter table public.circle_members enable row level security;
alter table public.circle_parts enable row level security;

drop policy if exists "members read circles" on public.circles;
create policy "members read circles" on public.circles for select to authenticated
  using ((select public.is_circle_member(id)));
drop policy if exists "members read members" on public.circle_members;
create policy "members read members" on public.circle_members for select to authenticated
  using ((select public.is_circle_member(circle_id)));
drop policy if exists "members read parts" on public.circle_parts;
create policy "members read parts" on public.circle_parts for select to authenticated
  using ((select public.is_circle_member(circle_id)));
-- (no insert/update/delete policies: changes only through the functions below)

-- Signed in with a real account (not an anonymous session).
create or replace function public.require_account() returns uuid
language plpgsql stable set search_path = '' as $$
begin
  if auth.uid() is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Sign in to use circles' using errcode = '42501';
  end if;
  return auth.uid();
end $$;

create or replace function public.clean_name(n text, max int) returns text
language sql immutable set search_path = '' as $$
  select nullif(left(btrim(regexp_replace(coalesce(n, ''), '\s+', ' ', 'g')), max), '');
$$;

-- Create a circle: the creator becomes its first member; 30 free parts.
create or replace function public.create_circle(circle_name text, member_name text, due date default null)
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
  insert into public.circles (name, owner_id, invite_code, due_date)
    values (public.clean_name(circle_name, 60), me, code, due) returning id into c;
  insert into public.circle_members (circle_id, user_id, name, color) values (c, me, public.clean_name(member_name, 40), 0);
  insert into public.circle_parts (circle_id, round, juz) select c, 1, g from generate_series(1, 30) g;
  return c;
end $$;

-- Join with an invite code (idempotent: joining again only updates the name).
create or replace function public.join_circle(code text, member_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.require_account();
  c uuid;
  n int;
begin
  select id into c from public.circles where invite_code = upper(btrim(code));
  if c is null then
    raise exception 'This invite link is not valid any more' using errcode = 'P0002';
  end if;
  if public.clean_name(member_name, 40) is null then
    raise exception 'A name is needed' using errcode = '22023';
  end if;
  if exists (select 1 from public.circle_members where circle_id = c and user_id = me) then
    update public.circle_members set name = public.clean_name(member_name, 40) where circle_id = c and user_id = me;
    return c;
  end if;
  if (select count(*) from public.circle_members where user_id = me) >= 20 then
    raise exception 'You can be in up to 20 circles';
  end if;
  select count(*) into n from public.circle_members where circle_id = c;
  if n >= 60 then
    raise exception 'This circle is full (60 members)';
  end if;
  insert into public.circle_members (circle_id, user_id, name, color) values (c, me, public.clean_name(member_name, 40), n % 12);
  return c;
end $$;

-- Take a free juz of the current round (juz = null: pick a free one at random).
create or replace function public.take_part(c uuid, j int default null)
returns int language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.require_account();
  r int;
begin
  if not public.is_circle_member(c) then raise exception 'Not in this circle' using errcode = '42501'; end if;
  select round into r from public.circles where id = c and status = 'open';
  if r is null then raise exception 'This round is complete'; end if;
  if j is null then
    select juz into j from public.circle_parts where circle_id = c and round = r and status = 'free' order by random() limit 1;
    if j is null then raise exception 'Every juz is taken'; end if;
  end if;
  update public.circle_parts set user_id = me, status = 'taken', taken_at = now(), done_at = null
    where circle_id = c and round = r and juz = j and status = 'free';
  if not found then raise exception 'Someone has just taken this juz'; end if;
  return j;
end $$;

-- Mark your juz as finished (done = true) or not finished yet, or give it back (release).
create or replace function public.set_part(c uuid, j int, state text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.require_account();
  r int;
begin
  if state not in ('taken', 'done', 'free') then raise exception 'Unknown state' using errcode = '22023'; end if;
  select round into r from public.circles where id = c;
  update public.circle_parts set
      status = state,
      user_id = case when state = 'free' then null else user_id end,
      taken_at = case when state = 'free' then null else taken_at end,
      done_at = case when state = 'done' then now() else null end
    where circle_id = c and round = r and juz = j and user_id = me
      and (state <> 'free' or status = 'taken') -- a finished juz is not given back
      and exists (select 1 from public.circles where id = c and status = 'open');
  if not found then raise exception 'This is not your juz, or the round is complete' using errcode = '42501'; end if;
end $$;

-- The round is complete when all 30 parts are done: set once, by the database, never by clients.
create or replace function public.circle_part_done() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'done' and not exists (
    select 1 from public.circle_parts where circle_id = new.circle_id and round = new.round and status <> 'done'
  ) then
    update public.circles set status = 'complete', completed_at = now()
      where id = new.circle_id and round = new.round and status = 'open';
  end if;
  return null;
end $$;
drop trigger if exists circle_part_done on public.circle_parts;
create trigger circle_part_done after update of status on public.circle_parts
  for each row when (new.status = 'done') execute function public.circle_part_done();

-- Owner: start another round (same members, all parts free again).
create or replace function public.new_round(c uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.require_account();
  r int;
begin
  update public.circles set round = round + 1, status = 'open', completed_at = null
    where id = c and owner_id = me and status = 'complete' returning round into r;
  if r is null then raise exception 'Only the owner can start a new round, after the Khatm' using errcode = '42501'; end if;
  insert into public.circle_parts (circle_id, round, juz) select c, r, g from generate_series(1, 30) g;
  delete from public.circle_parts where circle_id = c and round < r - 1; -- keep the last finished round only
  return r;
end $$;

-- Owner: rename, change the due date.
create or replace function public.update_circle(c uuid, circle_name text, due date)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.require_account();
begin
  if public.clean_name(circle_name, 60) is null then raise exception 'A name is needed' using errcode = '22023'; end if;
  update public.circles set name = public.clean_name(circle_name, 60), due_date = due where id = c and owner_id = me;
  if not found then raise exception 'Only the owner can change the circle' using errcode = '42501'; end if;
end $$;

-- Leave: your unfinished juz becomes free again; finished ones stay finished. The owner leaving hands
-- the circle to the longest-standing member, and the last member leaving deletes the circle.
create or replace function public.leave_circle(c uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.require_account();
  heir uuid;
begin
  delete from public.circle_members where circle_id = c and user_id = me;
  if not found then return; end if;
  update public.circle_parts set user_id = null, status = 'free', taken_at = null
    where circle_id = c and user_id = me and status = 'taken';
  select user_id into heir from public.circle_members where circle_id = c order by joined_at limit 1;
  if heir is null then
    delete from public.circles where id = c;
  else
    update public.circles set owner_id = heir where id = c and owner_id = me;
  end if;
end $$;

-- Owner: delete the circle for everyone.
create or replace function public.delete_circle(c uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.circles where id = c and owner_id = public.require_account();
  if not found then raise exception 'Only the owner can delete the circle' using errcode = '42501'; end if;
end $$;

-- What an invite link shows before joining (name and number of members only).
create or replace function public.circle_preview(code text)
returns table (name text, members int, round int, status text)
language sql stable security definer set search_path = '' as $$
  select c.name, (select count(*)::int from public.circle_members m where m.circle_id = c.id), c.round, c.status
  from public.circles c where c.invite_code = upper(btrim(code));
$$;

revoke all on function public.require_account() from public, anon;
revoke all on function public.clean_name(text, int) from public, anon;
revoke all on function public.circle_part_done() from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array[
    'create_circle(text, text, date)', 'join_circle(text, text)', 'take_part(uuid, int)', 'set_part(uuid, int, text)',
    'new_round(uuid)', 'update_circle(uuid, text, date)', 'leave_circle(uuid)', 'delete_circle(uuid)', 'circle_preview(text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
grant execute on function public.require_account() to authenticated;
grant execute on function public.clean_name(text, int) to authenticated;

-- Live updates while a circle is open (Supabase Realtime respects the select policies above).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'circle_parts') then
      alter publication supabase_realtime add table public.circle_parts, public.circle_members, public.circles;
    end if;
  end if;
end $$;
