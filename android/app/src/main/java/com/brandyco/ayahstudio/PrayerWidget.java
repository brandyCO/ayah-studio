package com.brandyco.ayahstudio;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Home-screen prayer times: the next prayer large with its time, and today's six times below (the
 * next one marked). Times are worked out by the app for 14 days ahead from the user's location;
 * an alarm at each prayer moves the widget on (Widgets.prayerTick). Tap → Me.
 */
public class PrayerWidget extends AppWidgetProvider {
    private static final int[] NAMES = { R.id.pw_n0, R.id.pw_n1, R.id.pw_n2, R.id.pw_n3, R.id.pw_n4, R.id.pw_n5 };
    private static final int[] TIMES = { R.id.pw_t0, R.id.pw_t1, R.id.pw_t2, R.id.pw_t3, R.id.pw_t4, R.id.pw_t5 };

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        draw(context, manager, ids);
        Widgets.prayerTick(context);
    }

    static void draw(Context c, AppWidgetManager m, int[] ids) {
        JSONObject data = WidgetStore.data(c);
        long[] next = WidgetStore.nextPrayer(data, System.currentTimeMillis());
        JSONArray today = WidgetStore.todayTimes(data);
        for (int id : ids) {
            RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.prayer_widget);
            if (next == null) {
                v.setTextViewText(R.id.pw_label, "");
                v.setTextViewText(R.id.pw_next, WidgetStore.str(data, "noLocation", "Open Me → Prayer times to set your location"));
                v.setTextViewText(R.id.pw_time, "");
                v.setViewVisibility(R.id.pw_row, View.GONE);
            } else {
                v.setTextViewText(R.id.pw_label, WidgetStore.str(data, "next", "Next"));
                v.setTextViewText(R.id.pw_next, WidgetStore.prayerName(data, (int) next[0]));
                v.setTextViewText(R.id.pw_time, Widgets.time(c, next[1]));
                v.setViewVisibility(R.id.pw_row, today != null ? View.VISIBLE : View.GONE);
                for (int i = 0; i < 6; i++) {
                    v.setTextViewText(NAMES[i], WidgetStore.prayerName(data, i));
                    v.setTextViewText(TIMES[i], today != null ? Widgets.time(c, today.optLong(i)) : "");
                    boolean on = today != null && today.optLong(i) == next[1];
                    int colour = c.getResources().getColor(on ? R.color.daily_accent : R.color.daily_muted, null);
                    v.setTextColor(NAMES[i], colour);
                    v.setTextColor(TIMES[i], on ? colour : c.getResources().getColor(R.color.daily_text, null));
                }
            }
            v.setOnClickPendingIntent(R.id.pw_root, Widgets.openApp(c, "#/me", 7430));
            m.updateAppWidget(id, v);
        }
    }
}
