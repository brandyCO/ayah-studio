-- Friends' milestones + one-tap MashaAllah (owner-approved backlog 2026-11-13, "no chat"): a player's app shares
-- a milestone the moment it happens (a streak fire day, a new level, a surah / juz finished, a Khatm), and their
-- friends see it on Ranks → Friends with one button: MashaAllah. No text, so nothing to moderate. A private
-- player shares nothing. Nobody reads the tables directly.

create table if not exists public.rank_feats (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('streak', 'level', 'surah', 'juz', 'khatm')),
  n int not null,
  day date not null default current_date,
  at timestamptz not null default now(),
  unique (user_id, kind, n, day)
);
create index if not exists rank_feats_user on public.rank_feats (user_id, at desc);
alter table public.rank_feats enable row level security;
revoke all on table public.rank_feats from anon, authenticated;

create table if not exists public.rank_feat_cheers (
  feat bigint not null references public.rank_feats (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now(),
  primary key (feat, user_id)
);
alter table public.rank_feat_cheers enable row level security;
revoke all on table public.rank_feat_cheers from anon, authenticated;

-- Shares one of my milestones (the same one twice a day is kept once); at most 12 a day. True when kept.
create or replace function public.rank_feat(kind text, n int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  p public.rank_players;
  c int;
  kept int;
begin
  if kind is null or n is null or not (
       (kind = 'streak' and n between 3 and 20000) or (kind = 'level' and n between 2 and 50)
    or (kind = 'surah' and n between 1 and 114) or (kind = 'juz' and n between 1 and 30) or (kind = 'khatm' and n between 1 and 1000)) then
    raise exception 'Unknown milestone' using errcode = '22023';
  end if;
  select * into p from public.rank_players where user_id = me;
  if not found or p.private then return false; end if;
  select count(*) into c from public.rank_feats f where f.user_id = me and f.day = current_date;
  if c >= 12 then return false; end if;
  insert into public.rank_feats (user_id, kind, n) values (me, rank_feat.kind, rank_feat.n) on conflict do nothing;
  get diagnostics kept = row_count;
  delete from public.rank_feats f where f.user_id = me and f.at < now() - interval '30 days';
  return kept > 0;
end $$;

-- Friends' milestones of the last 7 days (newest first, ≤ 30), and mine with who said MashaAllah.
create or replace function public.rank_feats_feed() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := public.rank_me();
begin
  return jsonb_build_object(
    'friends', coalesce((select jsonb_agg(x order by (x ->> 'at') desc) from (
      select public.rank_face(p, me) || jsonb_build_object('id', f.id, 'kind', f.kind, 'n', f.n, 'at', f.at,
          'cheers', (select count(*) from public.rank_feat_cheers k where k.feat = f.id),
          'cheered', exists (select 1 from public.rank_feat_cheers k where k.feat = f.id and k.user_id = me)) as x
      from public.rank_feats f join public.rank_players p on p.user_id = f.user_id
      where f.at > now() - interval '7 days' and not p.private and public.rank_is_friend(me, f.user_id)
      order by f.at desc limit 30) y), '[]'::jsonb),
    'mine', coalesce((select jsonb_agg(x order by (x ->> 'at') desc) from (
      select jsonb_build_object('id', f.id, 'kind', f.kind, 'n', f.n, 'at', f.at,
          'by', (select coalesce(jsonb_agg(case when p.private then '' else coalesce(p.name, '') end order by k.at), '[]'::jsonb)
                 from public.rank_feat_cheers k join public.rank_players p on p.user_id = k.user_id where k.feat = f.id)) as x
      from public.rank_feats f
      where f.user_id = me and f.at > now() - interval '7 days'
        and exists (select 1 from public.rank_feat_cheers k where k.feat = f.id)
      order by f.at desc limit 10) y), '[]'::jsonb));
end $$;

-- MashaAllah on a friend's milestone, once each. Returns the count.
create or replace function public.rank_feat_cheer(id bigint) returns int
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  owner uuid;
  c int;
begin
  select f.user_id into owner from public.rank_feats f where f.id = rank_feat_cheer.id and f.at > now() - interval '7 days';
  if owner is null or owner = me or not public.rank_is_friend(me, owner) then
    raise exception 'Only for a friend''s milestone' using errcode = '22023';
  end if;
  select count(*) into c from public.rank_feat_cheers k where k.user_id = me and k.at > now() - interval '1 day';
  if c >= 60 then raise exception 'That is plenty for today' using errcode = '22023'; end if;
  insert into public.rank_feat_cheers (feat, user_id) values (rank_feat_cheer.id, me) on conflict do nothing;
  return (select count(*) from public.rank_feat_cheers k where k.feat = rank_feat_cheer.id);
end $$;

revoke all on function public.rank_feat(text, int) from public, anon;
revoke all on function public.rank_feats_feed() from public, anon;
revoke all on function public.rank_feat_cheer(bigint) from public, anon;
grant execute on function public.rank_feat(text, int), public.rank_feats_feed(), public.rank_feat_cheer(bigint) to authenticated;

-- Reading now (owner-approved backlog 2026-11-13): while the mushaf is open (or a recitation plays) the app says so once
-- a minute; friends see a soft live dot for 3 minutes after. A private player never shows.
alter table public.rank_players add column if not exists live_at timestamptz;
alter table public.rank_players add column if not exists live_kind text check (live_kind in ('read', 'listen'));

create or replace function public.rank_live(k text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.rank_me();
begin
  if k is null or k not in ('read', 'listen') then raise exception 'Unknown activity' using errcode = '22023'; end if;
  update public.rank_players set live_at = now(), live_kind = k
    where user_id = me and (live_at is null or live_at < now() - interval '40 seconds' or live_kind is distinct from k);
end $$;
revoke all on function public.rank_live(text) from public, anon;
grant execute on function public.rank_live(text) to authenticated;

-- Friends: as before, plus `live` ('read' | 'listen') while a friend is in the mushaf now.
create or replace function public.rank_my_friends(d date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  wk date := public.rank_week(d);
begin
  perform public.rank_check_day(d);
  return jsonb_build_object(
    'friends', (select coalesce(jsonb_agg(public.rank_face(p, me) || jsonb_build_object('since', f.since,
        'week', coalesce((select score from public.rank_weeks w where w.user_id = p.user_id and w.week = wk), 0),
        'live', case when not p.private and p.live_at > now() - interval '3 minutes' then p.live_kind end)
        || public.rank_friend_streak(me, p.user_id, d) order by p.name), '[]'::jsonb)
      from public.rank_friends f join public.rank_players p on p.user_id = case when f.a = me then f.b else f.a end
      where f.a = me or f.b = me),
    'asks', (select coalesce(jsonb_agg(public.rank_face(p, me) || jsonb_build_object('pid', p.pid) order by k.at desc), '[]'::jsonb)
      from public.rank_friend_asks k join public.rank_players p on p.user_id = k.from_id where k.to_id = me),
    'sent', (select coalesce(jsonb_agg(p.pid), '[]'::jsonb)
      from public.rank_friend_asks k join public.rank_players p on p.user_id = k.to_id where k.from_id = me));
end $$;
