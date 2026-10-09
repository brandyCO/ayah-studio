package com.brandyco.ayahstudio;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Calendar;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Home-screen widget "Ayah of the day" (docs/grow.md, G2): the reference and the translation, in the
 * system font (never the Arabic: the Quran is drawn only with the app's Quran fonts). The pick is the
 * same as the app's (src/data/daily.ts): the curated list in the web assets (public/data/daily.json),
 * indexed by whole local days since its epoch. The translation is the one chosen in the app
 * (stored by DailyPlugin), else Saheeh International from the list. Tap → the ayah in the app.
 */
public class DailyAyahWidget extends AppWidgetProvider {
    static final String PREFS = "daily";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        Item item = today(context);
        for (int id : ids) manager.updateAppWidget(id, views(context, item));
    }

    /** Redraws every placed widget (after the app stored another translation). */
    static void refresh(Context context) {
        AppWidgetManager m = AppWidgetManager.getInstance(context);
        int[] ids = m.getAppWidgetIds(new ComponentName(context, DailyAyahWidget.class));
        if (ids.length == 0) return;
        Item item = today(context);
        for (int id : ids) m.updateAppWidget(id, views(context, item));
    }

    static final class Item {
        String ref = "";
        String text = "";
        String credit = "";
        String hash = "#/";
    }

    /** Days from 1970-01-01 to a civil date (H. Hinnant's algorithm; no time zones involved). */
    static long days(int y, int m, int d) {
        y -= m <= 2 ? 1 : 0;
        long era = (y >= 0 ? y : y - 399) / 400;
        long yoe = y - era * 400;
        long doy = (153L * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1;
        long doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
        return era * 146097 + doe - 719468;
    }

    static Item today(Context context) {
        Item it = new Item();
        try {
            InputStream in = context.getAssets().open("public/data/daily.json");
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] b = new byte[16384];
            for (int n; (n = in.read(b)) > 0; ) buf.write(b, 0, n);
            in.close();
            JSONObject data = new JSONObject(new String(buf.toByteArray(), StandardCharsets.UTF_8));
            String[] e = data.getString("epoch").split("-");
            Calendar c = Calendar.getInstance();
            long day = days(c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH))
                - days(Integer.parseInt(e[0]), Integer.parseInt(e[1]), Integer.parseInt(e[2]));
            JSONArray items = data.getJSONArray("items");
            int n = items.length();
            JSONObject x = items.getJSONObject((int) (((day % n) + n) % n));
            int s = x.getInt("s"), from = x.getInt("from"), to = x.getInt("to");
            String key = s + ":" + from + (to > from ? "-" + to : "");
            SharedPreferences p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONObject names = new JSONObject(p.getString("names", "{}"));
            JSONObject texts = new JSONObject(p.getString("texts", "{}"));
            String name = names.optString(String.valueOf(s), "");
            it.ref = (name.isEmpty() ? "" : name + " · ") + s + ":" + from + (to > from ? "–" + to : "");
            it.text = texts.optString(key, x.getString("en"));
            it.credit = texts.has(key) ? p.getString("credit", "") : "Saheeh International";
            it.hash = "#/s/" + s + "/" + from;
        } catch (Exception ex) {
            it.ref = "Ayah Studio";
        }
        return it;
    }

    static RemoteViews views(Context context, Item it) {
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.daily_ayah_widget);
        v.setTextViewText(R.id.daily_ref, it.ref);
        v.setTextViewText(R.id.daily_text, it.text);
        v.setTextViewText(R.id.daily_credit, it.credit);
        Intent open = new Intent(context, MainActivity.class);
        open.setAction(Intent.ACTION_VIEW);
        open.putExtra(MainActivity.EXTRA_HASH, it.hash);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        v.setOnClickPendingIntent(R.id.daily_root, pi);
        return v;
    }
}
