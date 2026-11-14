# Backups and uptime

## Daily database backup

`.github/workflows/backup.yml` runs every night at 01:15 UTC (and from Actions → Database backup → Run workflow).

- It dumps the schemas `public` (all app data: synced progress, Ranks, reflections, reports…) and `auth` (accounts)
  with `pg_dump`, through the same session pooler the migrations use.
- The files users keep in Supabase Storage (the voice clips people chose to share for the harakat check) are
  downloaded too, into `files.tar.enc`; `files.txt` holds how many, and the run checks they are all there.
  This needs the repo secret `SUPABASE_SERVICE_KEY` (Supabase → Project Settings → API keys → `service_role`).
  Without it the database is still backed up, `files.txt` says `skipped` and the run shows a warning.
- Both are encrypted (AES-256) with the repo secret `BACKUP_KEY`, because the repository is public. Nothing leaves
  the runner unencrypted. `counts.txt` beside them holds only row counts per table, `key.txt` the name of the key used.
  Until `BACKUP_KEY` is added, the database password is used (`key.txt` then says `SUPABASE_DB_PASSWORD`).
- **Owner, once:** make a long random password, keep it in your password manager (you need it to restore), and add
  it as the repo secret `BACKUP_KEY` (Settings → Secrets and variables → Actions). From then on, changing the
  database password never locks the backups.
- The same run restores the backup into an empty Postgres 17 and checks that every table has the same number of
  rows. A backup that would not restore makes the run fail.
- Each backup is kept 30 days as the artifact `db-backup-YYYY-MM-DD` on the run's page.
- If a run fails, an issue "Database backup failed" is opened and assigned to the owner (GitHub e-mails it).

Not in it: the reel videos (never uploaded).

### Restoring

1. Actions → Database backup → the run of the day you want → download `db-backup-YYYY-MM-DD` and unzip it.
2. Decrypt it with the key `key.txt` names (`BACKUP_KEY` from your password manager, or for older backups the
   database password from Supabase → Project Settings → Database):

   ```
   openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in db.dump.enc -out db.dump
   openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in files.tar.enc | tar -xf -   # the stored files
   ```

   The files come out as `harakat-clips/{user}/{name}.pcm`; upload them back into the same bucket at the same paths.

3. Look inside before touching the live database: restore into a scratch database first, for example a local one,
   `pg_restore -d postgresql://localhost/scratch --no-owner --no-privileges db.dump`.
4. To put back one user's data or one table, copy those rows from the scratch database. A full restore over the
   live database is a last resort and should be done with the owner, never by a script.

`scripts/db-backup.sh dump|verify|files|checkfiles` is what the workflow runs; it can be run by hand the same way.

## Uptime alerts

`.github/workflows/uptime.yml` checks every 10 minutes, from GitHub:

| Check | What |
|---|---|
| Web app | `https://brandyco.github.io/ayah-studio/` answers with the app |
| Sign-in | Supabase Auth health |
| Database | a public read-only function (`relight_preview`) answers |
| Edge proxy | `/config` on the Cloudflare worker (when the repo variable `PIXABAY_PROXY` is set) |

Each check is tried three times, 30 s apart. If one is still down, an issue "Down: …" is opened and assigned to
the owner, which GitHub sends by e-mail and to the GitHub phone app. When everything answers again it is closed
with the time it came back. GitHub runs scheduled checks on a best-effort basis, so an alert can come a few
minutes late.
