-- Invite a friend, both get Light (owner decision 2026-11-13, marketing plan action 3).
-- A new player (in Ranks for at most 7 days) who joins through a friend's invite link (rank_friend_join) is
-- recorded once as invited by that friend. Once the new player has had 3 days with points since joining, each
-- side can claim 50 Light once. An inviter is rewarded for at most 20 friends. Light stays the only reward.

create table if not exists public.rank_invites (
  invitee uuid primary key references auth.users (id) on delete cascade,
  inviter uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now(),
  inviter_claimed_at timestamptz,
  invitee_claimed_at timestamptz,
  check (invitee <> inviter)
);
create index if not exists rank_invites_inviter on public.rank_invites (inviter);
alter table public.rank_invites enable row level security;
revoke all on table public.rank_invites from anon, authenticated;

create or replace function public.rank_friend_join(code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  p public.rank_players;
begin
  select * into p from public.rank_players where invite = lower(code);
  if p.user_id is null then raise exception 'No such invite' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.rank_players where user_id = me) then raise exception 'Not playing yet' using errcode = '22023'; end if;
  perform public.rank_make_friends(me, p.user_id);
  if p.user_id <> me and exists (select 1 from public.rank_players where user_id = me and created_at > now() - interval '7 days') then
    insert into public.rank_invites (invitee, inviter) values (me, p.user_id) on conflict do nothing;
  end if;
  return public.rank_face(p, me);
end $$;

-- Days with points since the invite (the invitee's own days).
create or replace function public.rank_invite_days(who uuid, since timestamptz) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.rank_days where user_id = who and score > 0 and day >= (since at time zone 'utc')::date - 1;
$$;

-- What is waiting for me: as the invited friend, and for each friend I invited (with their progress to 3 days).
create or replace function public.rank_my_invites() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := public.rank_me();
begin
  return jsonb_build_object(
    'light', 50, 'days', 3, 'cap', 20,
    'rewarded', (select count(*) from public.rank_invites where inviter = me and inviter_claimed_at is not null),
    'invitedBy', (select jsonb_build_object('name', p.name, 'days', least(3, public.rank_invite_days(me, i.at)),
        'claimed', i.invitee_claimed_at is not null)
      from public.rank_invites i join public.rank_players p on p.user_id = i.inviter where i.invitee = me),
    'friends', (select coalesce(jsonb_agg(jsonb_build_object('pid', p.pid, 'name', case when p.private then null else p.name end,
        'days', least(3, public.rank_invite_days(i.invitee, i.at)), 'claimed', i.inviter_claimed_at is not null) order by i.at desc), '[]'::jsonb)
      from public.rank_invites i join public.rank_players p on p.user_id = i.invitee where i.inviter = me));
end $$;

-- Claim once: pid = the invited friend (as inviter), or null (as the invited one). Returns the Light, or null.
create or replace function public.rank_claim_invite(who text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  them uuid;
  i public.rank_invites;
begin
  if who is null then
    select * into i from public.rank_invites where invitee = me for update;
    if not found or i.invitee_claimed_at is not null or public.rank_invite_days(me, i.at) < 3 then return null; end if;
    update public.rank_invites set invitee_claimed_at = now() where invitee = me;
    return jsonb_build_object('light', 50, 'id', 'me');
  end if;
  them := public.rank_by_pid(who);
  select * into i from public.rank_invites where invitee = them and inviter = me for update;
  if not found or i.inviter_claimed_at is not null or public.rank_invite_days(them, i.at) < 3 then return null; end if;
  if (select count(*) from public.rank_invites where inviter = me and inviter_claimed_at is not null) >= 20 then return null; end if;
  update public.rank_invites set inviter_claimed_at = now() where invitee = them;
  return jsonb_build_object('light', 50, 'id', who);
end $$;

revoke all on function public.rank_invite_days(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.rank_my_invites() from public, anon;
revoke all on function public.rank_claim_invite(text) from public, anon;
grant execute on function public.rank_my_invites(), public.rank_claim_invite(text) to authenticated;
