-- Characters, round 5 (owner request 2026-11-11: richer faces, hair, clothes from around the Ummah, accessories):
-- a character code is now 14 base-36 digits as before, or 22 when one of the 8 new parts is set (src/ui/figure.ts).
-- The server still checks only the format and the prize parts, whose positions are unchanged.
alter table public.rank_players drop constraint if exists rank_players_figure_check;
alter table public.rank_players add constraint rank_players_figure_check check (figure is null or figure ~ '^[0-9a-z]{14}([0-9a-z]{8})?$');

create or replace function public.rank_set_figure(code text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  pc text;
  pos int;
begin
  if not exists (select 1 from public.rank_players where user_id = me) then raise exception 'Not playing yet' using errcode = '22023'; end if;
  if code is not null and code !~ '^[0-9a-z]{14}([0-9a-z]{8})?$' then raise exception 'No such character' using errcode = '22023'; end if;
  if code is not null and substr(code, 9, 1) = '6'
    and not exists (select 1 from public.rank_prizes where user_id = me and place = 1) then
    raise exception 'Not won yet' using errcode = '42501';
  end if;
  -- Prize pieces: only for those who won them.
  if code is not null then
    foreach pc in array array['outfit:7', 'hold:6', 'glasses:3', 'bg:8', 'hold:7', 'bg:9'] loop
      pos := case split_part(pc, ':', 1) when 'outfit' then 9 when 'glasses' then 11 when 'hold' then 12 when 'bg' then 14 end;
      if substr(code, pos, 1) = split_part(pc, ':', 2)
        and not exists (select 1 from public.rank_prizes where user_id = me and piece = pc) then
        raise exception 'Not won yet' using errcode = '42501';
      end if;
    end loop;
  end if;
  update public.rank_players set figure = code where user_id = me;
end $$;

revoke all on function public.rank_set_figure(text) from public, anon;
grant execute on function public.rank_set_figure(text) to authenticated;
