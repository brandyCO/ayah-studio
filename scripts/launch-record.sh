#!/usr/bin/env bash
# Cold-starts the app on the emulator and records its launch (used by .github/workflows/launch-check.yml).
# Usage: scripts/launch-record.sh APK OUTDIR
set -x
APK=$1; OUT=$2; PKG=com.brandyco.ayahstudio
mkdir -p "$OUT"
adb wait-for-device
adb shell wm size 1080x2400
adb shell wm density 480   # 360 dp wide, like the owner's phone
adb install -r "$APK"
adb shell settings put global window_animation_scale 1
adb shell settings put global transition_animation_scale 1
adb shell settings put global animator_duration_scale 1
sleep 5
for run in 1 2; do
  adb shell am force-stop $PKG
  adb logcat -c
  adb shell "screenrecord --time-limit 12 --bit-rate 6000000 /sdcard/launch$run.mp4" &
  rec=$!
  sleep 1.5
  adb shell monkey -p $PKG -c android.intent.category.LAUNCHER 1
  for i in $(seq 1 16); do adb exec-out screencap -p > "$OUT/run$run-frame$(printf %02d $i).png"; sleep 0.4; done
  wait $rec
  sleep 1
  adb pull /sdcard/launch$run.mp4 "$OUT/launch$run.mp4"
  adb logcat -d | grep -E "AyahOpening|AndroidRuntime|FATAL" > "$OUT/log$run.txt"
  sleep 4
done
exit 0
