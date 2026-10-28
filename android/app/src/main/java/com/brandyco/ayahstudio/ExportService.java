package com.brandyco.ayahstudio;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;

/**
 * Keeps the app alive while a reel is exported (ExportServicePlugin, src/native.ts). The video is made
 * by the web code in the WebView; this foreground service only raises the app's priority so Android
 * does not pause or kill it when the user leaves the app, holds a partial wake lock so the CPU keeps
 * running with the screen off, and shows a progress notification with Cancel.
 */
public class ExportService extends Service {
    static final String CHANNEL = "export";
    static final int ID = 7301;
    static final String ACTION_START = "ayahstudio.export.START";
    static final String ACTION_PROGRESS = "ayahstudio.export.PROGRESS";
    static final String ACTION_CANCEL = "ayahstudio.export.CANCEL";
    /** Longest an export may hold the wake lock (a safety net; stop() releases it sooner). */
    private static final long MAX_WAKE_MS = 60L * 60 * 1000;

    /** Set by ExportServicePlugin: called when the user taps Cancel in the notification. */
    static Runnable onCancel = null;

    private PowerManager.WakeLock wake;
    private String title = "";
    private String cancelLabel = "Cancel";

    static Intent intent(Context c, String action) {
        return new Intent(c, ExportService.class).setAction(action);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_CANCEL.equals(action)) {
            Runnable r = onCancel;
            if (r != null) r.run();
            stopSelf();
            return START_NOT_STICKY;
        }
        if (ACTION_START.equals(action) || action == null) {
            if (intent != null) {
                title = orEmpty(intent.getStringExtra("title"));
                cancelLabel = orDefault(intent.getStringExtra("cancel"), "Cancel");
            }
            channel();
            Notification n = build(0);
            int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ? ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC : 0;
            ServiceCompat.startForeground(this, ID, n, type);
            if (wake == null) {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ayahstudio:export");
                wake.setReferenceCounted(false);
                wake.acquire(MAX_WAKE_MS);
            }
        } else if (ACTION_PROGRESS.equals(action)) {
            int pct = intent.getIntExtra("percent", 0);
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            nm.notify(ID, build(pct));
        }
        return START_NOT_STICKY;
    }

    private Notification build(int pct) {
        PendingIntent open = PendingIntent.getActivity(this, 0,
            new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        PendingIntent cancel = PendingIntent.getService(this, 1, intent(this, ACTION_CANCEL),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_crescent)
            .setContentTitle(title)
            .setContentText(pct + "%")
            .setProgress(100, pct, false)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setContentIntent(open)
            .addAction(0, cancelLabel, cancel)
            .build();
    }

    private void channel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Exporting reels", NotificationManager.IMPORTANCE_LOW);
        ch.setSound(null, null);
        ch.enableVibration(false);
        nm.createNotificationChannel(ch);
    }

    @Override
    public void onTimeout(int startId, int fgsType) {
        // Android 15+: the data-sync time limit (6 h) was reached. Never expected for a reel.
        stopSelf();
    }

    @Override
    public void onDestroy() {
        if (wake != null && wake.isHeld()) wake.release();
        wake = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private static String orEmpty(String s) { return s == null ? "" : s; }
    private static String orDefault(String s, String d) { return s == null || s.isEmpty() ? d : s; }
}
