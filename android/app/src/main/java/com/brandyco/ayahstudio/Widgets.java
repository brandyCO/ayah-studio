package com.brandyco.ayahstudio;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import java.util.Date;
import org.json.JSONObject;

/**
 * Redraws the streak, tasbih and prayer widgets, keeps the lock-screen line "Next: Asr 15:42" (a
 * silent notification that stays, with a countdown) and sets an alarm for the next prayer so both
 * move on by themselves.
 */
final class Widgets {
    static final String CHANNEL = "prayer_next";
    static final int NOTE_ID = 7400;

    private Widgets() {}

    static void refreshAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = m.getAppWidgetIds(new ComponentName(c, StreakWidget.class));
        if (ids.length > 0) StreakWidget.draw(c, m, ids);
        ids = m.getAppWidgetIds(new ComponentName(c, TasbihWidget.class));
        if (ids.length > 0) TasbihWidget.draw(c, m, ids);
        ids = m.getAppWidgetIds(new ComponentName(c, PrayerWidget.class));
        if (ids.length > 0) PrayerWidget.draw(c, m, ids);
        DailyAyahWidget.refresh(c);
        prayerTick(c);
    }

    static PendingIntent openApp(Context c, String hash, int code) {
        Intent open = new Intent(c, MainActivity.class);
        open.setAction(Intent.ACTION_VIEW);
        open.putExtra(MainActivity.EXTRA_HASH, hash);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(c, code, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static String time(Context c, long ms) {
        return android.text.format.DateFormat.getTimeFormat(c).format(new Date(ms));
    }

    /** The lock-screen line and the alarm for the next prayer (called at each prayer and on update). */
    static void prayerTick(Context c) {
        JSONObject data = WidgetStore.data(c);
        long now = System.currentTimeMillis();
        long[] next = WidgetStore.nextPrayer(data, now);
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        Intent tick = new Intent(c, PrayerAlarm.class).setAction(PrayerAlarm.ACTION);
        PendingIntent pi = PendingIntent.getBroadcast(c, 7401, tick, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        if (am != null) am.cancel(pi);
        boolean anyPrayerWidget = AppWidgetManager.getInstance(c).getAppWidgetIds(new ComponentName(c, PrayerWidget.class)).length > 0;
        boolean lock = data.optBoolean("lockScreen", false);
        if (next == null || (!lock && !anyPrayerWidget)) {
            if (nm != null) nm.cancel(NOTE_ID);
            return;
        }
        // Inexact is fine (no special permission): at the latest a few minutes after the prayer.
        if (am != null) am.setAndAllowWhileIdle(AlarmManager.RTC, next[1] + 1000, pi);
        if (nm == null) return;
        if (!lock) {
            nm.cancel(NOTE_ID);
            return;
        }
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, WidgetStore.str(data, "prayerChannel", "Next prayer"), NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            ch.setSound(null, null);
            ch.enableVibration(false);
            ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(ch);
        }
        String name = WidgetStore.prayerName(data, (int) next[0]);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CHANNEL) : new Notification.Builder(c);
        b.setSmallIcon(R.drawable.ic_stat_crescent)
            .setContentTitle(name + " · " + time(c, next[1]))
            .setContentText(WidgetStore.str(data, "next", "Next"))
            .setWhen(next[1])
            .setShowWhen(true)
            .setUsesChronometer(true)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setContentIntent(openApp(c, "#/me", 7402));
        if (Build.VERSION.SDK_INT >= 24) b.setChronometerCountDown(true);
        if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_LOW);
        try {
            nm.notify(NOTE_ID, b.build());
        } catch (SecurityException ignored) {
            // Notifications not allowed (Android 13+): the app asks before turning this on.
        }
    }
}
