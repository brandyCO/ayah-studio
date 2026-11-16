#!/usr/bin/env bash
# Daily backup of everything users have in the database (owner request 2026-11-13: "nothing ever lost").
# Used by .github/workflows/backup.yml; steps to restore by hand in docs/backup.md.
#
#   db-backup.sh dump   DB_URL OUT_DIR   pg_dump of the schemas public + auth (custom format), encrypted with
#                                        BACKUP_KEY (AES-256, PBKDF2), plus counts.txt (rows per table, no content)
#   db-backup.sh verify DB_URL IN_DIR    decrypt, restore into the empty database DB_URL and compare the rows of
#                                        every table with counts.txt (fails on any difference)
#   db-backup.sh files  DB_URL OUT_DIR   the files users keep in Storage (bucket harakat-clips: opt-in voice clips),
#                                        downloaded with SERVICE_KEY from SUPABASE_URL, packed and encrypted as
#                                        files.tar.enc, with files.txt (how many); fails if any listed file is missing
#   db-backup.sh checkfiles IN_DIR       decrypt files.tar.enc and check it holds as many files as files.txt says
#
# The repo is public, so a backup only ever leaves the runner encrypted. BACKUP_KEY is the secret BACKUP_KEY
# (its own key, so changing the database password never locks old backups); until the owner adds it, the
# database password. key.txt in each backup names which one locked it.
set -euo pipefail
cmd=${1:?dump, verify, files or checkfiles}
if [ "$cmd" = checkfiles ]; then url=; dir=${2:?folder}; else url=${2:?database url}; dir=${3:?folder}; fi
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
  files)
    : "${SERVICE_KEY:?SERVICE_KEY is not set}"; : "${SUPABASE_URL:?SUPABASE_URL is not set}"
    mkdir -p "$dir" /tmp/files
    psql "$url" -X -A -t -v ON_ERROR_STOP=1 -c "select bucket_id || '/' || name from storage.objects where bucket_id in ('harakat-clips') order by 1" > /tmp/files.list
    n=0
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      mkdir -p "/tmp/files/$(dirname "$f")"
      curl -sf --retry 3 -H "Authorization: Bearer $SERVICE_KEY" -H "apikey: $SERVICE_KEY" \
        "$SUPABASE_URL/storage/v1/object/authenticated/$f" -o "/tmp/files/$f" || { echo "::error::Could not download a stored file."; exit 1; }
      n=$((n + 1))
    done < /tmp/files.list
    echo "$n" > "$dir/files.txt"
    tar -C /tmp/files -cf - . | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_KEY -out "$dir/files.tar.enc"
    rm -rf /tmp/files /tmp/files.list
    echo "Backed up $n stored files, $(du -h "$dir/files.tar.enc" | cut -f1) encrypted."
    ;;
  checkfiles)
    want=$(cat "$dir/files.txt")
    got=$(openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_KEY -in "$dir/files.tar.enc" | tar -tf - | grep -vc '/$' || true)
    if [ "$got" = "$want" ]; then echo "Stored files checked: $got of $want."; else echo "::error::The files backup holds $got of $want files."; exit 1; fi
    ;;
  *) echo "unknown command $cmd"; exit 2 ;;
esac
