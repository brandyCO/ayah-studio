package com.brandyco.ayahstudio;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.Calendar;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * What the web app handed over for the widgets (WidgetsPlugin.update): the streak, 14 days of prayer
 * times, the dhikr phrases and a few interface words. Also the counts made on the tasbih widget that
 * the app has not taken yet. SharedPreferences "widgets".
 */
final class WidgetStore {
    static final String PREFS = "widgets";

    private WidgetStore() {}

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static JSONObject data(Context c) {
        try {
            return new JSONObject(prefs(c).getString("data", "{}"));
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    static String str(JSONObject data, String key, String fallback) {
        JSONObject s = data.optJSONObject("strings");
        String v = s == null ? "" : s.optString(key, "");
        return v.isEmpty() ? fallback : v;
    }

    static String dayKey(Calendar c) {
        return String.format(java.util.Locale.ROOT, "%04d-%02d-%02d",
            c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));
    }

    static String today() {
        return dayKey(Calendar.getInstance());
    }

    /** Whole days from day key a to day key b (b later → positive). */
    static long daysBetween(String a, String b) {
        try {
            String[] x = a.split("-"), y = b.split("-");
            return DailyAyahWidget.days(Integer.parseInt(y[0]), Integer.parseInt(y[1]), Integer.parseInt(y[2]))
                - DailyAyahWidget.days(Integer.parseInt(x[0]), Integer.parseInt(x[1]), Integer.parseInt(x[2]));
        } catch (Exception e) {
            return 9999;
        }
    }

    /** The next prayer from now: [index 0..5, time ms], or null without times. Sunrise is skipped. */
    static long[] nextPrayer(JSONObject data, long now) {
        JSONObject p = data.optJSONObject("prayers");
        JSONArray days = p == null ? null : p.optJSONArray("days");
        if (days == null) return null;
        for (int d = 0; d < days.length(); d++) {
            JSONArray t = days.optJSONObject(d) == null ? null : days.optJSONObject(d).optJSONArray("t");
            if (t == null) continue;
            for (int i = 0; i < t.length(); i++) {
                if (i == 1) continue;
                long at = t.optLong(i);
                if (at > now) return new long[] { i, at };
            }
        }
        return null;
    }

    /** Today's six prayer times, or null. */
    static JSONArray todayTimes(JSONObject data) {
        JSONObject p = data.optJSONObject("prayers");
        JSONArray days = p == null ? null : p.optJSONArray("days");
        if (days == null) return null;
        String today = today();
        for (int d = 0; d < days.length(); d++) {
            JSONObject x = days.optJSONObject(d);
            if (x != null && today.equals(x.optString("d"))) return x.optJSONArray("t");
        }
        return null;
    }

    static String prayerName(JSONObject data, int i) {
        JSONObject p = data.optJSONObject("prayers");
        JSONArray names = p == null ? null : p.optJSONArray("names");
        String[] en = { "Fajr", "Sunrise", "Dhuhr", "Asr", "Maghrib", "Isha" };
        return names != null && i < names.length() ? names.optString(i, en[i]) : en[i];
    }

    // --- tasbih widget counts ---

    /** Counts not yet taken by the app: { "YYYY-MM-DD": { "subhan": 12 } }. */
    static JSONObject pending(Context c) {
        try {
            return new JSONObject(prefs(c).getString("tasbih", "{}"));
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    static synchronized void addCount(Context c, String id, int n) {
        try {
            JSONObject all = pending(c);
            String day = today();
            JSONObject d = all.optJSONObject(day);
            if (d == null) d = new JSONObject();
            d.put(id, Math.max(0, d.optInt(id, 0) + n));
            all.put(day, d);
            prefs(c).edit().putString("tasbih", all.toString()).apply();
        } catch (Exception ignored) {
        }
    }

    static synchronized JSONObject takeCounts(Context c) {
        JSONObject all = pending(c);
        prefs(c).edit().remove("tasbih").apply();
        // The app now holds them: they become part of its "today" count for the widget.
        try {
            JSONObject data = data(c);
            String day = today();
            JSONObject mine = all.optJSONObject(day);
            if (mine != null && day.equals(data.optString("dhikrDay"))) {
                JSONObject known = data.optJSONObject("dhikrToday");
                if (known == null) known = new JSONObject();
                java.util.Iterator<String> it = mine.keys();
                while (it.hasNext()) {
                    String k = it.next();
                    known.put(k, known.optInt(k, 0) + mine.optInt(k, 0));
                }
                data.put("dhikrToday", known);
                prefs(c).edit().putString("data", data.toString()).apply();
            }
        } catch (Exception ignored) {
        }
        return all;
    }

    /** Today's count of a dhikr: what the app knew today plus what the widget added since. */
    static int todayCount(Context c, JSONObject data, String id) {
        String day = today();
        int n = 0;
        if (day.equals(data.optString("dhikrDay"))) {
            JSONObject known = data.optJSONObject("dhikrToday");
            if (known != null) n += known.optInt(id, 0);
        }
        JSONObject mine = pending(c).optJSONObject(day);
        if (mine != null) n += mine.optInt(id, 0);
        return n;
    }
}
