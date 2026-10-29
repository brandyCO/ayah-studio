package com.brandyco.ayahstudio;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.graphics.Typeface;
import android.os.Bundle;
import android.text.SpannableString;
import android.text.style.StyleSpan;
import android.view.View;
import android.widget.RemoteViews;
import java.util.Calendar;
import org.json.JSONObject;

/**
 * Home-screen widget: the daily streak, like the Me tab's card. The flame and the days in a row on top,
 * then this week Monday → Sunday: a check in a gradient circle for each lit day, today dashed until it
 * is lit, missed days dim. All in the app's theme colours (WidgetArt). The days come from the app
 * (`streak.hist`: lit / frozen / revived per day), so a new day or week shows right before the app
 * opens again: lit yesterday → "Meet a goal today to keep it"; older → the flame is out. Tap → Me.
 */
public class StreakWidget extends AppWidgetProvider {
    private static final int[] PIPS = { R.id.st_d1, R.id.st_d2, R.id.st_d3, R.id.st_d4, R.id.st_d5, R.id.st_d6, R.id.st_d7 };
    private static final int[] LETTERS = { R.id.st_l1, R.id.st_l2, R.id.st_l3, R.id.st_l4, R.id.st_l5, R.id.st_l6, R.id.st_l7 };

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        draw(context, manager, ids);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        draw(context, manager, new int[] { id });
    }

    static void draw(Context c, AppWidgetManager m, int[] ids) {
        JSONObject data = WidgetStore.data(c);
        JSONObject s = data.optJSONObject("streak");
        WidgetArt.Pal pal = WidgetArt.pal(data);
        String today = WidgetStore.today();
        int days = 0, best = 0;
        boolean lit = false;
        JSONObject hist = s == null ? null : s.optJSONObject("hist");
        if (s != null) {
            long gap = WidgetStore.daysBetween(s.optString("today"), today);
            days = s.optInt("days");
            best = s.optInt("best");
            if (gap == 0) {
                lit = s.optBoolean("lit");
            } else if (gap == 1 && s.optBoolean("lit")) {
                lit = false; // yesterday was lit; today not yet
            } else if (gap <= 2 && s.optBoolean("freeze")) {
                lit = false; // the week's freeze may still cover a day
            } else {
                days = 0;
            }
        }
        String status;
        if (days == 0 && !lit) status = WidgetStore.str(data, "start", "Meet a goal to light it");
        else if (lit) status = WidgetStore.str(data, "litToday", "Lit today");
        else status = WidgetStore.str(data, "openToday", "Meet a goal today to keep it");
        int tier = !lit && days == 0 ? 0 : days >= 30 ? 3 : days >= 7 ? 2 : 1;

        // This week, Monday first.
        Calendar cal = Calendar.getInstance();
        int back = (cal.get(Calendar.DAY_OF_WEEK) + 5) % 7; // days since Monday
        cal.add(Calendar.DAY_OF_MONTH, -back);
        String[] states = new String[7];
        for (int i = 0; i < 7; i++) {
            String k = WidgetStore.dayKey(cal);
            String h = hist == null ? "" : hist.optString(k, "");
            int cmp = k.compareTo(today);
            if (!h.isEmpty()) states[i] = h;
            else if (cmp == 0) states[i] = lit ? "lit" : "today";
            else states[i] = cmp < 0 ? "missed" : "future";
            cal.add(Calendar.DAY_OF_MONTH, 1);
        }
        String[] letters = WidgetStore.str(data, "letters", "M|T|W|T|F|S|S").split("\\|");

        float d = WidgetArt.density(c);
        android.graphics.Bitmap flame = WidgetArt.flame(pal, tier, tier > 0 && !lit, Math.round(48 * d));
        java.util.HashMap<String, android.graphics.Bitmap> pips = new java.util.HashMap<>();
        for (int id : ids) {
            int[] sz = WidgetArt.size(c, m, id, 250, 120);
            RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.streak_widget);
            v.setImageViewBitmap(R.id.st_bg, WidgetArt.background(c, pal, sz[0], sz[1]));
            v.setImageViewBitmap(R.id.st_flame, flame);
            v.setTextViewText(R.id.st_days, String.valueOf(days));
            v.setTextViewText(R.id.st_label, WidgetStore.str(data, "dayStreak", "day streak"));
            v.setTextColor(R.id.st_label, pal.hi);
            v.setTextViewText(R.id.st_status, status);
            if (best > 0) {
                v.setViewVisibility(R.id.st_best, View.VISIBLE);
                v.setTextViewText(R.id.st_best, WidgetStore.str(data, "best", "Best {n}").replace("{n}", String.valueOf(Math.max(best, days))));
            } else v.setViewVisibility(R.id.st_best, View.GONE);
            for (int i = 0; i < 7; i++) {
                String st = states[i];
                android.graphics.Bitmap b = pips.get(st);
                if (b == null) {
                    b = WidgetArt.pip(c, pal, st, Math.round(26 * d));
                    pips.put(st, b);
                }
                v.setImageViewBitmap(PIPS[i], b);
                String l = i < letters.length ? letters[i] : "";
                boolean isToday = "today".equals(st) || (i == back);
                if (isToday) {
                    SpannableString sp = new SpannableString(l);
                    sp.setSpan(new StyleSpan(Typeface.BOLD), 0, l.length(), 0);
                    v.setTextViewText(LETTERS[i], sp);
                    v.setTextColor(LETTERS[i], pal.hi);
                } else {
                    v.setTextViewText(LETTERS[i], l);
                    v.setTextColor(LETTERS[i], "lit".equals(st) || "revived".equals(st) ? 0xD9FFFFFF : 0x80FFFFFF);
                }
            }
            v.setOnClickPendingIntent(R.id.st_root, Widgets.openApp(c, "#/me", 7410));
            m.updateAppWidget(id, v);
        }
    }
}
