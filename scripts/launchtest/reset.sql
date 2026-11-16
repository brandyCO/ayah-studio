-- Launch test (.github/workflows/launchtest.yml): clears the previous run's test players from the STAGING project.
-- Only rows made by seed.sql: the test ids 00000000-0000-0000-0000-…, the seeded voice stats and lamp names.
-- Never run against the live project (the workflow only knows the staging ref and password).
\set ON_ERROR_STOP on
delete from public.follow_stats where install like 'seed%' or install like 'lt%';
delete from public.rank_lamps where for_name ~ '^Name[0-9]+$';
delete from auth.users where id::text like '00000000-0000-0000-0000-%';
delete from public.rank_leagues l where not exists (select 1 from public.rank_weeks w where w.league = l.id);
