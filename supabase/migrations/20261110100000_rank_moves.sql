-- Ranks: how many places each player moved since yesterday (owner request 2026-11-09: a small green ▲2 /
-- red ▼1 beside the name). Yesterday's place = this week's score without today's day, ties broken by today's
-- score, so players still at 0 do not jump around. Nothing moves on the week's first day.
create or replace function public.rank_league(d date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  lg uuid;
  first_day boolean := d = public.rank_week(d);
begin
  perform public.rank_check_day(d);
  if not exists (select 1 from public.rank_players where user_id = me) then return null; end if;
  lg := public.rank_join_league(me, public.rank_week(d));
  return jsonb_build_object(
    'tier', (select tier from public.rank_leagues where id = lg),
    'players', (select coalesce(jsonb_agg(jsonb_build_object('name', r.name, 'score', r.score, 'me', r.user_id = me,
        'move', case when first_day then 0 else r.prev_p - r.now_p end) order by r.now_p), '[]'::jsonb)
      from (select s.*, row_number() over (order by s.score desc, s.user_id) as now_p,
                   row_number() over (order by s.prev desc, s.score desc, s.user_id) as prev_p
            from (select w.user_id, p.name, w.score, w.score - coalesce(x.score, 0) as prev
                  from public.rank_weeks w
                  join public.rank_players p on p.user_id = w.user_id
                  left join public.rank_days x on x.user_id = w.user_id and x.day = d
                  where w.league = lg) s) r));
end $$;

create or replace function public.rank_board(board uuid, d date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  first_day boolean := d = public.rank_week(d);
begin
  perform public.rank_check_day(d);
  if not exists (select 1 from public.rank_board_members where board_id = board and user_id = me) then
    raise exception 'Not on this board' using errcode = '42501';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('name', r.name, 'score', r.score, 'tier', r.tier, 'me', r.user_id = me,
      'move', case when first_day then 0 else r.prev_p - r.now_p end) order by r.now_p), '[]'::jsonb)
    from (select s.*, row_number() over (order by s.score desc, s.user_id) as now_p,
                 row_number() over (order by s.prev desc, s.score desc, s.user_id) as prev_p
          from (select m.user_id, p.name, p.tier, coalesce(w.score, 0) as score,
                       coalesce(w.score, 0) - coalesce(x.score, 0) as prev
                from public.rank_board_members m
                join public.rank_players p on p.user_id = m.user_id
                left join public.rank_weeks w on w.user_id = m.user_id and w.week = public.rank_week(d)
                left join public.rank_days x on x.user_id = m.user_id and x.day = d
                where m.board_id = board) s) r);
end $$;
