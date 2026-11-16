-- Round 4 (supabase/migrations/20261114400000_round4_storage_streaks.sql): voice-clip uploads count files; friend
-- streaks come out exactly as before (also after old days are tidied away); the tidy-up keeps 400 days of daily
-- rows and leaves every total, streak and earned invite reward as it was.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(16);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000141', 'a141@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000142', 'b142@example.com'),
  ('cccccccc-0000-0000-0000-000000000143', 'c143@example.com'),
  ('dddddddd-0000-0000-0000-000000000144', 'd144@example.com');

create function pg_temp.act_as(uid text) returns void language sql as $$
  reset role;
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  set local role authenticated;
$$;

-- 1. Uploads: 40 files a day per account, counted from the files (no rows were ever added for them).
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000141');
select lives_ok($$ insert into storage.objects (bucket_id, name, metadata)
  select 'harakat-clips', 'aaaaaaaa-0000-0000-0000-000000000141/round4clip' || g || '.pcm', '{"size": 8000}'
  from generate_series(1, 40) g $$, '40 clip files in a day upload');
select throws_ok($$ insert into storage.objects (bucket_id, name, metadata)
  values ('harakat-clips', 'aaaaaaaa-0000-0000-0000-000000000141/round4clip41.pcm', '{"size": 8000}') $$,
  '42501', null, 'the 41st is refused although no clip row was added');
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000142');
select lives_ok($$ insert into storage.objects (bucket_id, name, metadata)
  values ('harakat-clips', 'bbbbbbbb-0000-0000-0000-000000000142/round4clip1.pcm', '{"size": 8000}') $$,
  'another learner still uploads');
reset role;

-- 2. Friend streaks. The old way (walk every shared day), to compare with.
create function pg_temp.old_streak(x uuid, y uuid, d date) returns int language plpgsql as $$
declare
  mine boolean := exists (select 1 from public.rank_days where user_id = x and day = d and score > 0);
  theirs boolean := exists (select 1 from public.rank_days where user_id = y and day = d and score > 0);
  want date := case when mine and theirs then d else d - 1 end;
  n int := 0; dd date;
begin
  for dd in select p.day from public.rank_days p join public.rank_days q on q.day = p.day and q.user_id = y and q.score > 0
            where p.user_id = x and p.score > 0 and p.day <= want order by p.day desc loop
    exit when dd <> want; n := n + 1; want := want - 1;
  end loop;
  return n;
end $$;

-- A and B: both active every day for 500 days. A and C: together for 30 days, a missed day, then 450 days before it.
insert into rank_days (user_id, day, score) select 'aaaaaaaa-0000-0000-0000-000000000141', current_date - g, 20 from generate_series(0, 500) g;
insert into rank_days (user_id, day, score) select 'bbbbbbbb-0000-0000-0000-000000000142', current_date - g, 10 from generate_series(1, 500) g;
insert into rank_days (user_id, day, score) select 'cccccccc-0000-0000-0000-000000000143', current_date - g, 10
  from generate_series(0, 482) g where g <> 31;
insert into rank_friends (a, b) values
  ('aaaaaaaa-0000-0000-0000-000000000141', 'bbbbbbbb-0000-0000-0000-000000000142'),
  ('aaaaaaaa-0000-0000-0000-000000000141', 'cccccccc-0000-0000-0000-000000000143');
insert into rank_players (user_id, name, total) values
  ('aaaaaaaa-0000-0000-0000-000000000141', 'A', 10020), ('bbbbbbbb-0000-0000-0000-000000000142', 'B', 5000)
  on conflict (user_id) do update set total = excluded.total;

