-- One line every call: what the staging database is doing right now (run every 10 s during the test).
select to_char(now(), 'HH24:MI:SS') as at,
  count(*) as conns,
  count(*) filter (where state = 'active') as active,
  count(*) filter (where state = 'idle in transaction') as idle_tx,
  count(*) filter (where wait_event_type = 'Lock') as lock_waits,
  coalesce(round(extract(epoch from max(now() - query_start) filter (where state = 'active' and backend_type = 'client backend'))::numeric, 1), 0) as longest_s,
  (select string_agg(a || ':' || n, ' ') from (select coalesce(application_name, '?') a, count(*) n from pg_stat_activity
     where backend_type = 'client backend' group by 1 order by 2 desc limit 4) x) as apps,
  (select string_agg(w || ':' || n, ' ') from (select wait_event_type || '/' || wait_event w, count(*) n from pg_stat_activity
     where state = 'active' and wait_event is not null group by 1 order by 2 desc limit 4) y) as waits
from pg_stat_activity;
