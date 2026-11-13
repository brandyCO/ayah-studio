#!/usr/bin/env bash
# Daily backup of everything users have in the database (owner request 2026-11-13: "nothing ever lost").
# Used by .github/workflows/backup.yml; steps to restore by hand in docs/backup.md.
#
#   db-backup.sh dump   DB_URL OUT_DIR   pg_dump of the schemas public + auth (custom format), encrypted with
#                                        BACKUP_KEY (AES-256, PBKDF2), plus counts.txt (rows per table, no content)
#   db-backup.sh verify DB_URL IN_DIR    decrypt, restore into the empty database DB_URL and compare the rows of
#                                        every table with counts.txt (fails on any difference)
#
# The repo is public, so a backup only ever leaves the runner encrypted. BACKUP_KEY is the database password
# (the secret SUPABASE_DB_PASSWORD): anyone who can read a backup could already read the database itself.
set -euo pipefail
cmd=${1:?dump or verify}; url=${2:?database url}; dir=${3:?folder}
: "${BACKUP_KEY:?BACKUP_KEY is not set}"
SCHEMAS=(-n public -n auth)

counts() {
  psql "$1" -X -A -t -v ON_ERROR_STOP=1 <<'SQL'
select format('select %L || '' '' || count(*) from %I.%I;', n.nspname || '.' || c.relname, n.nspname, c.relname)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p') and n.nspname in ('public', 'auth') and not c.relispartition
  order by 1
\gexec
SQL
}

case "$cmd" in
  dump)
    mkdir -p "$dir"
    counts "$url" | sort > "$dir/counts.txt"
    pg_dump "$url" -Fc --no-owner --no-privileges "${SCHEMAS[@]}" \
      | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_KEY -out "$dir/db.dump.enc"
    echo "Backed up $(wc -l < "$dir/counts.txt") tables, $(awk '{s += $2} END {print s}' "$dir/counts.txt") rows, $(du -h "$dir/db.dump.enc" | cut -f1) encrypted."
    ;;
  verify)
    openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_KEY -in "$dir/db.dump.enc" -out /tmp/db.dump
    # Supabase's own roles, so the policies and grants in the dump have someone to name.
    psql "$url" -X -q <<'SQL'
do $$ declare r text; begin
  foreach r in array array['anon', 'authenticated', 'service_role', 'supabase_auth_admin', 'supabase_admin', 'authenticator', 'dashboard_user', 'pgbouncer', 'supabase_storage_admin'] loop
    if not exists (select 1 from pg_roles where rolname = r) then execute format('create role %I', r); end if;
  end loop; end $$;
create schema if not exists extensions;
SQL
    # Supabase-only extensions (pg_cron, …) cannot be created here; everything holding user data can.
    pg_restore -d "$url" --no-owner --no-privileges /tmp/db.dump 2> /tmp/restore.log || true
    grep -c 'error:' /tmp/restore.log | xargs -I{} echo "pg_restore reported {} errors (extensions and roles only Supabase has); rows are compared next."
    counts "$url" | sort > /tmp/restored.txt
    if diff "$dir/counts.txt" /tmp/restored.txt; then
      echo "Restore checked: every table has the same number of rows ($(awk '{s += $2} END {print s}' /tmp/restored.txt))."
    else
      echo "::error::The restored database differs from the backup (see above)."; grep 'error:' /tmp/restore.log | head -40; exit 1
    fi
    rm -f /tmp/db.dump
    ;;
  *) echo "unknown command $cmd"; exit 2 ;;
esac
