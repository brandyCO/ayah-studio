-- Friendly gestures in a friend challenge (owner pick 2026-11-10, "no chat"): each side can send one of five
-- set gestures (0 wave "Salam", 1 "MashaAllah", 2 "Keep going", 3 du'a "May Allah make it easy", 4 "Race you")
-- while the challenge runs, at most 5 a day. No free text, so nothing to moderate. Nobody reads the table.

create table if not exists public.rank_cheers (
  id bigint generated always as identity primary key,
  ch uuid not null references public.rank_challenges (id) on delete cascade,
  sender uuid not null references auth.users (id) on delete cascade,
  kind smallint not null check (kind between 0 and 4),
  at timestamptz not null default now()
);
create index if not exists rank_cheers_ch on public.rank_cheers (ch, at desc);
alter table public.rank_cheers enable row level security;
revoke all on table public.rank_cheers from anon, authenticated;

-- Sends a gesture; returns how many are left today.
create or replace function public.rank_challenge_cheer(ch uuid, kind int) returns int
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  r public.rank_challenges;
  n int;
begin
  if kind is null or kind < 0 or kind > 4 then raise exception 'Unknown gesture' using errcode = '22023'; end if;
  select * into r from public.rank_challenges c where c.id = rank_challenge_cheer.ch and (c.a = me or c.b = me);
  if not found then raise exception 'This challenge is not yours' using errcode = 'P0002'; end if;
  if r.b is null or r.start is null or current_date > r.start + 7 then
    raise exception 'Gestures are for a running challenge' using errcode = '22023';
  end if;
  select count(*) into n from public.rank_cheers x
    where x.ch = r.id and x.sender = me and x.at > now() - interval '1 day';
  if n >= 5 then raise exception 'You can send 5 gestures a day' using errcode = '22023'; end if;
  insert into public.rank_cheers (ch, sender, kind) values (r.id, me, rank_challenge_cheer.kind);
  return 4 - n;
end $$;

-- The gestures of my challenges in the last 3 days, newest first (mine = sent by me).
create or replace function public.rank_challenge_cheers() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := public.rank_me();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('ch', y.ch, 'kind', y.kind, 'at', y.at, 'mine', y.sender = me) order by y.at desc)
    from (select x.ch, x.kind, x.at, x.sender from public.rank_cheers x
      join public.rank_challenges c on c.id = x.ch
      where (c.a = me or c.b = me) and x.at > now() - interval '3 days'
      order by x.at desc limit 40) y), '[]'::jsonb);
end $$;

revoke all on function public.rank_challenge_cheer(uuid, int) from public, anon;
revoke all on function public.rank_challenge_cheers() from public, anon;
grant execute on function public.rank_challenge_cheer(uuid, int) to authenticated;
grant execute on function public.rank_challenge_cheers() to authenticated;
