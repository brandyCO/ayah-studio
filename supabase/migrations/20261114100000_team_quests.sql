-- Team quests (front-end backlog 2026-11-13): a friend challenge where both work towards one shared goal instead of
-- racing. Same kinds, same 7 days from the friend's yes, same limits; `goal` set = a team quest. The chest: 100 Light
-- each when the goal was reached together, else 30.
alter table public.rank_challenges add column if not exists goal int;
alter table public.rank_challenges drop constraint if exists rank_challenges_goal_check;
alter table public.rank_challenges add constraint rank_challenges_goal_check check (goal is null or goal between 1 and 20000);

create or replace function public.rank_challenge_team(who text, k text, g int) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  kk text := public.rank_challenge_kind(k);
  them uuid := public.rank_by_pid(who);
  c text;
  i uuid;
begin
  if g is null or g < 1 or g > 20000 then raise exception 'Pick a goal' using errcode = '22023'; end if;
  if them is null or not exists (select 1 from public.rank_friends where a = least(me, them) and b = greatest(me, them)) then
    raise exception 'You can challenge your friends' using errcode = '22023';
  end if;
  if exists (select 1 from public.rank_challenges where ((a = me and b = them) or (a = them and b = me))
      and (start is null and created_at > now() - interval '7 days' or start >= current_date - 6)) then
    raise exception 'You already have a challenge with them' using errcode = '22023';
  end if;
  perform public.rank_challenge_room(me);
  loop
    select string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', 1 + get_byte(x, n) % 31, 1), '' order by n) into c
      from (select decode(replace(gen_random_uuid()::text, '-', ''), 'hex') x) u, generate_series(0, 7) n;
    exit when not exists (select 1 from public.rank_challenges where code = c);
  end loop;
  insert into public.rank_challenges (code, a, b, kind, goal) values (c, me, them, kk, g) returning id into i;
  return i;
end $$;
revoke all on function public.rank_challenge_team(text, text, int) from public, anon;
grant execute on function public.rank_challenge_team(text, text, int) to authenticated;

-- My challenges: as before, plus the team goal.
create or replace function public.rank_my_challenges(d date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := public.rank_me();
begin
  perform public.rank_check_day(d);
  return coalesce((
    select jsonb_agg(x order by created_at desc) from (
      select c.created_at, jsonb_build_object(
        'id', c.id, 'code', case when c.a = me and c.b is null then c.code end, 'kind', c.kind, 'goal', c.goal,
        'start', c.start, 'end', c.start + 6,
        'waiting', c.b is null, 'expired', c.start is null and c.created_at < now() - interval '7 days',
        'asked', c.b is not null and c.start is null and c.a = me,
        'incoming', c.b = me and c.start is null,
        'day', case when c.start is not null then least(7, greatest(1, d - c.start + 1)) end,
        'over', c.start is not null and current_date > c.start + 7,
        'claimed', case when c.a = me then c.a_claimed else c.b_claimed end,
        'me', case when c.start is not null then public.rank_challenge_points(me, c.start, c.kind) end,
        'them', case when c.start is not null then public.rank_challenge_points(case when c.a = me then c.b else c.a end, c.start, c.kind) end,
        'friend', case when c.b is not null then public.rank_face(o, me) end) x
      from public.rank_challenges c
      left join public.rank_players o on o.user_id = case when c.a = me then c.b else c.a end
      where (c.a = me or c.b = me)
        and (c.start >= d - 28 or (c.start is null and c.created_at > now() - interval '14 days'))
      order by c.created_at desc limit 20) y), '[]'::jsonb);
end $$;

create or replace function public.rank_challenge_claim(ch uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  r public.rank_challenges;
  mine int;
  theirs int;
  res text;
begin
  select * into r from public.rank_challenges where id = ch and (a = me or b = me) for update;
  if not found or r.b is null or r.start is null or current_date <= r.start + 7 then return null; end if;
  if (r.a = me and r.a_claimed) or (r.b = me and r.b_claimed) then return null; end if;
  mine := public.rank_challenge_points(me, r.start, r.kind);
  theirs := public.rank_challenge_points(case when r.a = me then r.b else r.a end, r.start, r.kind);
  res := case when r.goal is not null then (case when mine + theirs >= r.goal then 'reached' else 'short' end)
    when mine > theirs then 'won' when mine = theirs then 'tie' else 'lost' end;
  if r.a = me then update public.rank_challenges set a_claimed = true where id = ch;
  else update public.rank_challenges set b_claimed = true where id = ch; end if;
  return jsonb_build_object('result', res, 'me', mine, 'them', theirs, 'goal', r.goal,
    'light', case res when 'won' then 100 when 'reached' then 100 when 'tie' then 60 else 30 end);
end $$;
