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

    /** The running service (main thread only). Updates go to it directly: asking Android to start the foreground
     *  service again for every ayah (as before) can be refused while the app is in the background, and a stop that
     *  overtook such a start made Android close the app ("did not then call startForeground"). */
    private static PlaybackService current = null;
    /** hide() came while the service was still starting: it stops as soon as it is in the foreground. */
    private static boolean stopWhenStarted = false;

    static boolean isRunning() { return current != null; }

    /** Main thread. True when the running service took the new title / state (no service start needed). */
    static boolean update(String title, String text, String channel, boolean playing, String[] labels) {
        PlaybackService s = current;
        if (s == null) return false;
        stopWhenStarted = false;
        s.set(title, text, channel, playing, labels);
        s.channel();
        NotificationManager nm = (NotificationManager) s.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.notify(ID, s.build());
        s.locks(playing);
        return true;
    }

    /** Main thread. Ends the service safely, also one that is still starting. */
    static void end(Context c) {
        PlaybackService s = current;
        if (s != null) {
            s.stopForeground(true);
            s.stopSelf();
        } else {
            stopWhenStarted = true; // started but not in the foreground yet (or not running: harmless, cleared on the next show)
        }
    }

    static void starting() { stopWhenStarted = false; }

    private void set(String title, String text, String channel, boolean playing, String[] labels) {
        this.title = orEmpty(title);
        this.text = orEmpty(text);
        this.channelName = orEmpty(channel);
        this.playing = playing;
        if (labels != null && labels.length == 5) this.labels = labels;
    }

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
        ExitsPlugin.catchCrashes(this);
        String action = intent == null ? null : intent.getAction();
        if (ACTION_BUTTON.equals(action)) {
            String b = intent.getStringExtra("b");
            java.util.function.Consumer<String> f = onButton;
            if (f != null && b != null) f.accept(b);
            if ("stop".equals(b) && f == null) stopSelf();
            return START_NOT_STICKY;
        }
        if (intent != null) {
            set(intent.getStringExtra("title"), intent.getStringExtra("text"), intent.getStringExtra("channel"),
                intent.getBooleanExtra("playing", false), intent.getStringArrayExtra("labels"));
        }
        channel();
        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK : 0;
        try {
            // Always first: Android requires it within seconds of the start, even when the service is about to stop.
            ServiceCompat.startForeground(this, ID, build(), type);
        } catch (RuntimeException e) {
            // Android 12+ can refuse (app in the background): end quietly instead of taking the app down.
            stopSelf();
            return START_NOT_STICKY;
        }
        current = this;
        if (stopWhenStarted) {
            stopWhenStarted = false;
            end(this);
            return START_NOT_STICKY;
        }
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
        if (current == this) current = null;
        locks(false);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private static String orEmpty(String s) { return s == null ? "" : s; }
}
