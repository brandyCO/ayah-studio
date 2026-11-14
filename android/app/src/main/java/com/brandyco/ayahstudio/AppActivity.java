package com.brandyco.ayahstudio;

import android.content.Intent;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.animation.DecelerateInterpolator;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class AppActivity extends BridgeActivity {
    static final String EXTRA_HASH = "ayahstudio.hash";
    private static String pendingHash = null;
    /** The opening (owner reports 2026-11-14: every web-drawn opening lagged on the phone, because the WebView's
     *  GPU is busiest exactly while the app starts): the system splash (the launcher icon on the splash colour) stays
     *  until the first screen is drawn underneath (LaunchPlugin.ready, at most 4 s), then leaves with a native
     *  animation, drawn by Android itself and not by the WebView. */
    private static volatile boolean firstUp = false;
    static void firstScreen() { firstUp = true; }

    /** The app address a widget tap asked for, once (DailyPlugin.takeLaunchHash). */
    static synchronized String takeHash() {
        String h = pendingHash;
        pendingHash = null;
        return h;
    }

    private static synchronized void keepHash(Intent intent) {
        String h = intent == null ? null : intent.getStringExtra(EXTRA_HASH);
        if (h != null && h.startsWith("#/")) pendingHash = h;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MediaScanPlugin.class);
        registerPlugin(DailyPlugin.class);
        registerPlugin(ExportServicePlugin.class);
        registerPlugin(PlaybackServicePlugin.class);
        registerPlugin(WidgetsPlugin.class);
        registerPlugin(AppIconPlugin.class);
        registerPlugin(SpeechPlugin.class);
        registerPlugin(FontPackPlugin.class);
        registerPlugin(LaunchPlugin.class);
        keepHash(getIntent());
        firstUp = false;
        final long until = SystemClock.uptimeMillis() + 4000;
        SplashScreen splash = SplashScreen.installSplashScreen(this);
        splash.setKeepOnScreenCondition(() -> !firstUp && SystemClock.uptimeMillis() < until);
        // Duolingo-like: the logo on one solid colour, then a quick plain fade into the first screen
        splash.setOnExitAnimationListener((v) -> v.getView().animate().alpha(0f).setDuration(200)
            .setInterpolator(new DecelerateInterpolator()).withEndAction(v::remove).start());
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onStop() {
        super.onStop();
        AppIcons.apply(this); // the icon of the chosen theme colours (AppIcons)
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        keepHash(intent);
    }
}
