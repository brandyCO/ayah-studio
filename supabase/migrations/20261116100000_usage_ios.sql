-- The iPhone app (docs/ios.md) counts itself as platform `p:ios` in the anonymous usage counts (src/usage.ts).
-- Same function as round 3 (20261114300000_round3_lighter.sql), with ios among the known platforms.
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
    where x ~ '^(d0:)?((v|ev):[a-z0-9-]{1,30}|age:[0-9+-]{1,6}|p:(android|ios|web)|l:[a-z]{2})$'
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
