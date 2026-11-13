# Backups and uptime

## Daily database backup

`.github/workflows/backup.yml` runs every night at 01:15 UTC (and from Actions → Database backup → Run workflow).

- It dumps the schemas `public` (all app data: synced progress, Ranks, reflections, reports…) and `auth` (accounts)
  with `pg_dump`, through the same session pooler the migrations use.
- The dump is encrypted with the database password (`SUPABASE_DB_PASSWORD`, AES-256), because the repository is
  public. Nothing leaves the runner unencrypted. `counts.txt` beside it holds only row counts per table.
- The same run restores the backup into an empty Postgres 17 and checks that every table has the same number of
  rows. A backup that would not restore makes the run fail.
- Each backup is kept 30 days as the artifact `db-backup-YYYY-MM-DD` on the run's page.
- If a run fails, an issue "Database backup failed" is opened and assigned to the owner (GitHub e-mails it).

Not in it: files in Supabase Storage (harakat clips, which users chose to share for training) and the reel videos
(never uploaded). Storage files can be added later if they become important.

### Restoring

1. Actions → Database backup → the run of the day you want → download `db-backup-YYYY-MM-DD` and unzip it.
2. Decrypt it with the database password (Supabase → Project Settings → Database):

   ```
   openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in db.dump.enc -out db.dump
   ```

3. Look inside before touching the live database: restore into a scratch database first, for example a local one,
   `pg_restore -d postgresql://localhost/scratch --no-owner --no-privileges db.dump`.
4. To put back one user's data or one table, copy those rows from the scratch database. A full restore over the
   live database is a last resort and should be done with the owner, never by a script.

`scripts/db-backup.sh dump|verify` is what the workflow runs; it can be run by hand the same way.

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
