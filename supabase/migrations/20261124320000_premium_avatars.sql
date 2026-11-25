-- Legendary (52–54) and mythic (55–57) avatars (owner request 2026-11-24, item restyle batch 5): bought with Light like
-- avatars 24–31 (ownership kept by the app, a shop entry); the server only allows the new numbers.
create or replace function public.rank_set_look(my_avatar int, is_private boolean, my_frame int default 0) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  bt smallint;
  best smallint;
  wins int;
  f int := coalesce(my_frame, 0);
begin
  select best_tier into bt from public.rank_players where user_id = me;
  if not found then raise exception 'Not playing yet' using errcode = '22023'; end if;
  if my_avatar is null or my_avatar not between 0 and 57 or f not between 0 and 37 then
    raise exception 'No such avatar or frame' using errcode = '22023';
  end if;
  select min(place), count(*) filter (where place = 1) into best, wins from public.rank_prizes where user_id = me;
  if ((my_avatar between 32 and 35 or f = 4) and bt < 4)
    or (f between 5 and 7 and coalesce(best, 9) > f - 4)
    or (my_avatar between 36 and 39 and wins < (array[1, 3, 5, 10])[my_avatar - 35])
    or (my_avatar between 40 and 51 and not exists (select 1 from public.rank_prizes where user_id = me and item = 'av:' || my_avatar))
    or (f between 8 and 13 and not exists (select 1 from public.rank_prizes where user_id = me and item = 'fr:' || f)) then
    raise exception 'Not won yet' using errcode = '42501';
  end if;
  update public.rank_players set avatar = my_avatar, private = coalesce(is_private, false), frame = f where user_id = me;
end $$;

alter table public.rank_players drop constraint if exists rank_players_avatar_check;
alter table public.rank_players add constraint rank_players_avatar_check check (avatar between 0 and 57);
