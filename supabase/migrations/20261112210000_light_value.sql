-- Light worth more (owner request 2026-11-12, "what makes the Light way more valuable"):
--  1. Friday double XP: what a player earns on a Friday (their own date) counts twice in the league, XP and duels.
--     The per-measure boards and friend challenges count the raw pages / minutes, so they are unchanged.
--  2. Frames 14–19: limited frames bought with Light, each sold one week in turn (the app checks the week, as it does
--     for every Light purchase; Light lives on the device and in the user's own synced data).
--  3. The lamp of Light: how much Light a player has spent (0 none, 1 bronze ≥ 500, 2 silver ≥ 2,000, 3 gold ≥ 5,000,
--     4 diamond ≥ 15,000), shown by their name on boards. Reported by the app (`rank_set_lamp`).
--  4. Gifts between friends: Light (10–200) or a piece bought with Light, ≤ 3 sent a day, opened once as a chest.
--     The sender's app pays from its own Light; the friend's app adds what arrives. Nobody reads the table directly.
-- The last ten nights of Ramadan (Umm al-Qura, Ramadan 21–29/30 as local days, checked with
-- Intl en-u-ca-islamic-umalqura; the Ramadan season thread's event): even nights ×1.5, odd nights ×2.
create table if not exists public.rank_xp_days (day date primary key, mult numeric not null check (mult between 1 and 3));
alter table public.rank_xp_days enable row level security;
revoke all on table public.rank_xp_days from anon, authenticated;
insert into public.rank_xp_days (day, mult) values
  ('2027-02-28', 2),
  ('2027-03-01', 1.5),
  ('2027-03-02', 2),
  ('2027-03-03', 1.5),
  ('2027-03-04', 2),
  ('2027-03-05', 1.5),
  ('2027-03-06', 2),
  ('2027-03-07', 1.5),
  ('2027-03-08', 2),
  ('2028-02-17', 2),
  ('2028-02-18', 1.5),
  ('2028-02-19', 2),
  ('2028-02-20', 1.5),
  ('2028-02-21', 2),
  ('2028-02-22', 1.5),
  ('2028-02-23', 2),
  ('2028-02-24', 1.5),
  ('2028-02-25', 2),
  ('2029-02-05', 2),
  ('2029-02-06', 1.5),
  ('2029-02-07', 2),
  ('2029-02-08', 1.5),
  ('2029-02-09', 2),
  ('2029-02-10', 1.5),
  ('2029-02-11', 2),
  ('2029-02-12', 1.5),
  ('2029-02-13', 2),
  ('2030-01-25', 2),
  ('2030-01-26', 1.5),
  ('2030-01-27', 2),
  ('2030-01-28', 1.5),
  ('2030-01-29', 2),
  ('2030-01-30', 1.5),
  ('2030-01-31', 2),
  ('2030-02-01', 1.5),
  ('2030-02-02', 2),
  ('2030-02-03', 1.5),
  ('2031-01-15', 2),
  ('2031-01-16', 1.5),
  ('2031-01-17', 2),
  ('2031-01-18', 1.5),
  ('2031-01-19', 2),
  ('2031-01-20', 1.5),
  ('2031-01-21', 2),
  ('2031-01-22', 1.5),
  ('2031-01-23', 2)
on conflict (day) do update set mult = excluded.mult;

-- What a day's XP is multiplied by: Friday (the player's own date) ×2, the last ten nights as above; the larger wins.
create or replace function public.rank_xp_mult(d date) returns numeric
language sql stable security definer set search_path = '' as $$
  select greatest(case when extract(isodow from d) = 5 then 2 else 1 end,
    coalesce((select mult from public.rank_xp_days where day = d), 1));
$$;
revoke all on function public.rank_xp_mult(date) from public, anon;
grant execute on function public.rank_xp_mult(date) to authenticated;

create or replace function public.rank_report(d date, pages int, listen int, surahs int, reels int, my_name text,
  lessons int default 0, adhkar int default 0, dhikr int default 0)
returns int language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  p public.rank_players;
  old public.rank_days;
  secs int;
  np int; nl int; ns int; nr int; nx int; na int; nd int; sc int;
  wk date := public.rank_week(d);
  q jsonb;
begin
  perform public.rank_check_day(d);
  insert into public.rank_players (user_id, name) values (me, coalesce(public.clean_name(my_name, 24), 'Reader'))
    on conflict (user_id) do nothing;
  select * into p from public.rank_players where user_id = me for update;
  select * into old from public.rank_days where user_id = me and day = d for update;
  if not found then
    old.pages := 0; old.listen := 0; old.surahs := 0; old.reels := 0; old.lessons := 0; old.adhkar := 0; old.dhikr := 0; old.score := 0;
  end if;
  if old.updated_at > now() - interval '5 seconds' then return old.score; end if;
  secs := coalesce(extract(epoch from now() - coalesce(old.updated_at, p.last_report))::int, 3600);
  np := greatest(old.pages, least(greatest(coalesce(pages, 0), 0), 60, old.pages + secs / 60 + 3));
  nl := greatest(old.listen, least(greatest(coalesce(listen, 0), 0), 10800, old.listen + secs + 300));
  ns := greatest(old.surahs, least(greatest(coalesce(surahs, 0), 0), 10, old.surahs + secs / 60 + 1));
  nr := greatest(old.reels, least(greatest(coalesce(reels, 0), 0), 3, old.reels + secs / 60 + 1));
  nx := greatest(old.lessons, least(greatest(coalesce(lessons, 0), 0), 20, old.lessons + secs / 60 + 2));
  na := greatest(old.adhkar, least(greatest(coalesce(adhkar, 0), 0), 12, old.adhkar + secs / 60 + 1));
  nd := greatest(old.dhikr, least(greatest(coalesce(dhikr, 0), 0), 3000, old.dhikr + secs * 2 + 40));
  sc := round(public.rank_score(np, nl, ns, nr, nx) * public.rank_xp_mult(d))::int;
  insert into public.rank_days (user_id, day, pages, listen, surahs, reels, lessons, adhkar, dhikr, score, updated_at)
    values (me, d, np, nl, ns, nr, nx, na, nd, sc, now())
    on conflict (user_id, day) do update set pages = np, listen = nl, surahs = ns, reels = nr, lessons = nx,
      adhkar = na, dhikr = nd, score = sc, updated_at = now();
  perform public.rank_join_league(me, wk);
  update public.rank_weeks set score = score + (sc - old.score) where user_id = me and week = wk;
  update public.rank_players set total = total + (sc - old.score), last_report = now() where user_id = me;
  q := public.rank_quest(me, wk);
  if (q ->> 'done')::int >= (q ->> 'target')::int then
    update public.rank_weeks set quest_done = true, score = score + 50 where user_id = me and week = wk and not quest_done;
    if found then update public.rank_players set total = total + 50 where user_id = me; end if;
  end if;
  return sc;
end $$;
revoke all on function public.rank_report(date, int, int, int, int, text, int, int, int) from public, anon;
grant execute on function public.rank_report(date, int, int, int, int, text, int, int, int) to authenticated;

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
  if my_avatar is null or my_avatar not between 0 and 51 or f not between 0 and 19 then
    raise exception 'No such avatar or frame' using errcode = '22023';
  end if;
  select min(place), count(*) filter (where place = 1) into best, wins from public.rank_prizes where user_id = me;
  if ((my_avatar between 32 and 35 or f = 4) and bt < 4)
    or (f between 5 and 7 and coalesce(best, 9) > f - 4)
    or (my_avatar between 36 and 39 and wins < (array[1, 3, 5, 10])[my_avatar - 35])
    or (my_avatar >= 40 and not exists (select 1 from public.rank_prizes where user_id = me and item = 'av:' || my_avatar))
    or (f between 8 and 13 and not exists (select 1 from public.rank_prizes where user_id = me and item = 'fr:' || f)) then
    raise exception 'Not won yet' using errcode = '42501';
  end if;
  update public.rank_players set avatar = my_avatar, private = coalesce(is_private, false), frame = f where user_id = me;
end $$;

alter table public.rank_players drop constraint if exists rank_players_frame_check;
alter table public.rank_players add constraint rank_players_frame_check check (frame between 0 and 19);

alter table public.rank_players add column if not exists lamp smallint not null default 0 check (lamp between 0 and 4);

create or replace function public.rank_set_lamp(n int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.rank_players set lamp = greatest(0, least(4, coalesce(n, 0))) where user_id = public.rank_me();
end $$;
revoke all on function public.rank_set_lamp(int) from public, anon;
grant execute on function public.rank_set_lamp(int) to authenticated;

create or replace function public.rank_face(p public.rank_players, me uuid) returns jsonb
language sql immutable set search_path = '' as $$
  select case when p.private and p.user_id <> me
    then jsonb_build_object('name', null, 'private', true, 'avatar', null, 'frame', 0, 'figure', null, 'room', null, 'tier', p.tier, 'me', false, 'pid', null, 'xp', null, 'lamp', 0)
    else jsonb_build_object('name', p.name, 'avatar', p.avatar, 'frame', p.frame, 'figure', p.figure, 'room', p.room, 'tier', p.tier,
      'me', p.user_id = me, 'pid', p.pid, 'xp', p.total, 'lamp', p.lamp) end;
$$;

create table if not exists public.rank_gifts (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references auth.users (id) on delete cascade,
  to_id uuid not null references auth.users (id) on delete cascade,
  light int not null default 0 check (light between 0 and 200),
  item text check (item is null or item ~ '^(fg:[a-z]+:[0-9]{1,2}|rm:[a-z0-9-]{1,24}|av:(2[4-9]|3[01])|fr:([1-3]|1[4-9]))$'),
  at timestamptz not null default now(),
  opened_at timestamptz,
  check ((light between 10 and 200 and item is null) or (light = 0 and item is not null))
);
create index if not exists rank_gifts_to on public.rank_gifts (to_id) where opened_at is null;
create index if not exists rank_gifts_from on public.rank_gifts (from_id, at);
alter table public.rank_gifts enable row level security;
revoke all on table public.rank_gifts from anon, authenticated;

-- Sends a gift to a friend (by their public id); returns its id (the sender's app pays with it).
create or replace function public.rank_gift_send(who text, amount int, piece text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  them uuid := public.rank_by_pid(who);
  out uuid;
begin
  if them is null or them = me or not public.rank_is_friend(me, them) then
    raise exception 'You can only send gifts to friends' using errcode = '42501';
  end if;
  if (select count(*) from public.rank_gifts where from_id = me and at > now() - interval '1 day') >= 3 then
    raise exception 'You have sent 3 gifts today. Try again tomorrow.' using errcode = '22023';
  end if;
  if (select count(*) from public.rank_gifts where to_id = them and opened_at is null) >= 20 then
    raise exception 'Your friend has many gifts waiting. Try again later.' using errcode = '22023';
  end if;
  if piece is not null and exists (select 1 from public.rank_gifts where from_id = me and to_id = them and item = piece) then
    raise exception 'You have already sent this piece to your friend' using errcode = '22023';
  end if;
  insert into public.rank_gifts (from_id, to_id, light, item)
    values (me, them, case when piece is null then coalesce(amount, 0) else 0 end, piece)
    returning id into out;
  return out;
exception when check_violation then
  raise exception 'That gift cannot be sent' using errcode = '22023';
end $$;
revoke all on function public.rank_gift_send(text, int, text) from public, anon;
grant execute on function public.rank_gift_send(text, int, text) to authenticated;

-- Gifts waiting for me, with who sent them.
create or replace function public.rank_my_gifts() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'light', g.light, 'item', g.item, 'at', g.at,
      'from', public.rank_face(p, g.to_id)) order by g.at), '[]'::jsonb)
  from public.rank_gifts g join public.rank_players p on p.user_id = g.from_id
  where g.to_id = public.rank_me() and g.opened_at is null;
$$;
revoke all on function public.rank_my_gifts() from public, anon;
grant execute on function public.rank_my_gifts() to authenticated;

-- Opens a gift once; returns what it holds (null when already opened or not mine).
create or replace function public.rank_gift_open(gift uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.rank_gifts;
begin
  update public.rank_gifts set opened_at = now()
    where id = gift and to_id = public.rank_me() and opened_at is null returning * into r;
  if not found then return null; end if;
  return jsonb_build_object('id', r.id, 'light', r.light, 'item', r.item);
end $$;
revoke all on function public.rank_gift_open(uuid) from public, anon;
grant execute on function public.rank_gift_open(uuid) to authenticated;
