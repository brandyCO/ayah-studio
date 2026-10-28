package com.brandyco.ayahstudio;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** At each prayer (and after a restart, an update or a clock change): move the widgets and the lock-screen line on. */
public class PrayerAlarm extends BroadcastReceiver {
    static final String ACTION = "com.brandyco.ayahstudio.PRAYER_TICK";

    @Override
    public void onReceive(Context context, Intent intent) {
        Widgets.refreshAll(context);
    }
}
