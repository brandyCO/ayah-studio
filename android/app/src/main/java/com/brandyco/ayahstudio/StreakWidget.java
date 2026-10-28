package com.brandyco.ayahstudio;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Home-screen widget: the daily streak flame (Me tab). Shows the days in a row, whether today is lit,
 * this week's seven days and the weeks in a row. Until the app is opened again it works the day out
 * itself: lit yesterday → "Open today to keep it"; older → the flame is out. Tap → Me.
 */
public class StreakWidget extends AppWidgetProvider {
    private static final int[] PIPS = { R.id.st_d1, R.id.st_d2, R.id.st_d3, R.id.st_d4, R.id.st_d5, R.id.st_d6, R.id.st_d7 };

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        draw(context, manager, ids);
    }

    static void draw(Context c, AppWidgetManager m, int[] ids) {
        JSONObject data = WidgetStore.data(c);
        JSONObject s = data.optJSONObject("streak");
        int days = 0;
        boolean lit = false;
        int weeks = 0;
        JSONArray week = null;
        String status;
        if (s != null) {
            long gap = WidgetStore.daysBetween(s.optString("today"), WidgetStore.today());
            days = s.optInt("days");
            weeks = s.optInt("weeks");
            if (gap == 0) {
                lit = s.optBoolean("lit");
                week = s.optJSONArray("week");
            } else if (gap == 1 && s.optBoolean("lit")) {
                lit = false; // yesterday was lit; today not yet
            } else if (gap <= 2 && s.optBoolean("freeze")) {
                lit = false; // the week's freeze may still cover a day
            } else {
                days = 0;
            }
        }
        if (days == 0 && !lit) status = WidgetStore.str(data, "start", "Open the app to light it");
        else if (lit) status = WidgetStore.str(data, "litToday", "Lit today");
        else status = WidgetStore.str(data, "openToday", "Open today to keep it");
        for (int id : ids) {
            RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.streak_widget);
            v.setImageViewResource(R.id.st_flame, days > 0 || lit ? (lit ? R.drawable.ic_flame : R.drawable.ic_flame_dim) : R.drawable.ic_flame_out);
            v.setTextViewText(R.id.st_days, String.valueOf(days));
            v.setTextViewText(R.id.st_label, WidgetStore.str(data, "dayStreak", "day streak"));
            v.setTextViewText(R.id.st_status, status);
            v.setTextViewText(R.id.st_weeks, WidgetStore.str(data, "weeks", "{n} weeks").replace("{n}", String.valueOf(weeks)));
            for (int i = 0; i < 7; i++) {
                String st = week != null && i < week.length() ? week.optString(i) : "";
                int res;
                switch (st) {
                    case "lit": case "revived": res = R.drawable.pip_lit; break;
                    case "frozen": res = R.drawable.pip_frozen; break;
                    case "today": res = R.drawable.pip_today; break;
                    default: res = R.drawable.pip_empty;
                }
                v.setImageViewResource(PIPS[i], res);
            }
            v.setViewVisibility(R.id.st_week, week != null ? View.VISIBLE : View.GONE);
            v.setOnClickPendingIntent(R.id.st_root, Widgets.openApp(c, "#/me", 7410));
            m.updateAppWidget(id, v);
        }
    }
}
