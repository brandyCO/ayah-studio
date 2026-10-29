-- M4 Relight a friend's flame (Me tab, CLAUDE.md Phase 8): when a daily streak goes out, its owner
-- (signed in with Google) asks for a relight and shares the link; a friend signed in with another
-- account opens it within 48 hours and relights it, once. The app then covers the missed days
-- (on the owner's device). Stored: the owner's first name, the streak length and the missed days —
-- nothing about reading. Nobody reads the table directly; only the functions below.

create table if not exists public.relights (
  id text primary key check (char_length(id) = 10),
  owner_id uuid not null references auth.users (id) on delete cascade,
  owner_name text not null check (char_length(owner_name) between 1 and 40),
  streak int not null check (streak between 2 and 5000),
  missed date[] not null check (cardinality(missed) between 1 and 3),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '48 hours',
  helper_id uuid references auth.users (id) on delete set null,
  helper_name text check (char_length(helper_name) <= 40),
  relit_at timestamptz,
  seen boolean not null default false
);
create index if not exists relights_owner on public.relights (owner_id, created_at desc);
create index if not exists relights_helper on public.relights (helper_id, relit_at);

alter table public.relights enable row level security;
revoke all on table public.relights from anon, authenticated;

-- Ask for a relight: returns the code for the link. 3 asks a week.
create or replace function public.ask_relight(my_name text, streak_days int, missed_days date[])
returns text language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  anon boolean := coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
  code text;
  d date;
begin
  if me is null or anon then raise exception 'Sign in with Google to ask a friend' using errcode = '42501'; end if;
  if public.clean_name(my_name, 40) is null then raise exception 'A name is needed' using errcode = '22023'; end if;
  if streak_days is null or streak_days not between 2 and 5000 then raise exception 'Not a streak' using errcode = '22023'; end if;
  if missed_days is null or cardinality(missed_days) not between 1 and 3 then
    raise exception 'A friend can relight a flame that went out up to 3 days ago' using errcode = '22023';
  end if;
  foreach d in array missed_days loop
    if d is null or d < current_date - 4 or d > current_date + 1 then raise exception 'Not a missed day' using errcode = '22023'; end if;
  end loop;
  if (select count(*) from public.relights where owner_id = me and created_at > now() - interval '7 days') >= 3 then
    raise exception 'You can ask for a relight 3 times a week';
  end if;
  loop
    select string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', 1 + get_byte(b, i) % 31, 1), '' order by i) into code
      from (select decode(replace(gen_random_uuid()::text, '-', ''), 'hex') b) u,
           unnest(array[0, 1, 2, 3, 4, 5, 7, 9, 10, 11]) i;
    exit when not exists (select 1 from public.relights where id = code);
  end loop;
  insert into public.relights (id, owner_id, owner_name, streak, missed)
    values (code, me, public.clean_name(my_name, 40), streak_days, missed_days);
  return code;
end $$;

-- What a link shows (anyone, signed out too): the name, the streak, and whether it can still be relit.
create or replace function public.relight_preview(code text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'name', r.owner_name, 'streak', r.streak,
    'state', case when r.relit_at is not null then 'relit' when r.expires_at < now() then 'expired' else 'open' end,
    'mine', r.owner_id = auth.uid(),
    'helper', r.helper_name)
  from public.relights r where r.id = code;
$$;

-- Relight it: a different Google account, within 48 hours, once. 10 relights a day per helper.
create or replace function public.give_relight(code text, my_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  anon boolean := coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
  r public.relights;
begin
  if me is null or anon then raise exception 'Sign in with Google to relight a flame' using errcode = '42501'; end if;
  select * into r from public.relights where id = code for update;
  if not found then raise exception 'This link is not valid' using errcode = 'P0002'; end if;
  if r.owner_id = me then raise exception 'A friend has to relight it, not you' using errcode = '42501'; end if;
  if r.relit_at is not null then raise exception 'Someone already relit this flame' using errcode = '23505'; end if;
  if r.expires_at < now() then raise exception 'This flame can no longer be relit' using errcode = '22023'; end if;
  if (select count(*) from public.relights where helper_id = me and relit_at > now() - interval '1 day') >= 10 then
    raise exception 'That is a lot of relights for one day — please try again tomorrow';
  end if;
  update public.relights set helper_id = me, helper_name = public.clean_name(my_name, 40), relit_at = now() where id = code;
end $$;

-- The owner's asks that were relit and not yet taken into the app (the app then covers the days).
create or replace function public.take_relights()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  res jsonb;
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'missed', missed, 'helper', helper_name, 'streak', streak) order by relit_at), '[]'::jsonb)
    into res from public.relights where owner_id = me and relit_at is not null and not seen;
  update public.relights set seen = true where owner_id = me and relit_at is not null and not seen;
  return res;
end $$;

revoke all on function public.ask_relight(text, int, date[]) from public, anon;
grant execute on function public.ask_relight(text, int, date[]) to authenticated;
revoke all on function public.relight_preview(text) from public;
grant execute on function public.relight_preview(text) to anon, authenticated;
revoke all on function public.give_relight(text, text) from public, anon;
grant execute on function public.give_relight(text, text) to authenticated;
revoke all on function public.take_relights() from public, anon;
grant execute on function public.take_relights() to authenticated;
