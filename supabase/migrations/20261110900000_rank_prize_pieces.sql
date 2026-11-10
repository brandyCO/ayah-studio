-- Character pieces as weekly prizes (owner request 2026-11-10, "apply the 3 ideas"): each week's top 3 of a
-- league also win that week's piece for their character — a robe of light, a golden lantern, gold glasses,
-- an aurora or sun-rays background, a jar of light — in turn, back after 6 weeks; never sold. Worn only by
-- those who won it (rank_set_figure). Pieces are 'slot:value' of the character code (src/ui/figure.ts).
alter table public.rank_prizes add column if not exists piece text;

create or replace function public.rank_prize_piece(wk date) returns text
language sql immutable set search_path = '' as $$
  select (array['outfit:7', 'hold:6', 'glasses:3', 'bg:8', 'hold:7', 'bg:9'])[(((wk - date '2026-11-09') / 7) % 6 + 6) % 6 + 1];
$$;

create or replace function public.rank_prize_item_set() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.item is null then new.item := public.rank_prize_item(new.week, new.place); end if;
  if new.piece is null and new.place between 1 and 3 then new.piece := public.rank_prize_piece(new.week); end if;
  return new;
end $$;
update public.rank_prizes set piece = public.rank_prize_piece(week) where piece is null and place between 1 and 3;

create or replace function public.rank_my_prizes() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('week', week, 'place', place, 'tier', tier, 'promoted', promoted,
    'light', light, 'freeze', gives_freeze, 'item', item, 'piece', piece, 'claimed', claimed_at is not null) order by week desc), '[]'::jsonb)
  from (select * from public.rank_prizes where user_id = auth.uid() order by week desc limit 104) p;
$$;

create or replace function public.rank_set_figure(code text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  pc text;
  pos int;
begin
  if not exists (select 1 from public.rank_players where user_id = me) then raise exception 'Not playing yet' using errcode = '22023'; end if;
  if code is not null and code !~ '^[0-9a-z]{14}$' then raise exception 'No such character' using errcode = '22023'; end if;
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

revoke all on function public.rank_prize_piece(date) from public, anon;
