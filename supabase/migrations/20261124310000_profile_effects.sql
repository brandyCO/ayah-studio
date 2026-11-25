-- Profile effects (owner request 2026-11-24, item restyle batch 2): a scene that plays over a player's profile card, bought
-- with Light in the shop (src/ui/deco/effects.ts, ids 1–12; 0 = none). Kept with the player and shown with their face
-- (rank_face `fx`), never while private or blocked. Like frames, the app checks it owns the effect before setting it.
alter table public.rank_players add column if not exists fx smallint not null default 0;
alter table public.rank_players drop constraint if exists rank_players_fx_check;
alter table public.rank_players add constraint rank_players_fx_check check (fx between 0 and 12);

create or replace function public.rank_face(p public.rank_players, me uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case
    when p.user_id <> me and exists (select 1 from public.rank_blocks b where b.blocker = me and b.blocked = p.user_id)
      then jsonb_build_object('name', null, 'private', false, 'blocked', true, 'avatar', null, 'frame', 0, 'figure', null, 'room', null,
        'tier', p.tier, 'me', false, 'pid', p.pid, 'xp', null, 'lamp', 0, 'flag', null, 'fx', 0)
    when p.private and p.user_id <> me
      then jsonb_build_object('name', null, 'private', true, 'avatar', null, 'frame', 0, 'figure', null, 'room', null, 'tier', p.tier, 'me', false, 'pid', null, 'xp', null, 'lamp', 0, 'flag', null, 'fx', 0)
    else jsonb_build_object('name', p.name, 'avatar', p.avatar, 'frame', p.frame, 'figure', p.figure, 'room', p.room, 'tier', p.tier,
      'me', p.user_id = me, 'pid', p.pid, 'xp', p.total, 'lamp', p.lamp, 'flag', p.flag, 'fx', p.fx) end;
$$;

create or replace function public.rank_set_effect(e int) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.rank_me();
begin
  if not exists (select 1 from public.rank_players where user_id = me) then raise exception 'Not playing yet' using errcode = '22023'; end if;
  if e is null or e not between 0 and 12 then raise exception 'No such effect' using errcode = '22023'; end if;
  update public.rank_players set fx = e where user_id = me;
end $$;

revoke all on function public.rank_set_effect(int) from public, anon;
grant execute on function public.rank_set_effect(int) to authenticated;
