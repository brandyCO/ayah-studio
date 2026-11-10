-- Prize items (owner request 2026-11-09: "the prizes could be a lot more … items, avatars, frames, app icons"):
-- every week has its own prizes, the same for every league. #1 wins that week's avatar, #2 and #3 that week's
-- frame. They come round again only after 12 weeks, and cannot be bought (src/data/shop.ts, rank_prize_item).
alter table public.rank_prizes add column if not exists item text;
alter table public.rank_players drop constraint if exists rank_players_avatar_check;
alter table public.rank_players add constraint rank_players_avatar_check check (avatar between 0 and 51);
alter table public.rank_players drop constraint if exists rank_players_frame_check;
alter table public.rank_players add constraint rank_players_frame_check check (frame between 0 and 13);

-- The week's prize for a place: avatars 40–51 for #1, frames 8–13 for #2 and #3 (week 0 = 2026-11-09).
create or replace function public.rank_prize_item(wk date, place int) returns text
language sql immutable set search_path = '' as $$
  select case when place = 1 then 'av:' || (40 + k % 12) when place in (2, 3) then 'fr:' || (8 + k % 6) end
  from (select (((wk - date '2026-11-09') / 7) % 12 + 12) % 12 as k) w;
$$;

create or replace function public.rank_prize_item_set() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.item is null then new.item := public.rank_prize_item(new.week, new.place); end if;
  return new;
end $$;
drop trigger if exists rank_prize_item on public.rank_prizes;
create trigger rank_prize_item before insert on public.rank_prizes for each row execute function public.rank_prize_item_set();
update public.rank_prizes set item = public.rank_prize_item(week, place) where item is null;

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
  if my_avatar is null or my_avatar not between 0 and 51 or f not between 0 and 13 then
    raise exception 'No such avatar or frame' using errcode = '22023';
  end if;
  select min(place), count(*) filter (where place = 1) into best, wins from public.rank_prizes where user_id = me;
  if ((my_avatar between 32 and 35 or f = 4) and bt < 4)
    or (f between 5 and 7 and coalesce(best, 9) > f - 4)
    or (my_avatar between 36 and 39 and wins < (array[1, 3, 5, 10])[my_avatar - 35])
    or (my_avatar >= 40 and not exists (select 1 from public.rank_prizes where user_id = me and item = 'av:' || my_avatar))
    or (f >= 8 and not exists (select 1 from public.rank_prizes where user_id = me and item = 'fr:' || f)) then
    raise exception 'Not won yet' using errcode = '42501';
  end if;
  update public.rank_players set avatar = my_avatar, private = coalesce(is_private, false), frame = f where user_id = me;
end $$;

create or replace function public.rank_my_prizes() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('week', week, 'place', place, 'tier', tier, 'promoted', promoted,
    'light', light, 'freeze', gives_freeze, 'item', item, 'claimed', claimed_at is not null) order by week desc), '[]'::jsonb)
  from (select * from public.rank_prizes where user_id = auth.uid() order by week desc limit 104) p;
$$;
revoke all on function public.rank_prize_item(date, int) from public, anon;
revoke all on function public.rank_prize_item_set() from public, anon, authenticated;
