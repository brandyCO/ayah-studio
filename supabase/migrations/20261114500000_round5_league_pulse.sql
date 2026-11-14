-- Round 5 (owner "yes to all 3", 2026-11-14): the league screen's fingerprint in two parts, so the edge proxy can
-- answer the shared part once for a whole league.
-- `rank_pulse(d)` (round 2) is one md5 of the player's own row and the whole league, asked by every player on the
-- league screen every 8 s: a league of 15 watching = 15 database reads every 8 s. Now:
-- - `rank_my_pulse(d)`: the player's own part + which league (asked about once a minute, and after each report);
-- - `rank_league_pulse(lg, d)`: the league's part (the same for every member), asked through the edge proxy
--   (GET /lp), which keeps the answer 8 s, so the league costs about one read every 8 s.
-- Together they change exactly when `rank_pulse` does (it stays for older apps and as the fallback).

create or replace function public.rank_my_pulse(d date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  wk date := public.rank_week(d);
  lg uuid;
  mine text;
begin
  perform public.rank_check_day(d);
  select league into lg from public.rank_weeks where user_id = me and week = wk;
  if lg is null then select league into lg from public.rank_weeks where user_id = me and week = public.rank_prev_week(wk); end if;
  select concat_ws('|', p.total, p.tier, p.name, p.avatar, p.frame, p.figure, p.private, p.lamp, w.score, w.quest_done, w.league,
      (select count(*) from public.rank_prizes z where z.user_id = me and z.claimed_at is null))
    into mine
    from public.rank_players p left join public.rank_weeks w on w.user_id = p.user_id and w.week = wk where p.user_id = me;
  if mine is null then return null; end if;
  return jsonb_build_object('p', md5(concat_ws('#', wk, mine)), 'l', lg);
end $$;
revoke all on function public.rank_my_pulse(date) from public, anon;
grant execute on function public.rank_my_pulse(date) to authenticated;

-- Only an md5 of a league's rows; a league id is a random uuid known to its members. Granted to anon for the proxy
-- (it calls with the publishable key, never a user's token).
create or replace function public.rank_league_pulse(lg uuid, d date) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  board text;
begin
  perform public.rank_check_day(d);
  if lg is null then return null; end if;
  select string_agg(concat_ws(',', o.user_id, w.score, o.name, o.avatar, o.frame, o.figure, o.private, o.lamp, o.room, o.tier,
      (select x.score from public.rank_days x where x.user_id = w.user_id and x.day = d)), ';' order by w.user_id)
    into board
    from public.rank_weeks w join public.rank_players o on o.user_id = w.user_id where w.league = lg;
  return md5(coalesce(board, ''));
end $$;
revoke all on function public.rank_league_pulse(uuid, date) from public;
grant execute on function public.rank_league_pulse(uuid, date) to anon, authenticated;
