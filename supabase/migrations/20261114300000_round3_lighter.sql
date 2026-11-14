-- Round 3 (owner "Yes", 2026-11-14): fewer writes, nothing growing for ever, no way to fill the database.
--
-- 1. Reading now: the app says so every 2 minutes (was every minute); friends see the dot for 4 minutes.
create or replace function public.rank_live(k text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.rank_me();
begin
  if k is null or k not in ('read', 'listen') then raise exception 'Unknown activity' using errcode = '22023'; end if;
  update public.rank_players set live_at = now(), live_kind = k
    where user_id = me and (live_at is null or live_at < now() - interval '90 seconds' or live_kind is distinct from k);
end $$;
revoke all on function public.rank_live(text) from public, anon;
grant execute on function public.rank_live(text) to authenticated;

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
        'live', case when not p.private and p.live_at > now() - interval '4 minutes' then p.live_kind end)
        || public.rank_friend_streak(me, p.user_id, d) order by p.name), '[]'::jsonb)
      from public.rank_friends f join public.rank_players p on p.user_id = case when f.a = me then f.b else f.a end
      where f.a = me or f.b = me),
    'asks', (select coalesce(jsonb_agg(public.rank_face(p, me) || jsonb_build_object('pid', p.pid) order by k.at desc), '[]'::jsonb)
      from public.rank_friend_asks k join public.rank_players p on p.user_id = k.from_id where k.to_id = me),
    'sent', (select coalesce(jsonb_agg(p.pid), '[]'::jsonb)
      from public.rank_friend_asks k join public.rank_players p on p.user_id = k.to_id where k.from_id = me));
end $$;
revoke all on function public.rank_my_friends(date) from public, anon;
grant execute on function public.rank_my_friends(date) to authenticated;

-- 2. Usage counts: anyone can send words, so a script could invent thousands of new ones a day and fill the
-- database. A day takes at most 3000 different words (the app has ~150); words already counted keep counting.
create or replace function public.usage_add(d date, keys text[]) returns int
language plpgsql security definer set search_path = '' as $$
declare
  sh smallint := floor(random() * 16)::smallint;
  k text;
  c int := 0;
  full_day boolean;
begin
  if d is null or d < current_date - 5 or d > current_date + 1 then
    raise exception 'Not a day we count' using errcode = '22023';
  end if;
  if keys is null or cardinality(keys) > 100 then
    raise exception 'Too many words' using errcode = '22023';
  end if;
  select count(distinct u.key) >= 3000 into full_day from public.usage_daily u where u.day = d;
  for k in select distinct x from unnest(keys) x
    where x ~ '^(d0:)?((v|ev):[a-z0-9-]{1,30}|age:[0-9+-]{1,6}|p:(android|web)|l:[a-z]{2})$'
  loop
    if full_day and not exists (select 1 from public.usage_daily u where u.day = d and u.key = k) then continue; end if;
    insert into public.usage_daily as u (day, key, shard, n) values (d, k, sh, 1)
      on conflict (day, key, shard) do update set n = least(u.n + 1, 100000000);
    c := c + 1;
  end loop;
  return c;
end $$;
revoke all on function public.usage_add(date, text[]) from public;
grant execute on function public.usage_add(date, text[]) to anon, authenticated;

-- 3. Nightly tidy-up, now also (nothing a user earned or can still claim):
--   rank_feats       friends' news older than 30 days (the feed shows a week; its MashaAllahs go with it)
--   rank_challenges  started more than 90 days ago (shown for 28, chest claimable from day 9), or never accepted in 30 days
--   rank_duels       weeks more than 8 weeks ago (only last week's chest can be opened)
--   rank_gifts       opened more than a year ago (the Light / piece is already the friend's)
create or replace function public.tidy_db() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c int; r int; f int; p int; fe int; ch int; du int; gi int;
begin
  delete from public.rank_cheers where at < now() - interval '30 days';
  get diagnostics c = row_count;
  delete from public.relights where expires_at < now() - interval '30 days';
  get diagnostics r = row_count;
  delete from public.rank_friend_asks where at < now() - interval '90 days';
  get diagnostics f = row_count;
  delete from public.problem_reports
    where status in ('fixed', 'wontfix') and created_at < now() - interval '180 days';
  get diagnostics p = row_count;
  delete from public.rank_feats where at < now() - interval '30 days';
  get diagnostics fe = row_count;
  delete from public.rank_challenges
    where (start is not null and start < current_date - 90) or (start is null and created_at < now() - interval '30 days');
  get diagnostics ch = row_count;
  delete from public.rank_duels where week < current_date - 56;
  get diagnostics du = row_count;
  delete from public.rank_gifts where opened_at < now() - interval '365 days';
  get diagnostics gi = row_count;
  return jsonb_build_object('cheers', c, 'relights', r, 'friend_asks', f, 'reports', p,
    'feats', fe, 'challenges', ch, 'duels', du, 'gifts', gi);
end $$;
revoke all on function public.tidy_db() from public, anon, authenticated;
