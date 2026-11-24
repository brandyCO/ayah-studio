-- Leftovers of features the owner removed (approved 2026-11-24): the ayah wall (removed 2026-10-11),
-- Khatm circles and Gift an ayah (both removed 2026-10-28). Their tables and functions go; family circles
-- (docs/kids.md K6) keep the shared circle tables, invite codes, join / leave / delete and the preview.
-- Revision lamps never had a table (a user_docs row, still in Export my data).
-- Light gifts between friends (rank_gifts) are a different feature and stay.

-- Ayah wall
drop function if exists public.create_wall(text, text, jsonb, int);
drop function if exists public.update_wall(uuid, text, text, jsonb, int);
drop function if exists public.set_wall_open(uuid, boolean);
drop function if exists public.delete_wall(uuid);
drop function if exists public.hide_wall_entry(uuid, boolean);
drop function if exists public.wall_preview(text);
drop function if exists public.add_wall_entry(text, text, text, int, int, int);
drop function if exists public.remove_wall_entry(uuid);
drop table if exists public.wall_entries;
drop table if exists public.walls;

-- Gift an ayah
drop function if exists public.send_gift(int, int, int, int, jsonb, text, text, text);
drop function if exists public.get_gift(text);
drop function if exists public.my_gifts();
drop function if exists public.delete_gift(text);
drop table if exists public.gifts;
-- Only gifts and walls checked a reel look.
drop function if exists public.valid_gift_look(jsonb);

-- Khatm circles: the juz parts, their functions and the circles themselves (family circles stay)
drop function if exists public.create_circle(text, text, date);
drop function if exists public.take_part(uuid, int);
drop function if exists public.set_part(uuid, int, text);
drop function if exists public.new_round(uuid);
drop function if exists public.update_circle(uuid, text, date);
drop table if exists public.circle_parts;
drop function if exists public.circle_part_done();
delete from public.circles where kind = 'khatm';
alter table public.circles alter column kind set default 'family';
alter table public.circles drop constraint if exists circles_kind_check;
alter table public.circles add constraint circles_kind_check check (kind = 'family');

-- Leaving no longer frees a juz part (there are none).
create or replace function public.leave_circle(c uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.require_account();
  heir uuid;
begin
  delete from public.circle_members where circle_id = c and user_id = me;
  if not found then return; end if;
  select user_id into heir from public.circle_members where circle_id = c order by joined_at limit 1;
  if heir is null then
    delete from public.circles where id = c;
  else
    update public.circles set owner_id = heir where id = c and owner_id = me;
  end if;
end $$;
revoke all on function public.leave_circle(uuid) from public, anon;
grant execute on function public.leave_circle(uuid) to authenticated;
