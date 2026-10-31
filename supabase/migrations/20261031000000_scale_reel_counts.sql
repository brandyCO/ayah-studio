-- Scale: the anonymous reel counter (20261015000000_studio_styles_popular.sql) adds 1 to the same few
-- rows (today's reciter and ayah counts) for every exported reel, and the database has to apply those
-- one at a time. Each count is now split over 16 rows (shards) picked at random; popular_this_week()
-- already adds up every row of a key, so the numbers it shows are unchanged.
alter table public.reel_counts add column if not exists shard smallint not null default 0 check (shard between 0 and 15);
alter table public.reel_counts drop constraint if exists reel_counts_pkey;
alter table public.reel_counts add primary key (day, kind, key, shard);

create or replace function public.record_reel(reciter_id int, s int, a_from int, a_to int) returns void
language plpgsql security definer set search_path = '' as $$
declare
  d date := (now() at time zone 'utc')::date;
  k text;
  sh smallint := floor(random() * 16)::smallint;
begin
  if not public.valid_reciter(reciter_id) then raise exception 'Unknown reciter' using errcode = '22023'; end if;
  if s is null or s < 1 or s > 114 or a_from is null or a_to is null or a_from < 1
    or a_to < a_from or a_to > public.ayah_count(s) or a_to - a_from >= 10 then
    raise exception 'Not a valid selection' using errcode = '22023';
  end if;
  k := s || ':' || a_from || case when a_to > a_from then '-' || a_to else '' end;
  insert into public.reel_counts as c (day, kind, key, shard, n) values (d, 'reciter', reciter_id::text, sh, 1)
    on conflict (day, kind, key, shard) do update set n = least(c.n + 1, 1000000);
  insert into public.reel_counts as c (day, kind, key, shard, n) values (d, 'ayah', k, sh, 1)
    on conflict (day, kind, key, shard) do update set n = least(c.n + 1, 1000000);
  -- Only the last few weeks are ever needed.
  if random() < 0.02 then delete from public.reel_counts where day < d - 60; end if;
end $$;

revoke all on function public.record_reel(int, int, int, int) from public;
grant execute on function public.record_reel(int, int, int, int) to anon, authenticated;

-- popular_this_week() reads every recent row (an index on day keeps that quick as rows grow).
create index if not exists reel_counts_day on public.reel_counts (day);