create temp table want_streaks as
  select x, y, d, pg_temp.old_streak(x, y, d) n from (values
    ('aaaaaaaa-0000-0000-0000-000000000141'::uuid, 'bbbbbbbb-0000-0000-0000-000000000142'::uuid),
    ('bbbbbbbb-0000-0000-0000-000000000142'::uuid, 'aaaaaaaa-0000-0000-0000-000000000141'::uuid),
    ('aaaaaaaa-0000-0000-0000-000000000141'::uuid, 'cccccccc-0000-0000-0000-000000000143'::uuid)) p(x, y),
    (values (current_date), (current_date - 1), (current_date - 2), (current_date + 1)) v(d);
select is((select n from want_streaks where y = 'bbbbbbbb-0000-0000-0000-000000000142' and d = current_date), 500,
  'the old way: 500 days for A and B');
select is((select count(*)::int from want_streaks w where (rank_friend_streak(w.x, w.y, w.d) ->> 'streak')::int <> w.n), 0,
  'every streak is the same as before (first look, nothing stored)');
select is((select count(*)::int from rank_friend_streaks), 2, 'the settled part is stored once per pair');
select is((select count(*)::int from want_streaks w where (rank_friend_streak(w.x, w.y, w.d) ->> 'streak')::int <> w.n), 0,
  'and the same again from what was stored');

-- Report a new day (today, B): today now counts for A and B, exactly as the old way says.
insert into rank_days (user_id, day, score) values ('bbbbbbbb-0000-0000-0000-000000000142', current_date, 10);
select is((rank_friend_streak('aaaaaaaa-0000-0000-0000-000000000141', 'bbbbbbbb-0000-0000-0000-000000000142', current_date) ->> 'streak')::int,
  pg_temp.old_streak('aaaaaaaa-0000-0000-0000-000000000141', 'bbbbbbbb-0000-0000-0000-000000000142', current_date),
  'a day reported after storing still counts');
select is((rank_friend_streak('aaaaaaaa-0000-0000-0000-000000000141', 'bbbbbbbb-0000-0000-0000-000000000142', current_date) ->> 'streak')::int,
  501, 'A and B: 501 days with today');

-- D was invited 460 days ago and had 11 days with points then (all older than 400 days); never claimed.
insert into rank_days (user_id, day, score) select 'dddddddd-0000-0000-0000-000000000144', current_date - g, 10 from generate_series(440, 450) g;
insert into rank_invites (invitee, inviter, at) values
  ('dddddddd-0000-0000-0000-000000000144', 'aaaaaaaa-0000-0000-0000-000000000141', now() - interval '460 days');
select is(rank_invite_days('dddddddd-0000-0000-0000-000000000144', now() - interval '460 days'), 11, 'the invite is earned');

-- What the old way says now, to compare after the tidy-up.
create temp table want_after as select x, y, d, pg_temp.old_streak(x, y, d) n from want_streaks;

-- 3. The tidy-up: only days older than 400 go; streaks, totals and the earned invite stay.
delete from rank_friend_streaks; -- as if nobody had looked at Friends: the tidy-up stores them itself first
select is((tidy_db() ->> 'days')::int, 100 + 100 + 82 + 11, 'days older than 400 go (100 of A, 100 of B, 82 of C, 11 of D)');
select is((select min(day) from rank_days), current_date - 400, 'day 400 stays');
select is((select count(*)::int from want_after w where (rank_friend_streak(w.x, w.y, w.d) ->> 'streak')::int <> w.n), 0,
  'every streak is still the same after the old days went');
select is((rank_friend_streak('aaaaaaaa-0000-0000-0000-000000000141', 'bbbbbbbb-0000-0000-0000-000000000142', current_date) ->> 'streak')::int,
  501, 'A and B keep all 501 days');
select is((select array_agg(total order by name) from rank_players where user_id in
    ('aaaaaaaa-0000-0000-0000-000000000141', 'bbbbbbbb-0000-0000-0000-000000000142')), array[10020, 5000], 'all-time XP is untouched');
select is(rank_invite_days('dddddddd-0000-0000-0000-000000000144', now() - interval '460 days'), 3, 'the earned invite can still be claimed');

select * from finish();
rollback;
