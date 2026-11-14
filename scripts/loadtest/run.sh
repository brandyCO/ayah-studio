#!/usr/bin/env bash
# Load test (.github/workflows/loadtest.yml): each database call the app makes at scale, hammered by many players at once
# on a local copy seeded with N players (seed.sql), then all of them mixed in the proportions phones send them.
# Usage: run.sh DB_URL [players] [clients] [seconds] [budget ms]. Writes report.md and results.json in $OUT.
set -euo pipefail
DB=$1; N=${2:-10000}; C=${3:-40}; T=${4:-20}; BUDGET=${5:-150}
OUT=${OUT:-/tmp/loadtest}; mkdir -p "$OUT/bench" "$OUT/logs"
PGBENCH=$(command -v pgbench || ls /usr/lib/postgresql/*/bin/pgbench 2>/dev/null | tail -1)
J=$(nproc); [ "$J" -gt "$C" ] && J=$C

as_player() { # name, SQL run as a random signed-in player (:i), :me = their id
  cat > "$OUT/bench/$1.sql" <<SQL
\set i random(1, $N)
begin;
select set_config('request.jwt.claims', json_build_object('sub', ('00000000-0000-0000-0000-' || lpad((:i)::text, 12, '0')), 'role', 'authenticated', 'is_anonymous', false)::text, true);
set local role authenticated;
$2;
commit;
SQL
}
ME="('00000000-0000-0000-0000-' || lpad((:i)::text, 12, '0'))::uuid"
as_player report "select public.rank_report(current_date, (:i) % 15 + 1, ((:i) % 50) * 60 + 60, (:i) % 2, (:i) % 3, 'Player ' || (:i), (:i) % 4, (:i) % 3, ((:i) % 10) * 33 + 33, now() + interval '3 days', 180)"
as_player status "select public.rank_status(current_date)"
as_player league "select public.rank_league(current_date)"
as_player my_pulse "select public.rank_my_pulse(current_date)"
as_player full_pulse "select public.rank_pulse(current_date)"
as_player friends "select public.rank_my_friends(current_date)"
as_player feats "select public.rank_feats_feed()"
as_player my_social "select public.rank_my_social(current_date)"
as_player duel "select public.rank_my_duel(current_date)"
as_player global "select public.rank_global(current_date, false, 'all')"
as_player live "select public.rank_live('read')"
as_player sync_pull "select kind, id, data, deleted, updated_at from public.user_docs where device_id is distinct from 'devX' and updated_at > now() - interval '2 hours' order by updated_at limit 500"
as_player sync_push "insert into public.user_docs (user_id, kind, id, data, device_id) values ($ME, 'state', 'kv:key' || ((:i) % 30 + 1), jsonb_build_object('v', repeat('y', 400), 'at', extract(epoch from now())::bigint), 'dev' || (:i)) on conflict (user_id, kind, id) do update set data = excluded.data, updated_at = now()"
# Learn: the path, garden and shop purchases sync as one bigger document; flawless lessons; the voice check's
# stats (rolled back, so the seeded day stays the same size) and the voice-clip upload check.
as_player learn_sync "insert into public.user_docs (user_id, kind, id, data, device_id) values ($ME, 'state', 'garden', jsonb_build_object('v', repeat('g', 12000), 'at', extract(epoch from now())::bigint), 'dev' || (:i)) on conflict (user_id, kind, id) do update set data = excluded.data, updated_at = now()"
as_player learn_flawless "select public.rank_flawless(current_date, 1)"
as_player learn_clip_check "select public.harakat_can_upload()"
cat > "$OUT/bench/learn_follow_stat.sql" <<SQL
\set i random(1, $N)
begin;
set local role anon;
select public.follow_stat(jsonb_build_object('engine', 'android', 'words', 40, 'untapped', 1, 'added', 0, 'unclear', 2), 'lt' || (:i));
rollback;
SQL
# Shop: gifts waiting, the lamp wall, wearing a look / a lamp of Light.
as_player shop_gifts "select public.rank_my_gifts()"
as_player shop_lamp_wall "select public.rank_lamp_wall(80)"
as_player shop_look "select public.rank_set_look((:i) % 24, false, 0)"
as_player shop_lamp "select public.rank_set_lamp((:i) % 5)"
# What the edge proxy asks (anonymously, once per league / player every 8 s); the ids are looked up first.
cat > "$OUT/bench/league_pulse.sql" <<SQL
\set i random(1, $N)
select public.rank_league_pulse(w.league, current_date) from public.rank_weeks w where w.user_id = $ME and w.league is not null order by w.week desc limit 1;
SQL
cat > "$OUT/bench/player_pulse.sql" <<SQL
\set i random(1, $N)
select public.rank_player_pulse(array(select p.pid from public.rank_friends f join public.rank_players p on p.user_id = case when f.a = $ME then f.b else f.a end where f.a = $ME or f.b = $ME limit 50), current_date);
SQL

# How often phones send each call, roughly (per player-minute while the app is open; Ranks open part of the time).
declare -A WEIGHT=( [report]=6 [status]=2 [league]=2 [my_pulse]=2 [full_pulse]=1 [friends]=1 [feats]=1 [my_social]=2 [duel]=1
  [global]=1 [live]=3 [sync_pull]=4 [sync_push]=4 [league_pulse]=3 [player_pulse]=3
  [learn_sync]=2 [learn_flawless]=1 [learn_clip_check]=1 [learn_follow_stat]=1 [shop_gifts]=1 [shop_lamp_wall]=1 [shop_look]=1 [shop_lamp]=1 )

echo "| Call | Calls a second | Average | 95 % within | Slowest |" > "$OUT/report.md"
echo "|---|---:|---:|---:|---:|" >> "$OUT/report.md"
echo "{" > "$OUT/results.json"
fail=0
stat() { # log files → "avg p95 max" in ms
  cat "$@" | awk '{print $3/1000}' | sort -n | awk '{a[NR]=$1; s+=$1} END {if (NR==0) {print "0 0 0"; exit} i=int(NR*0.95); if (i<1) i=1; printf "%.1f %.1f %.1f\n", s/NR, a[i], a[NR]}'
}
run() { # name, pgbench args…
  local name=$1; shift
  rm -f "$OUT/logs/$name".*
  local o; o=$("$PGBENCH" -n -c "$C" -j "$J" -T "$T" -l --log-prefix="$OUT/logs/$name" "$@" "$DB" 2>&1) || { echo "::error::$name failed"; echo "$o" | tail -20; fail=1; return; }
  local tps; tps=$(echo "$o" | grep -oE 'tps = [0-9.]+' | head -1 | cut -d' ' -f3)
  read -r avg p95 max < <(stat "$OUT/logs/$name".*)
  printf '| %s | %.0f | %s ms | %s ms | %s ms |\n' "$name" "$tps" "$avg" "$p95" "$max" >> "$OUT/report.md"
  printf '  "%s": {"tps": %s, "avg": %s, "p95": %s, "max": %s},\n' "$name" "$tps" "$avg" "$p95" "$max" >> "$OUT/results.json"
  if awk -v a="$avg" -v b="$BUDGET" 'BEGIN { exit !(a > b) }'; then echo "::warning::$name averages $avg ms (budget $BUDGET ms)"; echo "$name" >> "$OUT/over.txt"; fi
  echo "$name: $tps/s, avg $avg ms, p95 $p95 ms"
}
rm -f "$OUT/over.txt"
for f in "$OUT"/bench/*.sql; do run "$(basename "$f" .sql)" -f "$f"; done
mix=(); for k in "${!WEIGHT[@]}"; do mix+=(-f "$OUT/bench/$k.sql@${WEIGHT[$k]}"); done
run mixed "${mix[@]}"
echo '  "players": '"$N"', "clients": '"$C"', "seconds": '"$T"'' >> "$OUT/results.json"
echo "}" >> "$OUT/results.json"
{
  echo
  echo "$N players on a local copy of the database (seeded by scripts/loadtest/seed.sql), $C at once for $T s per call, on a GitHub runner ($(nproc) CPUs)."
  echo "\"All mixed\" sends every call in the proportions phones use; its calls a second is roughly what this database can serve."
} >> "$OUT/report.md"
exit $fail
