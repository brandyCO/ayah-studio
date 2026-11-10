-- Characters (owner request 2026-11-10): a player can wear a character made in the builder instead of an
-- avatar disc. It is 14 base-36 digits, one per part (src/ui/figure.ts); the app draws it, the server only
-- keeps it, checks the format and the champion's outfit (part 9 = '6'), which needs a week won at #1.
alter table public.rank_players add column if not exists figure text;
alter table public.rank_players drop constraint if exists rank_players_figure_check;
alter table public.rank_players add constraint rank_players_figure_check check (figure is null or figure ~ '^[0-9a-z]{14}$');

create or replace function public.rank_face(p public.rank_players, me uuid) returns jsonb
language sql immutable set search_path = '' as $$
  select case when p.private and p.user_id <> me
    then jsonb_build_object('name', null, 'private', true, 'avatar', null, 'frame', 0, 'figure', null, 'tier', p.tier, 'me', false)
    else jsonb_build_object('name', p.name, 'avatar', p.avatar, 'frame', p.frame, 'figure', p.figure, 'tier', p.tier, 'me', p.user_id = me) end;
$$;

create or replace function public.rank_set_figure(code text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.rank_me();
begin
  if not exists (select 1 from public.rank_players where user_id = me) then raise exception 'Not playing yet' using errcode = '22023'; end if;
  if code is not null and code !~ '^[0-9a-z]{14}$' then raise exception 'No such character' using errcode = '22023'; end if;
  if code is not null and substr(code, 9, 1) = '6'
    and not exists (select 1 from public.rank_prizes where user_id = me and place = 1) then
    raise exception 'Not won yet' using errcode = '42501';
  end if;
  update public.rank_players set figure = code where user_id = me;
end $$;

create or replace function public.rank_my_figure() returns text
language sql stable security definer set search_path = '' as $$
  select figure from public.rank_players where user_id = auth.uid();
$$;

revoke all on function public.rank_set_figure(text) from public, anon;
revoke all on function public.rank_my_figure() from public, anon;
grant execute on function public.rank_set_figure(text) to authenticated;
grant execute on function public.rank_my_figure() to authenticated;
