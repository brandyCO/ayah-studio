-- Weekly rivals for everyone (owner 2026-11-12): no opt-in and no way to stop mid-week ("not fair for the other
-- person"). Every player in the ranks who reported in the last 14 days can be paired; the closest league first, then
-- the closest 14-day average. Quests are given only once there is a rival. rank_set_duels() stays for old app
-- versions but cannot turn rivals off.

create or replace function public.rank_set_duels(turn_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.rank_players set duels = true where user_id = public.rank_me();
  if not found then raise exception 'Read or listen once to join the ranks first' using errcode = '22023'; end if;
end $$;
revoke all on function public.rank_set_duels(boolean) from public, anon;
grant execute on function public.rank_set_duels(boolean) to authenticated;

create or replace function public.rank_my_duel(d date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  p public.rank_players;
  wk date := public.rank_week(d);
  r public.rank_duels;
  them uuid;
  mine numeric;
  last jsonb;
  today public.rank_days;
begin
  perform public.rank_check_day(d);
  select * into p from public.rank_players where user_id = me;
  if not found then return jsonb_build_object('on', false); end if;
  -- Last week's duel, while its chest waits.
  select jsonb_build_object('id', x.id, 'week', x.week, 'me', public.rank_duel_points(me, x.week),
      'them', public.rank_duel_points(case when x.a = me then x.b else x.a end, x.week),
      'rival', public.rank_face(o, me)) into last
    from public.rank_duels x join public.rank_players o on o.user_id = case when x.a = me then x.b else x.a end
    where x.week = wk - 7 and (x.a = me and not x.a_claimed or x.b = me and not x.b_claimed) and current_date > x.week + 7;
  select * into r from public.rank_duels where week = wk and (a = me or b = me);
  if not found then
    -- One pairing at a time for the whole week, so two players are never both given the same rival.
    perform pg_advisory_xact_lock(hashtext('rank_duel:' || wk::text));
    select * into r from public.rank_duels where week = wk and (a = me or b = me);
    if not found then
      mine := (select coalesce(avg(score), 0) from public.rank_days where user_id = me and day between d - 14 and d - 1);
      select o.user_id into them from public.rank_players o
        where o.user_id <> me and o.last_report > now() - interval '14 days'
          and not exists (select 1 from public.rank_duels z where z.week = wk and (z.a = o.user_id or z.b = o.user_id))
        order by abs(o.tier - p.tier),
          abs(coalesce((select avg(score) from public.rank_days y where y.user_id = o.user_id and y.day between d - 14 and d - 1), 0) - mine),
          o.user_id
        limit 1;
      if them is not null then
        insert into public.rank_duels (week, a, b) values (wk, me, them) returning * into r;
        update public.rank_players set duels = true where user_id in (me, them) and not duels;
      end if;
    end if;
  end if;
  select * into today from public.rank_days where user_id = me and day = d;
  if not found then today.pages := 0; today.listen := 0; today.lessons := 0; today.adhkar := 0; today.dhikr := 0; end if;
  return jsonb_build_object('on', true, 'last', last,
    'quests', case when r.id is null then null else (select jsonb_agg(jsonb_build_object('kind', q ->> 0, 'target', (q ->> 1)::int,
        'done', public.rank_duel_quest_done(today, q))) from jsonb_array_elements(public.rank_duel_quests(d)) q) end,
    'duel', case when r.id is null then null else jsonb_build_object('id', r.id, 'week', r.week, 'end', r.week + 6,
      'day', least(7, greatest(1, d - r.week + 1)),
      'me', public.rank_duel_points(me, r.week),
      'them', public.rank_duel_points(case when r.a = me then r.b else r.a end, r.week),
      'rival', (select public.rank_face(o, me) from public.rank_players o where o.user_id = case when r.a = me then r.b else r.a end)) end);
end $$;
revoke all on function public.rank_my_duel(date) from public, anon;
grant execute on function public.rank_my_duel(date) to authenticated;
