-- Friend challenge (owner request 2026-11-09): one player challenges one friend by an invite link to a week
-- of pages and listening. The week is the 7 days from the day the friend accepts; points are the days'
-- checked pages (10 each) and minutes of recitation (2 each) from rank_days, so nothing new is reported.
-- When it is over (two days after its last day, for every time zone) each side claims Light once:
-- the winner 100, a tie 60 each, the other 30. Google accounts only; nobody reads the table.

create table if not exists public.rank_challenges (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  a uuid not null references auth.users (id) on delete cascade,
  b uuid references auth.users (id) on delete cascade,
  start date,
  a_claimed boolean not null default false,
  b_claimed boolean not null default false,
  created_at timestamptz not null default now(),
  check (b is null or b <> a)
);
create index if not exists rank_challenges_a on public.rank_challenges (a);
create index if not exists rank_challenges_b on public.rank_challenges (b);
alter table public.rank_challenges enable row level security;
revoke all on table public.rank_challenges from anon, authenticated;

-- A player's challenge points over the challenge's 7 days.
create or replace function public.rank_challenge_points(who uuid, s date) returns int
language sql stable set search_path = '' as $$
  select coalesce(sum(pages * 10 + (listen / 60) * 2), 0)::int
  from public.rank_days where user_id = who and day between s and s + 6;
$$;

create or replace function public.rank_challenge_create() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  c text;
  i uuid;
begin
  if not exists (select 1 from public.rank_players where user_id = me) then
    raise exception 'Read or listen once to join the ranks first' using errcode = '22023';
  end if;
  if (select count(*) from public.rank_challenges where a = me and created_at > now() - interval '7 days') >= 3 then
    raise exception 'You can start 3 challenges a week' using errcode = '22023';
  end if;
  if (select count(*) from public.rank_challenges where (a = me or b = me)
      and (start is null or start >= current_date - 8)) >= 10 then
    raise exception 'You have 10 challenges going' using errcode = '22023';
  end if;
  loop
    select string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', 1 + get_byte(x, k) % 31, 1), '' order by k) into c
      from (select decode(replace(gen_random_uuid()::text, '-', ''), 'hex') x) u, generate_series(0, 7) k;
    exit when not exists (select 1 from public.rank_challenges where code = c);
  end loop;
  insert into public.rank_challenges (code, a) values (c, me) returning id into i;
  return jsonb_build_object('id', i, 'code', c);
end $$;

-- What an invite shows (visitors too): who sent it, and whether it can still be taken.
create or replace function public.rank_challenge_preview(ch_code text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('from', public.rank_face(p, coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)),
    'taken', c.b is not null, 'expired', c.b is null and c.created_at < now() - interval '7 days',
    'mine', c.a = auth.uid(), 'joined', c.b = auth.uid())
  from public.rank_challenges c join public.rank_players p on p.user_id = c.a
  where c.code = lower(ch_code);
$$;

-- The friend accepts on their own day `d`: the week runs d .. d + 6.
create or replace function public.rank_challenge_accept(ch_code text, d date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  r public.rank_challenges;
begin
  perform public.rank_check_day(d);
  select * into r from public.rank_challenges where code = lower(ch_code) for update;
  if not found then raise exception 'This challenge is not valid' using errcode = 'P0002'; end if;
  if r.b = me then return r.id; end if;
  if r.a = me then raise exception 'Send this link to a friend' using errcode = '22023'; end if;
  if r.b is not null then raise exception 'Someone took this challenge already' using errcode = '22023'; end if;
  if r.created_at < now() - interval '7 days' then raise exception 'This challenge has ended' using errcode = '22023'; end if;
  if not exists (select 1 from public.rank_players where user_id = me) then
    raise exception 'Read or listen once to join the ranks first' using errcode = '22023';
  end if;
  if (select count(*) from public.rank_challenges where (a = me or b = me)
      and (start is null or start >= current_date - 8)) >= 10 then
    raise exception 'You have 10 challenges going' using errcode = '22023';
  end if;
  update public.rank_challenges set b = me, start = d where id = r.id;
  return r.id;
end $$;

-- My challenges (open invites, running and finished in the last 4 weeks), newest first.
create or replace function public.rank_my_challenges(d date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := public.rank_me();
begin
  perform public.rank_check_day(d);
  return coalesce((
    select jsonb_agg(x order by created_at desc) from (
      select c.created_at, jsonb_build_object(
        'id', c.id, 'code', case when c.a = me and c.b is null then c.code end,
        'start', c.start, 'end', c.start + 6,
        'waiting', c.b is null, 'expired', c.b is null and c.created_at < now() - interval '7 days',
        'day', case when c.start is not null then least(7, greatest(1, d - c.start + 1)) end,
        'over', c.start is not null and current_date > c.start + 7,
        'claimed', case when c.a = me then c.a_claimed else c.b_claimed end,
        'me', case when c.start is not null then public.rank_challenge_points(me, c.start) end,
        'them', case when c.start is not null then public.rank_challenge_points(case when c.a = me then c.b else c.a end, c.start) end,
        'friend', case when c.b is not null then public.rank_face(o, me) end) x
      from public.rank_challenges c
      left join public.rank_players o on o.user_id = case when c.a = me then c.b else c.a end
      where (c.a = me or c.b = me)
        and (c.start >= d - 28 or (c.start is null and c.created_at > now() - interval '14 days'))
      order by c.created_at desc limit 20) y), '[]'::jsonb);
end $$;

-- Once it is over: the Light, once for each side (null when claimed already or not over).
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
  if not found or r.b is null or current_date <= r.start + 7 then return null; end if;
  if (r.a = me and r.a_claimed) or (r.b = me and r.b_claimed) then return null; end if;
  mine := public.rank_challenge_points(me, r.start);
  theirs := public.rank_challenge_points(case when r.a = me then r.b else r.a end, r.start);
  res := case when mine > theirs then 'won' when mine = theirs then 'tie' else 'lost' end;
  if r.a = me then update public.rank_challenges set a_claimed = true where id = ch;
  else update public.rank_challenges set b_claimed = true where id = ch; end if;
  return jsonb_build_object('result', res, 'me', mine, 'them', theirs,
    'light', case res when 'won' then 100 when 'tie' then 60 else 30 end);
end $$;

-- The sender can take back an invite nobody took.
create or replace function public.rank_challenge_cancel(ch uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.rank_me();
begin
  delete from public.rank_challenges where id = ch and a = me and b is null;
end $$;

revoke all on function public.rank_challenge_points(uuid, date) from public, anon, authenticated;
revoke all on function public.rank_challenge_create() from public, anon;
revoke all on function public.rank_challenge_preview(text) from public;
revoke all on function public.rank_challenge_accept(text, date) from public, anon;
revoke all on function public.rank_my_challenges(date) from public, anon;
revoke all on function public.rank_challenge_claim(uuid) from public, anon;
revoke all on function public.rank_challenge_cancel(uuid) from public, anon;
grant execute on function public.rank_challenge_create() to authenticated;
grant execute on function public.rank_challenge_preview(text) to anon, authenticated;
grant execute on function public.rank_challenge_accept(text, date) to authenticated;
grant execute on function public.rank_my_challenges(date) to authenticated;
grant execute on function public.rank_challenge_claim(uuid) to authenticated;
grant execute on function public.rank_challenge_cancel(uuid) to authenticated;
