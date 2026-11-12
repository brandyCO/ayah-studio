-- The lamp wall (owner request 2026-11-12, "a sadaqa lamp wall"): a player spends Light to light a lamp on one shared
-- wall for someone who passed away: a first name (≤ 24), him / her and one of four du'as written by the app (never free
-- text). The giver stays hidden unless they choose to show their name (and never while private). Light is spent on the
-- device (a purchase `lw:{id}`), like gifts. ≤ 3 lamps a day; three reports from different players hide a lamp; the
-- giver can take their own lamp down. Others say Ameen under a lamp (counted once each). Nobody reads or writes the tables directly.
create table if not exists public.rank_lamps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  for_name text not null check (char_length(for_name) between 1 and 24),
  he boolean not null,
  dua smallint not null check (dua between 0 and 3),
  light smallint not null check (light in (50, 100, 250)),
  show_name boolean not null default false,
  hidden boolean not null default false,
  at timestamptz not null default now()
);
create index if not exists rank_lamps_at on public.rank_lamps (at desc) where not hidden;
create index if not exists rank_lamps_user on public.rank_lamps (user_id, at desc);
create table if not exists public.rank_lamp_reports (
  lamp uuid not null references public.rank_lamps (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (lamp, user_id)
);
-- "Ameen" said under a lamp, once per player.
create table if not exists public.rank_lamp_ameens (
  lamp uuid not null references public.rank_lamps (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (lamp, user_id)
);
alter table public.rank_lamp_ameens enable row level security;
alter table public.rank_lamps enable row level security;
alter table public.rank_lamp_reports enable row level security;
revoke all on public.rank_lamps, public.rank_lamp_reports, public.rank_lamp_ameens from public, anon, authenticated;

create or replace function public.rank_lamp_light(for_name text, he boolean, dua int, amount int, show_name boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  nm text := btrim(regexp_replace(coalesce(for_name, ''), '\s+', ' ', 'g'));
  out uuid;
begin
  if not exists (select 1 from public.rank_players where user_id = me) then
    raise exception 'Read or listen once to join the ranks first' using errcode = '42501';
  end if;
  if char_length(nm) < 1 or char_length(nm) > 24 or nm ~ '[0-9@/\\:<>#_=+*&%$!?|{}\[\]~^]' or nm ~* '(www|http|\.com|\.net|\.org)' then
    raise exception 'Write only a first name' using errcode = '22023';
  end if;
  if (select count(*) from public.rank_lamps l where l.user_id = me and l.at > now() - interval '1 day') >= 3 then
    raise exception 'You have lit 3 lamps today. Try again tomorrow.' using errcode = '22023';
  end if;
  insert into public.rank_lamps (user_id, for_name, he, dua, light, show_name)
    values (me, nm, coalesce(he, true), coalesce(dua, 0), amount, coalesce(show_name, false))
    returning id into out;
  return out;
exception when check_violation then
  raise exception 'That lamp cannot be lit' using errcode = '22023';
end $$;

-- The wall: the newest lamps (≤ 120), this week's and all-time counts. The giver's name only when they chose to show it.
create or replace function public.rank_lamp_wall(lim int default 80) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'total', (select count(*) from public.rank_lamps where not hidden),
    'week', (select count(*) from public.rank_lamps where not hidden and at > now() - interval '7 days'),
    'mine', (select count(*) from public.rank_lamps where user_id = public.rank_me()),
    'lamps', coalesce((select jsonb_agg(x order by x.at desc) from (
      select l.id, l.for_name as "for", l.he, l.dua, l.light, l.at, l.user_id = public.rank_me() as me,
        case when l.show_name and not p.private then p.name end as "by",
        (select count(*) from public.rank_lamp_ameens a where a.lamp = l.id) as ameen,
        exists (select 1 from public.rank_lamp_ameens a where a.lamp = l.id and a.user_id = public.rank_me()) as said
      from public.rank_lamps l left join public.rank_players p on p.user_id = l.user_id
      where not l.hidden
      order by l.at desc
      limit greatest(1, least(coalesce(lim, 80), 120))) x), '[]'::jsonb));
$$;

-- Says Ameen under a lamp (once); returns the lamp's count.
create or replace function public.rank_lamp_ameen(lamp uuid) returns int
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.rank_lamps l where l.id = lamp and not l.hidden) then return 0; end if;
  insert into public.rank_lamp_ameens (lamp, user_id) values (lamp, public.rank_me()) on conflict do nothing;
  return (select count(*) from public.rank_lamp_ameens a where a.lamp = rank_lamp_ameen.lamp);
end $$;

-- The giver takes their own lamp down.
create or replace function public.rank_lamp_remove(lamp uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.rank_lamps where id = lamp and user_id = public.rank_me();
$$;

-- A report; three from different players hide the lamp. Your own lamp cannot be reported.
create or replace function public.rank_lamp_report(lamp uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.rank_me();
begin
  if not exists (select 1 from public.rank_lamps where id = lamp and user_id <> me) then return; end if;
  insert into public.rank_lamp_reports (lamp, user_id) values (lamp, me) on conflict do nothing;
  update public.rank_lamps set hidden = true
    where id = lamp and (select count(*) from public.rank_lamp_reports r where r.lamp = rank_lamp_report.lamp) >= 3;
end $$;

revoke all on function public.rank_lamp_light(text, boolean, int, int, boolean), public.rank_lamp_wall(int),
  public.rank_lamp_remove(uuid), public.rank_lamp_report(uuid), public.rank_lamp_ameen(uuid) from public, anon;
grant execute on function public.rank_lamp_light(text, boolean, int, int, boolean), public.rank_lamp_wall(int),
  public.rank_lamp_remove(uuid), public.rank_lamp_report(uuid), public.rank_lamp_ameen(uuid) to authenticated;
