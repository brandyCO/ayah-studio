-- Ranks prizes (owner decision 2026-11-09, "Light + trophies + shop"): when a week ends, the top 3 of a
-- league (of 3 or more, with points) win a trophy and Light (#1 300 + a streak freeze, #2 150, #3 100),
-- and moving up a tier adds 50. Worked out when the player's next week starts (rank_join_league), kept
-- as their trophy shelf; the app claims the Light once. Also avatar frames. Some things cannot be bought:
-- avatars 32–35 and frame 4 need the Sun tier reached; frames 5 / 6 / 7 (gold, silver, bronze laurel) a
-- week won at #1 / #2 or better / #3 or better; avatars 36–39 (champions) 1 / 3 / 5 / 10 weeks won at #1.

alter table public.rank_players add column if not exists frame smallint not null default 0 check (frame between 0 and 7);
alter table public.rank_players add column if not exists best_tier smallint not null default 0 check (best_tier between 0 and 4);
alter table public.rank_players drop constraint if exists rank_players_avatar_check;
alter table public.rank_players add constraint rank_players_avatar_check check (avatar between 0 and 39);
update public.rank_players set best_tier = greatest(best_tier, tier);

create table if not exists public.rank_prizes (
  user_id uuid not null references auth.users (id) on delete cascade,
  week date not null,
  place smallint check (place between 1 and 3),
  tier smallint not null check (tier between 0 and 4),
  promoted boolean not null default false,
  light int not null default 0,
  gives_freeze boolean not null default false,
  claimed_at timestamptz,
  primary key (user_id, week)
);
alter table public.rank_prizes enable row level security;
revoke all on table public.rank_prizes from anon, authenticated;

create or replace function public.rank_face(p public.rank_players, me uuid) returns jsonb
language sql immutable set search_path = '' as $$
  select case when p.private and p.user_id <> me
    then jsonb_build_object('name', null, 'private', true, 'avatar', null, 'frame', 0, 'tier', p.tier, 'me', false)
    else jsonb_build_object('name', p.name, 'avatar', p.avatar, 'frame', p.frame, 'tier', p.tier, 'me', p.user_id = me) end;
$$;

-- As before, plus the prize for last week and the best tier reached.
create or replace function public.rank_join_league(me uuid, wk date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  lg uuid;
  last record;
  t smallint;
  t0 smallint;
  pl smallint;
begin
  select league into lg from public.rank_weeks where user_id = me and week = wk;
  if lg is not null then return lg; end if;
  select tier into t from public.rank_players where user_id = me for update;
  t0 := t;
  select w.league, l.size, l.tier as ltier,
         (select count(*) from public.rank_weeks o where o.league = w.league and (o.score > w.score or (o.score = w.score and o.user_id < w.user_id))) + 1 as place,
         w.score
    into last
    from public.rank_weeks w join public.rank_leagues l on l.id = w.league
    where w.user_id = me and w.week = wk - 7;
  if found then
    if last.place <= 3 and last.score > 0 then t := least(4, t + 1);
    elsif last.size >= 8 and last.place > last.size - 3 then t := greatest(0, t - 1);
    end if;
    update public.rank_players set tier = t, best_tier = greatest(best_tier, t) where user_id = me;
    pl := case when last.place <= 3 and last.score > 0 and last.size >= 3 then last.place end;
    if pl is not null or t > t0 then
      insert into public.rank_prizes (user_id, week, place, tier, promoted, light, gives_freeze)
        values (me, wk - 7, pl, last.ltier, t > t0,
                coalesce((array[300, 150, 100])[pl], 0) + case when t > t0 then 50 else 0 end, pl = 1)
        on conflict (user_id, week) do nothing;
    end if;
  end if;
  select id into lg from public.rank_leagues where week = wk and tier = t and size < 15
    order by created_at limit 1 for update skip locked;
  if lg is null then
    insert into public.rank_leagues (week, tier) values (wk, t) returning id into lg;
  end if;
  update public.rank_leagues set size = size + 1 where id = lg;
  insert into public.rank_weeks (user_id, week, league) values (me, wk, lg)
    on conflict (user_id, week) do update set league = excluded.league;
  return lg;
end $$;

drop function if exists public.rank_set_look(int, boolean);
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
  if my_avatar is null or my_avatar not between 0 and 39 or f not between 0 and 7 then
    raise exception 'No such avatar or frame' using errcode = '22023';
  end if;
  select min(place), count(*) filter (where place = 1) into best, wins from public.rank_prizes where user_id = me;
  if ((my_avatar between 32 and 35 or f = 4) and bt < 4)
    or (f between 5 and 7 and coalesce(best, 9) > f - 4)
    or (my_avatar >= 36 and wins < (array[1, 3, 5, 10])[my_avatar - 35]) then
    raise exception 'Not won yet' using errcode = '42501';
  end if;
  update public.rank_players set avatar = my_avatar, private = coalesce(is_private, false), frame = f where user_id = me;
end $$;

-- Status, plus frame, best tier and prizes waiting to be claimed.
create or replace function public.rank_status(d date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  wk date;
  p public.rank_players;
  ws int;
  lg uuid;
  rival jsonb;
  last jsonb;
begin
  perform public.rank_check_day(d);
  wk := public.rank_week(d);
  if not exists (select 1 from public.rank_players where user_id = me) then return null; end if;
  lg := public.rank_join_league(me, wk);
  select * into p from public.rank_players where user_id = me;
  select score into ws from public.rank_weeks where user_id = me and week = wk;
  select public.rank_face(o, me) || jsonb_build_object('gap', w.score - ws) into rival
    from public.rank_weeks w join public.rank_players o on o.user_id = w.user_id
    where w.league = lg and w.user_id <> me and (w.score > ws or (w.score = ws and w.user_id < me))
    order by w.score, w.user_id desc limit 1;
  select jsonb_build_object('score', w.score, 'tier', l.tier, 'size', l.size,
      'place', (select count(*) from public.rank_weeks o where o.league = w.league and (o.score > w.score or (o.score = w.score and o.user_id < w.user_id))) + 1)
    into last
    from public.rank_weeks w join public.rank_leagues l on l.id = w.league where w.user_id = me and w.week = wk - 7;
  return jsonb_build_object(
    'name', p.name, 'tier', p.tier, 'avatar', p.avatar, 'private', p.private, 'frame', p.frame, 'bestTier', p.best_tier, 'total', p.total, 'week', coalesce(ws, 0),
    'weekPlace', case when ws is null then null else (select count(*) from public.rank_weeks where week = wk and score > ws) + 1 end,
    'weekPlayers', (select count(*) from public.rank_weeks where week = wk),
    'allPlace', (select count(*) from public.rank_players where total > p.total) + 1,
    'allPlayers', (select count(*) from public.rank_players),
    'quest', public.rank_quest(me, wk) || jsonb_build_object('complete', (select quest_done from public.rank_weeks where user_id = me and week = wk)),
    'rival', rival, 'last', last, 'weekStart', wk,
    'prizes', (select count(*) from public.rank_prizes where user_id = me and claimed_at is null),
    'bestPlace', (select min(place) from public.rank_prizes where user_id = me),
    'wins', (select count(*) from public.rank_prizes where user_id = me and place = 1));
end $$;

-- My trophy shelf (newest first).
create or replace function public.rank_my_prizes() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('week', week, 'place', place, 'tier', tier, 'promoted', promoted,
    'light', light, 'freeze', gives_freeze, 'claimed', claimed_at is not null) order by week desc), '[]'::jsonb)
  from (select * from public.rank_prizes where user_id = auth.uid() order by week desc limit 104) p;
$$;

-- Claims a prize once; returns what it holds, or null when it was claimed already.
create or replace function public.rank_claim_prize(wk date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.rank_me(); r public.rank_prizes;
begin
  update public.rank_prizes set claimed_at = now() where user_id = me and week = wk and claimed_at is null returning * into r;
  if not found then return null; end if;
  return jsonb_build_object('week', r.week, 'light', r.light, 'freeze', r.gives_freeze, 'place', r.place, 'tier', r.tier);
end $$;

revoke all on function public.rank_set_look(int, boolean, int) from public, anon;
revoke all on function public.rank_my_prizes() from public, anon;
revoke all on function public.rank_claim_prize(date) from public, anon;
grant execute on function public.rank_set_look(int, boolean, int) to authenticated;
grant execute on function public.rank_my_prizes() to authenticated;
grant execute on function public.rank_claim_prize(date) to authenticated;
