-- Round 6 (owner "Yes all 3", 2026-11-14): friends' news and the weekly rival's score, answered at the edge like the
-- league (round 5).
-- Ranks → Friends used to ask for the whole friend list and the news feed every 8 s while open, the app asked for both
-- again on every return (MashaAllahs, friend-streak moments), and the duel page never refreshed. Now one fingerprint in
-- two parts says whether anything changed:
-- - `rank_my_social(d)`: my own part (my row and today, my friend list, asks, MashaAllahs on my news, my duel, and the
--   parts of private friends / a private rival, whose own parts are never public), plus the public ids to ask about;
--   about once a minute and after each report or friend action;
-- - `rank_player_pulse(pids, d)`: one short md5 per public player (their row, week, today, news), asked through the
--   edge proxy (GET /pp), which keeps each player's answer 8 s, so a player many friends watch costs about one read
--   every 8 s. A private player's is always 'x': it says nothing about them.

-- Everything about a player that their friends or their rival see change.
create or replace function public.rank_player_stamp(p public.rank_players, d date) returns text
language sql stable security definer set search_path = '' as $$
  select concat_ws('|', p.pid, p.name, p.avatar, p.frame, p.figure, p.lamp, p.room, p.tier, p.total, p.streak, p.show,
    p.private, p.live_kind, p.live_at,
    (select w.score from public.rank_weeks w where w.user_id = p.user_id and w.week = public.rank_week(d)),
    (select x::text from public.rank_days x where x.user_id = p.user_id and x.day = d),
    (select x::text from public.rank_days x where x.user_id = p.user_id and x.day = d - 1),
    (select concat(max(f.id), '/', count(k.*)) from public.rank_feats f left join public.rank_feat_cheers k on k.feat = f.id
      where f.user_id = p.user_id and f.at > now() - interval '7 days'));
$$;
revoke all on function public.rank_player_stamp(public.rank_players, date) from public, anon, authenticated;

-- Public players' parts (at most 100 ids); anyone may ask, as a pid is shown with a player's row. Private → 'x'.
create or replace function public.rank_player_pulse(pids text[], d date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.rank_check_day(d);
  if pids is null or cardinality(pids) > 100 then
    raise exception 'Too many players' using errcode = '22023';
  end if;
  return coalesce((select jsonb_object_agg(p.pid, case when p.private then 'x' else md5(public.rank_player_stamp(p, d)) end)
    from public.rank_players p where p.pid = any (pids)), '{}'::jsonb);
end $$;
revoke all on function public.rank_player_pulse(text[], date) from public;
grant execute on function public.rank_player_pulse(text[], date) to anon, authenticated;

create or replace function public.rank_my_social(d date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  wk date := public.rank_week(d);
  mine public.rank_players;
  fr text;
  hidden text;
  pub jsonb;
  asks text;
  duel text;
  rival public.rank_players;
begin
  perform public.rank_check_day(d);
  select * into mine from public.rank_players where user_id = me;
  if not found then return null; end if;
  select string_agg(concat(o.user_id, '@', f.since), ',' order by o.user_id),
      string_agg(case when o.private then public.rank_player_stamp(o, d) end, ';' order by o.user_id),
      coalesce(jsonb_agg(o.pid order by o.pid) filter (where not o.private), '[]'::jsonb)
    into fr, hidden, pub
    from public.rank_friends f join public.rank_players o on o.user_id = case when f.a = me then f.b else f.a end
    where f.a = me or f.b = me;
  select concat_ws(';',
      (select string_agg(concat(k.from_id, '@', k.at), ',' order by k.from_id) from public.rank_friend_asks k where k.to_id = me),
      (select string_agg(concat(k.to_id, '@', k.at), ',' order by k.to_id) from public.rank_friend_asks k where k.from_id = me))
    into asks;
  select * into rival from public.rank_players o where o.user_id = (
    select case when x.a = me then x.b else x.a end from public.rank_duels x where x.week = wk and (x.a = me or x.b = me));
  select concat_ws(';',
      (select string_agg(concat(x.id, x.a_claimed, x.b_claimed), ',' order by x.id) from public.rank_duels x
        where x.week >= public.rank_prev_week(wk) and (x.a = me or x.b = me)),
      case when rival.private then public.rank_player_stamp(rival, d) end)
    into duel;
  return jsonb_build_object(
    'p', md5(concat_ws('#', d, public.rank_player_stamp(mine, d), fr, hidden, asks, duel)),
    'f', pub,
    'r', case when rival.user_id is not null and not rival.private then rival.pid end);
end $$;
revoke all on function public.rank_my_social(date) from public, anon;
grant execute on function public.rank_my_social(date) to authenticated;
