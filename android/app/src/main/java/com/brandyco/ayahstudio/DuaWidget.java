package com.brandyco.ayahstudio;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;
import android.widget.RemoteViews;
import java.util.Calendar;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Home-screen du'a lanterns (owner request 2026-11-10): today's string of seven lanterns, as on the Me
 * tab — waking, after each of the five prayers, before sleeping. A lantern is lit when that session was
 * said in full today (`duas.lit`, handed over by the app), the one whose time it is glows (worked out
 * here from the prayer times, so it moves on while the app is closed), and a new day starts unlit.
 * A tap on a lantern opens its session (#/me/du:{key}); anywhere else opens Me.
 */
public class DuaWidget extends AppWidgetProvider {
    static final String[] KEYS = { "wake", "salah:fajr", "salah:dhuhr", "salah:asr", "salah:maghrib", "salah:isha", "sleep" };
    private static final String[] EN = { "Waking", "Fajr", "Dhuhr", "Asr", "Maghrib", "Isha", "Sleep" };
    private static final int[] COLS = { R.id.dw_c0, R.id.dw_c1, R.id.dw_c2, R.id.dw_c3, R.id.dw_c4, R.id.dw_c5, R.id.dw_c6 };
    private static final int[] LANTERNS = { R.id.dw_l0, R.id.dw_l1, R.id.dw_l2, R.id.dw_l3, R.id.dw_l4, R.id.dw_l5, R.id.dw_l6 };
    private static final int[] NAMES = { R.id.dw_n0, R.id.dw_n1, R.id.dw_n2, R.id.dw_n3, R.id.dw_n4, R.id.dw_n5, R.id.dw_n6 };

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        draw(context, manager, ids);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        draw(context, manager, new int[] { id });
    }

    /** The stop whose time it is: sleep late at night, else the prayer whose time has come (as the app does). */
    static String nowKey(JSONObject data, long now) {
        Calendar cal = Calendar.getInstance();
        int hour = cal.get(Calendar.HOUR_OF_DAY);
        if (hour >= 21 || hour < 3) return "sleep";
        JSONArray t = WidgetStore.todayTimes(data);
        String[] five = { "fajr", "dhuhr", "asr", "maghrib", "isha" };
        int[] at = { 0, 2, 3, 4, 5 };
        if (t != null) {
            String cur = "isha";
            for (int i = 0; i < 5; i++) if (now >= t.optLong(at[i])) cur = five[i];
            return "salah:" + cur;
        }
        return "salah:" + (hour < 4 ? "isha" : hour < 12 ? "fajr" : hour < 15 ? "dhuhr" : hour < 18 ? "asr" : hour < 20 ? "maghrib" : "isha");
    }

    static void draw(Context c, AppWidgetManager m, int[] ids) {
        JSONObject data = WidgetStore.data(c);
        JSONObject du = data.optJSONObject("duas");
        WidgetArt.Pal pal = WidgetArt.pal(data);
        boolean today = du != null && WidgetStore.today().equals(du.optString("day"));
        JSONArray lit = today ? du.optJSONArray("lit") : null;
        JSONArray names = du == null ? null : du.optJSONArray("names");
        String now = nowKey(data, System.currentTimeMillis());
        float d = WidgetArt.density(c);
        int[] state = new int[7];
        int n = 0;
        for (int i = 0; i < 7; i++) {
            boolean on = false;
            if (lit != null) for (int k = 0; k < lit.length(); k++) if (KEYS[i].equals(lit.optString(k))) on = true;
            state[i] = on ? 2 : KEYS[i].equals(now) ? 1 : 0;
            if (on) n++;
        }
        for (int id : ids) {
            RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.dua_widget);
            int[] sz = WidgetArt.size(c, m, id, 250, 110);
            v.setImageViewBitmap(R.id.dw_bg, WidgetArt.background(c, pal, sz[0], sz[1]));
            float hDp = sz[1] / d;
            int lh = Math.round((hDp < 100 ? 34 : 46) * d);
            int rowW = Math.max(80, sz[0] - Math.round(24 * d));
            v.setImageViewBitmap(R.id.dw_string, WidgetArt.lanternString(Math.min(rowW, 720), Math.round(14 * d), 7));
            v.setTextViewText(R.id.dw_title, du != null ? du.optString("title", "Du'a through the day") : "Du'a through the day");
            String of = du != null ? du.optString("of", "{n} of {of}") : "{n} of {of}";
            v.setTextViewText(R.id.dw_count, of.replace("{n}", String.valueOf(n)).replace("{of}", "7"));
            // Three pictures for the whole row: one per state.
            android.graphics.Bitmap[] art = { WidgetArt.lantern(pal, 0, lh), WidgetArt.lantern(pal, 1, lh), WidgetArt.lantern(pal, 2, lh) };
            for (int i = 0; i < 7; i++) {
                v.setImageViewBitmap(LANTERNS[i], art[state[i]]);
                v.setTextViewText(NAMES[i], names != null && i < names.length() ? names.optString(i, EN[i]) : EN[i]);
                v.setTextColor(NAMES[i], state[i] == 2 ? 0xFFFFFFFF : state[i] == 1 ? pal.hi : 0x99FFFFFF);
                v.setOnClickPendingIntent(COLS[i], Widgets.openApp(c, "#/me/du:" + KEYS[i], 7440 + i));
            }
            v.setOnClickPendingIntent(R.id.dw_root, Widgets.openApp(c, "#/me", 7439));
            m.updateAppWidget(id, v);
        }
    }
}
