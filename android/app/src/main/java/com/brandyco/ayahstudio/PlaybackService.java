package com.brandyco.ayahstudio;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;

/**
 * Keeps the recitation playing when the user leaves the app or the screen goes off (owner report
 * 2026-11-11: Android closed the app after a while and the recitation stopped). The audio is still
 * played by the WebView (src/ui/player.ts); this foreground service of type mediaPlayback tells Android
 * the app is playing media, holds a partial wake lock and a Wi-Fi lock while it plays (the recording
 * streams), and shows the notification with previous / play-pause / next / stop.
 */
public class PlaybackService extends Service {
    static final String CHANNEL = "listening";
    static final int ID = 7302;
    static final String ACTION_SHOW = "ayahstudio.play.SHOW";
    static final String ACTION_BUTTON = "ayahstudio.play.BUTTON";
    /** Longest the locks are held in one go (renewed on every update while playing). */
    private static final long MAX_WAKE_MS = 3L * 60 * 60 * 1000;

    /** Set by PlaybackServicePlugin: a notification button was tapped ("prev", "toggle", "next", "stop"). */
    static java.util.function.Consumer<String> onButton = null;

    private PowerManager.WakeLock wake;
    private WifiManager.WifiLock wifi;
    private String title = "";
    private String text = "";
    private String channelName = "";
    private boolean playing = false;
    private String[] labels = { "Previous", "Play", "Pause", "Next", "Stop" };

    static Intent intent(Context c, String action) {
        return new Intent(c, PlaybackService.class).setAction(action);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_BUTTON.equals(action)) {
            String b = intent.getStringExtra("b");
            java.util.function.Consumer<String> f = onButton;
            if (f != null && b != null) f.accept(b);
            if ("stop".equals(b) && f == null) stopSelf();
            return START_NOT_STICKY;
        }
        if (intent != null) {
            title = orEmpty(intent.getStringExtra("title"));
            text = orEmpty(intent.getStringExtra("text"));
            channelName = orEmpty(intent.getStringExtra("channel"));
            playing = intent.getBooleanExtra("playing", false);
            String[] l = intent.getStringArrayExtra("labels");
            if (l != null && l.length == 5) labels = l;
        }
        channel();
        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK : 0;
        ServiceCompat.startForeground(this, ID, build(), type);
        locks(playing);
        return START_NOT_STICKY;
    }

    private void locks(boolean on) {
        if (on) {
            if (wake == null) {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ayahstudio:listen");
                wake.setReferenceCounted(false);
            }
            wake.acquire(MAX_WAKE_MS);
            try {
                if (wifi == null) {
                    WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                    if (wm != null) {
                        wifi = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "ayahstudio:listen");
                        wifi.setReferenceCounted(false);
                    }
                }
                if (wifi != null && !wifi.isHeld()) wifi.acquire();
            } catch (RuntimeException ignored) { /* no Wi-Fi lock permission or service */ }
        } else {
            if (wake != null && wake.isHeld()) wake.release();
            if (wifi != null && wifi.isHeld()) wifi.release();
        }
    }

    private PendingIntent button(String b, int code) {
        return PendingIntent.getService(this, code, intent(this, ACTION_BUTTON).putExtra("b", b),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private Notification build() {
        PendingIntent open = PendingIntent.getActivity(this, 0,
            new Intent(this, AppActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_crescent)
            .setContentTitle(title)
            .setContentText(text)
            .setOngoing(playing)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setShowWhen(false)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setContentIntent(open)
            .setDeleteIntent(button("stop", 5))
            .addAction(0, labels[0], button("prev", 1))
            .addAction(0, playing ? labels[2] : labels[1], button("toggle", 2))
            .addAction(0, labels[3], button("next", 3))
            .addAction(0, labels[4], button("stop", 4))
            .build();
    }

    private void channel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        NotificationChannel had = nm.getNotificationChannel(CHANNEL);
        if (had != null) {
            // The name follows the app's language (shown in the phone's notification settings).
            if (!channelName.isEmpty() && !channelName.contentEquals(had.getName())) {
                had.setName(channelName);
                nm.createNotificationChannel(had);
            }
            return;
        }
        NotificationChannel ch = new NotificationChannel(CHANNEL, channelName.isEmpty() ? "Listening" : channelName, NotificationManager.IMPORTANCE_LOW);
        ch.setSound(null, null);
        ch.enableVibration(false);
        ch.setShowBadge(false);
        nm.createNotificationChannel(ch);
    }

    @Override
    public void onDestroy() {
        locks(false);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private static String orEmpty(String s) { return s == null ? "" : s; }
}
