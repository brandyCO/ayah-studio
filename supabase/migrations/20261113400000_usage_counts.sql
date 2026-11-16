-- Anonymous usage counts (owner request 2026-11-13: which screens are used and where people drop off, with no
-- personal data). Each phone sends, at most once a day per word, a list of short words (src/usage.ts): screens
-- (`v:learn`), actions (`ev:page`), days since install (`age:7-13`), platform (`p:android`), language (`l:ar`),
-- and on its first day the same again under `d0:`. Nothing about who sent it is stored: the function only adds 1
-- to that day's count of each word (split over 16 rows like reel_counts, so a crowd never queues on one row).
create table if not exists public.usage_daily (
  day date not null,
  key text not null check (length(key) <= 48),
  shard smallint not null default 0 check (shard between 0 and 15),
  n int not null default 0,
  primary key (day, key, shard)
);
alter table public.usage_daily enable row level security;
revoke all on public.usage_daily from anon, authenticated;

create or replace function public.usage_add(d date, keys text[]) returns int
language plpgsql security definer set search_path = '' as $$
declare
  sh smallint := floor(random() * 16)::smallint;
  k text;
  c int := 0;
begin
  -- The phone's own date: a day either side of the server's, and up to 4 days late (sent after being offline).
  if d is null or d < current_date - 5 or d > current_date + 1 then
    raise exception 'Not a day we count' using errcode = '22023';
  end if;
  if keys is null or cardinality(keys) > 100 then
    raise exception 'Too many words' using errcode = '22023';
  end if;
  for k in select distinct x from unnest(keys) x
    where x ~ '^(d0:)?((v|ev):[a-z0-9-]{1,30}|age:[0-9+-]{1,6}|p:(android|web)|l:[a-z]{2})$'
  loop
    insert into public.usage_daily as u (day, key, shard, n) values (d, k, sh, 1)
      on conflict (day, key, shard) do update set n = least(u.n + 1, 100000000);
    c := c + 1;
  end loop;
  return c;
end $$;
revoke all on function public.usage_add(date, text[]) from public;
grant execute on function public.usage_add(date, text[]) to anon, authenticated;

-- For the owner (Supabase SQL editor): one row per day and word.
create or replace view public.usage_by_day with (security_invoker = true) as
  select day, key, sum(n)::int as phones from public.usage_daily group by day, key;
revoke all on public.usage_by_day from public, anon, authenticated;

-- Where new phones stop on their first day: of the phones installed that day, how many did each thing.
create or replace view public.usage_first_day with (security_invoker = true) as
  with t as (select day, key, sum(n)::int as phones from public.usage_daily group by day, key)
  select t.day, substr(t.key, 4) as step, t.phones,
    round(100.0 * t.phones / nullif(b.phones, 0), 1) as pct_of_installs
  from t left join t b on b.day = t.day and b.key = 'age:0'
  where t.key like 'd0:%';
revoke all on public.usage_first_day from public, anon, authenticated;

-- Kept 400 days (a year's comparison), removed nightly.
create or replace function public.tidy_usage() returns int
language sql security definer set search_path = '' as $$
  with x as (delete from public.usage_daily where day < current_date - 400 returning 1) select count(*)::int from x;
$$;
revoke all on function public.tidy_usage() from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('tidy-usage', '50 2 * * *', 'select public.tidy_usage()');
  end if;
exception when others then raise notice 'tidy-usage not scheduled: %', sqlerrm;
end $$;
