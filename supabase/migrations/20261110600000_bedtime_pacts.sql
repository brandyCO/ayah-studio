-- Bedtime pact (owner pick 2026-11-10, du'a moments step 6): family or friends (2–6) agree to say the
-- bedtime du'a for 7 nights together. A shared goal, never a ranking: each member's nights show as
-- crescents, nobody is ordered or scored. The 7 nights start on the day it is made; others can join
-- by its link until the third night. Each member marks their own night after the bedtime du'a in the
-- app (worship is between the person and Allah; the app only keeps the promise visible). When it is
-- over (two days after the last night, for every time zone) each member claims Light once: 5 a night
-- they kept, +50 when everyone kept all 7. Google accounts who joined the ranks only; nobody reads the
-- tables directly.

create table if not exists public.pacts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  owner uuid not null references auth.users (id) on delete cascade,
  start date not null,
  created_at timestamptz not null default now()
);
create table if not exists public.pact_members (
  pact uuid not null references public.pacts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  claimed boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (pact, user_id)
);
create table if not exists public.pact_nights (
  pact uuid not null references public.pacts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  primary key (pact, user_id, day)
);
create index if not exists pact_members_user on public.pact_members (user_id);
alter table public.pacts enable row level security;
alter table public.pact_members enable row level security;
alter table public.pact_nights enable row level security;
revoke all on table public.pacts, public.pact_members, public.pact_nights from anon, authenticated;

create or replace function public.pact_joinable(me uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.rank_players where user_id = me) then
    raise exception 'Read or listen once to join the ranks first' using errcode = '22023';
  end if;
  if (select count(*) from public.pact_members m join public.pacts p on p.id = m.pact
      where m.user_id = me and p.start >= current_date - 8) >= 3 then
    raise exception 'You are in 3 pacts already' using errcode = '22023';
  end if;
end $$;

-- A new pact: its 7 nights start on the maker's day `d`.
create or replace function public.pact_create(d date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  c text;
  i uuid;
begin
  perform public.rank_check_day(d);
  perform public.pact_joinable(me);
  loop
    select string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', 1 + get_byte(x, k) % 31, 1), '' order by k) into c
      from (select decode(replace(gen_random_uuid()::text, '-', ''), 'hex') x) u, generate_series(0, 7) k;
    exit when not exists (select 1 from public.pacts where code = c);
  end loop;
  insert into public.pacts (code, owner, start) values (c, me, d) returning id into i;
  insert into public.pact_members (pact, user_id) values (i, me);
  return jsonb_build_object('id', i, 'code', c);
end $$;

-- What an invite shows (visitors too).
create or replace function public.pact_preview(p_code text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'from', public.rank_face(o, coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)),
    'members', (select count(*) from public.pact_members m where m.pact = p.id),
    'open', current_date <= p.start + 2 and (select count(*) from public.pact_members m where m.pact = p.id) < 6,
    'joined', exists (select 1 from public.pact_members m where m.pact = p.id and m.user_id = auth.uid()))
  from public.pacts p join public.rank_players o on o.user_id = p.owner
  where p.code = lower(p_code);
$$;

create or replace function public.pact_join(p_code text, d date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  r public.pacts;
begin
  perform public.rank_check_day(d);
  select * into r from public.pacts where code = lower(p_code) for update;
  if not found then raise exception 'This pact is not valid' using errcode = 'P0002'; end if;
  if exists (select 1 from public.pact_members where pact = r.id and user_id = me) then return r.id; end if;
  if d > r.start + 2 then raise exception 'This pact has started without you' using errcode = '22023'; end if;
  if (select count(*) from public.pact_members where pact = r.id) >= 6 then
    raise exception 'This pact is full' using errcode = '22023';
  end if;
  perform public.pact_joinable(me);
  insert into public.pact_members (pact, user_id) values (r.id, me);
  return r.id;
end $$;

-- Tonight's bedtime du'a were said: marks night `d` in each of my pacts running then.
create or replace function public.pact_mark(d date) returns int
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  n int;
begin
  perform public.rank_check_day(d);
  insert into public.pact_nights (pact, user_id, day)
    select m.pact, me, d from public.pact_members m join public.pacts p on p.id = m.pact
    where m.user_id = me and d between p.start and p.start + 6
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- My pacts (running and over in the last 4 weeks), newest first; each member with their nights.
create or replace function public.my_pacts(d date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := public.rank_me();
begin
  perform public.rank_check_day(d);
  return coalesce((
    select jsonb_agg(x order by start desc) from (
      select p.start, jsonb_build_object(
        'id', p.id, 'start', p.start, 'end', p.start + 6,
        'code', case when d <= p.start + 2 then p.code end,
        'night', least(8, greatest(1, d - p.start + 1)),
        'over', current_date > p.start + 7,
        'claimed', (select claimed from public.pact_members where pact = p.id and user_id = me),
        'members', (select jsonb_agg(jsonb_build_object('face', public.rank_face(o, me),
            'nights', (select coalesce(jsonb_agg(n.day - p.start + 1 order by n.day), '[]'::jsonb) from public.pact_nights n where n.pact = p.id and n.user_id = m.user_id))
            order by m.joined_at)
          from public.pact_members m join public.rank_players o on o.user_id = m.user_id where m.pact = p.id)) x
      from public.pacts p join public.pact_members mm on mm.pact = p.id and mm.user_id = me
      where p.start >= d - 28
      order by p.start desc limit 10) y), '[]'::jsonb);
end $$;

-- Once it is over: the Light, once for each member (null when claimed already or not over).
create or replace function public.pact_claim(pid uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  r public.pacts;
  kept int;
  everyone boolean;
begin
  select p.* into r from public.pacts p join public.pact_members m on m.pact = p.id and m.user_id = me where p.id = pid;
  if not found or current_date <= r.start + 7 then return null; end if;
  update public.pact_members set claimed = true where pact = pid and user_id = me and not claimed;
  if not found then return null; end if;
  kept := (select count(*) from public.pact_nights where pact = pid and user_id = me);
  everyone := (select bool_and((select count(*) from public.pact_nights n where n.pact = pid and n.user_id = m.user_id) >= 7)
    from public.pact_members m where m.pact = pid) and (select count(*) from public.pact_members where pact = pid) >= 2;
  return jsonb_build_object('kept', kept, 'everyone', everyone, 'light', kept * 5 + case when everyone then 50 else 0 end);
end $$;

-- Leave a pact (the last one out deletes it).
create or replace function public.pact_leave(pid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.rank_me();
begin
  delete from public.pact_members where pact = pid and user_id = me;
  delete from public.pacts p where p.id = pid and not exists (select 1 from public.pact_members m where m.pact = p.id);
end $$;

revoke all on function public.pact_joinable(uuid) from public, anon, authenticated;
revoke all on function public.pact_create(date) from public, anon;
revoke all on function public.pact_preview(text) from public;
revoke all on function public.pact_join(text, date) from public, anon;
revoke all on function public.pact_mark(date) from public, anon;
revoke all on function public.my_pacts(date) from public, anon;
revoke all on function public.pact_claim(uuid) from public, anon;
revoke all on function public.pact_leave(uuid) from public, anon;
grant execute on function public.pact_create(date) to authenticated;
grant execute on function public.pact_preview(text) to anon, authenticated;
grant execute on function public.pact_join(text, date) to authenticated;
grant execute on function public.pact_mark(date) to authenticated;
grant execute on function public.my_pacts(date) to authenticated;
grant execute on function public.pact_claim(uuid) to authenticated;
grant execute on function public.pact_leave(uuid) to authenticated;
