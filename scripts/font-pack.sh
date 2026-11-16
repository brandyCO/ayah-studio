#!/usr/bin/env bash
# The mushaf page fonts as a Play asset pack (round 4, 2026-11-14; src/data/fontPack.ts, android/qcf_fonts).
#   font-pack.sh DIST PACK_ASSETS   move pages 4–604 from DIST/fonts/qcf-v2 into PACK_ASSETS/qcf-v2 (pages 1–3 stay)
#   font-pack.sh check BUNDLE.aab   check the bundle: 3 pages in the app, 601 in the pack "qcf_fonts", and the sizes
set -euo pipefail
if [ "$1" = check ]; then
  aab=$2
  base=$(unzip -l "$aab" | grep -c 'base/assets/public/fonts/qcf-v2/p[0-9]*\.woff2$' || true)
  pack=$(unzip -l "$aab" | grep -c 'qcf_fonts/assets/qcf-v2/p[0-9]*\.woff2$' || true)
  baseMB=$(unzip -l "$aab" | awk '$4 ~ /^base\// { s += $1 } END { printf "%d", s / 1048576 }')
  packMB=$(unzip -l "$aab" | awk '$4 ~ /^qcf_fonts\// { s += $1 } END { printf "%d", s / 1048576 }')
  echo "App: $baseMB MB with $base page fonts; asset pack qcf_fonts (fast-follow): $packMB MB with $pack page fonts"
  if [ "$base" != 3 ] || [ "$pack" != 601 ]; then echo "::error::Expected 3 page fonts in the app and 601 in the pack."; exit 1; fi
  unzip -p "$aab" qcf_fonts/manifest/AndroidManifest.xml | grep -aq 'fast-follow' \
    || { echo "::error::The pack is not marked fast-follow."; exit 1; }
  exit 0
fi
dist=$1; out=$2/qcf-v2
mkdir -p "$out"
n=0
for f in "$dist"/fonts/qcf-v2/p*.woff2; do
  p=$(basename "$f" .woff2); p=${p#p}
  if [ "$p" -gt 3 ]; then mv "$f" "$out/"; n=$((n + 1)); fi
done
left=$(ls "$dist"/fonts/qcf-v2/p*.woff2 | wc -l)
echo "Moved $n page fonts into the pack, $left stay in the app"
[ "$n" = 601 ] && [ "$left" = 3 ] || { echo "::error::Expected 601 in the pack and 3 in the app."; exit 1; }
