package com.brandyco.ayahstudio;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class AppActivity extends BridgeActivity {
    static final String EXTRA_HASH = "ayahstudio.hash";
    private static String pendingHash = null;

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
        keepHash(getIntent());
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
