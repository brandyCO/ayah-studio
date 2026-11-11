-- Visit a friend's room (owner request 2026-11-11, view only): a player's room is a short code of what stands in it
-- (src/data/roomItems.ts: `slot:id` pairs, the best streak, trophy places), kept with the player and shown with
-- their character on the boards. Nothing else about the player is in it; private players show no room.
alter table public.rank_players add column if not exists room text;
alter table public.rank_players drop constraint if exists rank_players_room_check;
alter table public.rank_players add constraint rank_players_room_check check (room is null or room ~ '^[a-z0-9:,]{0,240}$');

create or replace function public.rank_face(p public.rank_players, me uuid) returns jsonb
language sql immutable set search_path = '' as $$
  select case when p.private and p.user_id <> me
    then jsonb_build_object('name', null, 'private', true, 'avatar', null, 'frame', 0, 'figure', null, 'room', null, 'tier', p.tier, 'me', false)
    else jsonb_build_object('name', p.name, 'avatar', p.avatar, 'frame', p.frame, 'figure', p.figure, 'room', p.room, 'tier', p.tier, 'me', p.user_id = me) end;
$$;

create or replace function public.rank_set_room(code text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.rank_me();
begin
  if not exists (select 1 from public.rank_players where user_id = me) then raise exception 'Not playing yet' using errcode = '22023'; end if;
  if code is not null and code !~ '^[a-z0-9:,]{0,240}$' then raise exception 'No such room' using errcode = '22023'; end if;
  update public.rank_players set room = code where user_id = me;
end $$;

revoke all on function public.rank_set_room(text) from public, anon;
grant execute on function public.rank_set_room(text) to authenticated;
