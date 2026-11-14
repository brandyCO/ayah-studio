-- Load test seed (.github/workflows/loadtest.yml): :n players on a throwaway local database, made the way the app makes
-- them. Each player reports today through rank_report (so leagues, weeks and today's rows come from the real code),
-- has 13 earlier days, about 16 friends, some news with MashaAllahs, ~30 synced documents, and a weekly rival.
-- Player i has the id 00000000-0000-0000-0000-{i as 12 digits}.
\set ON_ERROR_STOP on
select set_config('load.n', :'n', false);
create or replace function pg_temp.uid(i int) returns uuid language sql immutable as
  $$ select ('00000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid $$;

insert into auth.users (id, email, created_at)
  select pg_temp.uid(i), 'p' || i || '@load.test', now() - (i % 300) * interval '1 day' from generate_series(1, :n) i;

-- Earlier days first (the rival pairing looks at the last 14), then today's report through the app's own function.
insert into public.rank_days (user_id, day, pages, listen, surahs, reels, score, updated_at)
  select pg_temp.uid(i), current_date - k, (i * 7 + k) % 20, ((i * 13 + k) % 40) * 60, (i + k) % 3, (i + k) % 2,
    ((i * 7 + k) % 20) * 10 + ((i * 13 + k) % 40) * 2 + 20, now() - k * interval '1 day'
  from generate_series(1, :n) i, generate_series(1, 13) k;

do $$
declare i int; total int := current_setting('load.n')::int;
begin
  for i in 1..total loop
    perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(i), 'role', 'authenticated', 'is_anonymous', false)::text, true);
    perform public.rank_report(current_date, i % 15, (i % 50) * 60, i % 2, i % 3, 'Player ' || i,
      i % 4, i % 3, (i % 10) * 33, now() + interval '3 days', 180);
  end loop;
end $$;

-- About 16 friends each (8 on each side), as pairs a < b.
insert into public.rank_friends (a, b, since)
  select least(pg_temp.uid(i), pg_temp.uid(j)), greatest(pg_temp.uid(i), pg_temp.uid(j)), current_date - (i % 60)
  from generate_series(1, :n) i, generate_series(1, 8) k, lateral (select ((i + k * 37 - 1) % :n) + 1 as j) x
  where i <> j
  on conflict do nothing;
-- A fifth share news today; their friends say MashaAllah.
insert into public.rank_feats (user_id, kind, n, day, at)
  select pg_temp.uid(i), 'surah', 1 + i % 114, current_date, now() - (i % 600) * interval '1 minute'
  from generate_series(1, :n, 5) i;
insert into public.rank_feat_cheers (feat, user_id)
  select f.id, case when r.a = f.user_id then r.b else r.a end
  from public.rank_feats f join public.rank_friends r on r.a = f.user_id or r.b = f.user_id
  where (f.id + hashtext(r.a::text || r.b::text)) % 3 = 0
  on conflict do nothing;
-- Pending friend asks and "reading now".
insert into public.rank_friend_asks (from_id, to_id)
  select pg_temp.uid(i), pg_temp.uid(((i + 4999) % :n) + 1) from generate_series(1, :n, 7) i on conflict do nothing;
update public.rank_players set live_at = now() - (hashtext(user_id::text) % 5) * interval '1 minute', live_kind = 'read'
  where hashtext(user_id::text) % 10 = 0;

-- Synced documents: ~30 small rows each (journey parts, settings, kv keys), like a phone a few weeks in.
insert into public.user_docs (user_id, kind, id, data, device_id, updated_at)
  select pg_temp.uid(i), case when k <= 3 then 'state' else 'setting' end,
    case when k = 1 then 'journey:dev' || i when k = 2 then 'garden' when k = 3 then 'jm:dev' || i || ':pages' else 'kv:key' || k end,
    jsonb_build_object('v', repeat('x', 200 + (k * 37) % 900), 'at', extract(epoch from now())::bigint),
    'dev' || i, now() - (k * i % 1000) * interval '1 minute'
  from generate_series(1, :n) i, generate_series(1, 30) k;

-- Weekly rivals, by the server's own pairing job.
select public.rank_pair_duels() as duels_paired;

analyze;
select (select count(*) from public.rank_players) players, (select count(*) from public.rank_leagues) leagues,
  (select count(*) from public.rank_friends) friendships, (select count(*) from public.rank_duels) duels,
  (select count(*) from public.user_docs) docs;
