package com.brandyco.ayahstudio;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.graphics.Bitmap;
import android.os.Bundle;
import android.os.SystemClock;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.RelativeSizeSpan;
import android.view.View;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Home-screen prayer times (redrawn 2026-11-10, owner: "something is wrong with it"): the next prayer
 * large with its time and a live countdown, sunrise small beside the label, and the five prayers below
 * (the next one in a pill, those already passed dimmed). Times are short ("5:12", the AM/PM only beside
 * the big time), so the columns are never cut off. After Isha the row shows tomorrow, with Fajr in the
 * pill. Narrow or short sizes keep only the next prayer. On a night card in the theme colours
 * (WidgetArt). Times come from the app for 14 days ahead; an alarm at each prayer moves it on. Tap → Me.
 */
public class PrayerWidget extends AppWidgetProvider {
    private static final int[] NAMES = { R.id.pw_n0, R.id.pw_n1, R.id.pw_n2, R.id.pw_n3, R.id.pw_n4 };
    private static final int[] TIMES = { R.id.pw_t0, R.id.pw_t1, R.id.pw_t2, R.id.pw_t3, R.id.pw_t4 };
    private static final int[] COLS = { R.id.pw_c0, R.id.pw_c1, R.id.pw_c2, R.id.pw_c3, R.id.pw_c4 };
    /** The five prayers' places in the day's six times (1 is sunrise). */
    private static final int[] FIVE = { 0, 2, 3, 4, 5 };

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        draw(context, manager, ids);
        Widgets.prayerTick(context);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        draw(context, manager, new int[] { id });
    }

    /** "5:12" or "17:12": no AM/PM, so five columns always fit. */
    static String short_(Context c, long ms) {
        boolean h24 = android.text.format.DateFormat.is24HourFormat(c);
        return new SimpleDateFormat(h24 ? "H:mm" : "h:mm", Locale.getDefault()).format(new Date(ms));
    }

    /** The big time, with a small AM/PM when the phone uses a 12-hour clock. */
    static CharSequence big(Context c, long ms) {
        if (android.text.format.DateFormat.is24HourFormat(c)) return short_(c, ms);
        String t = short_(c, ms);
        String ap = new SimpleDateFormat("a", Locale.getDefault()).format(new Date(ms));
        SpannableString s = new SpannableString(t + " " + ap);
        s.setSpan(new RelativeSizeSpan(0.42f), t.length(), s.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        return s;
    }

    static void draw(Context c, AppWidgetManager m, int[] ids) {
        JSONObject data = WidgetStore.data(c);
        long now = System.currentTimeMillis();
        long[] next = WidgetStore.nextPrayer(data, now);
        // The day the next prayer is on: today, or tomorrow once Isha has passed.
        JSONArray day = next == null ? WidgetStore.todayTimes(data) : WidgetStore.dayOf(data, next[1]);
        WidgetArt.Pal pal = WidgetArt.pal(data);
        int dim = 0x73FFFFFF, soft = 0xB3FFFFFF, white = 0xFFFFFFFF;
        float d = WidgetArt.density(c);
        for (int id : ids) {
            RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.prayer_widget);
            int[] sz = WidgetArt.size(c, m, id, 250, 110);
            Bitmap bg = WidgetArt.background(c, pal, sz[0], sz[1]);
            v.setImageViewBitmap(R.id.pw_bg, bg);
            float wDp = sz[0] / d, hDp = sz[1] / d;
            boolean roomy = wDp >= 200 && hDp >= 100;
            if (next == null) {
                v.setTextViewText(R.id.pw_label, "");
                v.setTextViewText(R.id.pw_sun, "");
                v.setTextViewText(R.id.pw_next, WidgetStore.str(data, "noLocation", "Set your location in Me"));
                v.setTextViewTextSize(R.id.pw_next, android.util.TypedValue.COMPLEX_UNIT_SP, 15);
                v.setTextViewText(R.id.pw_time, "");
                v.setViewVisibility(R.id.pw_left, View.GONE);
                v.setViewVisibility(R.id.pw_row, View.GONE);
            } else {
                v.setTextViewText(R.id.pw_label, WidgetStore.str(data, "next", "Next").toUpperCase(Locale.getDefault()));
                v.setTextViewText(R.id.pw_next, WidgetStore.prayerName(data, (int) next[0]));
                v.setTextViewTextSize(R.id.pw_next, android.util.TypedValue.COMPLEX_UNIT_SP, wDp < 170 ? 18 : 24);
                v.setTextViewText(R.id.pw_time, big(c, next[1]));
                v.setTextViewTextSize(R.id.pw_time, android.util.TypedValue.COMPLEX_UNIT_SP, wDp < 170 ? 24 : 32);
                v.setTextColor(R.id.pw_time, pal.hi);
                // A live countdown to the next prayer ("in 1:12:05"), kept by the launcher itself.
                long left = next[1] - now;
                v.setViewVisibility(R.id.pw_left, View.VISIBLE);
                v.setChronometer(R.id.pw_left, SystemClock.elapsedRealtime() + left, WidgetStore.str(data, "inLeft", "in %s"), true);
                v.setChronometerCountDown(R.id.pw_left, true);
                String sun = day != null && wDp >= 200 ? WidgetStore.prayerName(data, 1) + " " + short_(c, day.optLong(1)) : "";
                v.setTextViewText(R.id.pw_sun, sun);
                v.setViewVisibility(R.id.pw_row, day != null && roomy ? View.VISIBLE : View.GONE);
                for (int i = 0; i < 5; i++) {
                    int k = FIVE[i];
                    long at = day != null ? day.optLong(k) : 0;
                    boolean on = at == next[1];
                    boolean past = at > 0 && at < now;
                    v.setTextViewText(NAMES[i], WidgetStore.prayerName(data, k));
                    v.setTextViewText(TIMES[i], at > 0 ? short_(c, at) : "");
                    v.setTextColor(NAMES[i], on ? white : past ? dim : soft);
                    v.setTextColor(TIMES[i], on ? white : past ? dim : 0xE6FFFFFF);
                    v.setInt(COLS[i], "setBackgroundResource", on ? R.drawable.widget_pill : 0);
                }
            }
            v.setOnClickPendingIntent(R.id.pw_root, Widgets.openApp(c, "#/me/prayer", 7430));
            m.updateAppWidget(id, v);
        }
    }
}
