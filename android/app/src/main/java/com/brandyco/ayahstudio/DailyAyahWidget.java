package com.brandyco.ayahstudio;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Bundle;
import android.view.View;
import java.io.File;
import android.widget.RemoteViews;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Calendar;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Home-screen widget "Ayah of the day" (docs/grow.md, G2): the reference and the translation in the
 * system font, or (Me → Settings → Widgets → Arabic) the ayah as a picture the app drew in its Quran
 * font (files/daily/{key}.png, made for the next three weeks; the Quran is never drawn in a system
 * font, so without a picture the translation is shown). On a night card in the theme colours. The pick is the
 * same as the app's (src/data/daily.ts): the curated list in the web assets (public/data/daily.json),
 * indexed by whole local days since its epoch. The translation is the one chosen in the app
 * (stored by DailyPlugin), else Saheeh International from the list. Tap → the ayah in the app.
 * "My ayah" (MyAyahWidget, owner request 2026-11-24) is the same widget showing the user's own ayah, which the app
 * works out from what they memorise and read and hands over for the next two weeks (prefs "mine", by date). Placed
 * large (≥ 300 × 160 dp), either widget shows both side by side: today's ayah, then my ayah.
 */
public class DailyAyahWidget extends AppWidgetProvider {
    static final String PREFS = "daily";

    /** Which ayah this widget shows when it has room for one only. */
    boolean mine() { return false; }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        Item today = today(context), my = myAyah(context, today);
        for (int id : ids) manager.updateAppWidget(id, views(context, manager, id, today, my, mine()));
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        Item today = today(context);
        manager.updateAppWidget(id, views(context, manager, id, today, myAyah(context, today), mine()));
    }

    /** Redraws every placed widget, both kinds (after the app stored new texts or a new My ayah). */
    static void refresh(Context context) {
        AppWidgetManager m = AppWidgetManager.getInstance(context);
        Item today = null, my = null;
        for (Class<?> k : new Class<?>[] { DailyAyahWidget.class, MyAyahWidget.class }) {
            int[] ids = m.getAppWidgetIds(new ComponentName(context, k));
            if (ids.length == 0) continue;
            if (today == null) { today = today(context); my = myAyah(context, today); }
            for (int id : ids) m.updateAppWidget(id, views(context, m, id, today, my, k == MyAyahWidget.class));
        }
    }

    static final class Item {
        String ref = "";
        String text = "";
        String credit = "";
        String hash = "#/";
        String key = "";
        String label = "";
        boolean arabic;
        boolean mine;
    }

    static File picture(Context context, String key) {
        return new File(new File(context.getFilesDir(), "daily"), key.replace(':', '_') + ".png");
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
            it.key = key;
            it.arabic = "ar".equals(p.getString("lang", "tr"));
            it.label = new JSONObject(p.getString("labels", "{}")).optString("today", "");
        } catch (Exception ex) {
            it.ref = "Ayah Studio";
        }
        return it;
    }

    /** The user's own ayah for today: the entry for today's date, else the newest one before it (the app has not
     *  been opened for a while), else today's shared ayah. */
    static Item myAyah(Context context, Item fallback) {
        try {
            SharedPreferences p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONObject all = new JSONObject(p.getString("mine", "{}"));
            Calendar c = Calendar.getInstance();
            String today = String.format(java.util.Locale.ROOT, "%04d-%02d-%02d", c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));
            String best = null;
            for (java.util.Iterator<String> k = all.keys(); k.hasNext(); ) {
                String d = k.next();
                if (d.compareTo(today) <= 0 && (best == null || d.compareTo(best) > 0)) best = d;
            }
            if (best == null) return fallback;
            JSONObject x = all.getJSONObject(best);
            Item it = new Item();
            it.key = x.optString("key");
            it.ref = x.optString("ref");
            it.text = x.optString("text");
            it.credit = x.optString("why");
            it.hash = x.optString("hash", "#/");
            it.arabic = "ar".equals(p.getString("lang", "tr"));
            it.label = new JSONObject(p.getString("labels", "{}")).optString("mine", "");
            it.mine = true;
            return it;
        } catch (Exception ex) {
            return fallback;
        }
    }

    /** The app's white-on-clear picture as an alpha mask ≤ 720 px wide (1 byte a pixel), tinted white
     *  by the view: a full-size colour picture is too big to hand to the launcher. */
    static Bitmap alphaPicture(File f) {
        try {
            Bitmap src = BitmapFactory.decodeFile(f.getPath());
            if (src == null) return null;
            if (src.getWidth() > 720) {
                Bitmap s = Bitmap.createScaledBitmap(src, 720, Math.max(1, Math.round(src.getHeight() * 720f / src.getWidth())), true);
                src.recycle();
                src = s;
            }
            Bitmap a = src.extractAlpha();
            src.recycle();
            return a;
        } catch (Throwable e) {
            return null;
        }
    }

    /** Room for both: a widget placed at least about 4 × 3 cells. */
    static boolean pair(AppWidgetManager m, int id) {
        try {
            Bundle o = m.getAppWidgetOptions(id);
            return o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0) >= 300 && o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0) >= 160;
        } catch (Exception e) {
            return false;
        }
    }

    static RemoteViews views(Context context, AppWidgetManager m, int id, Item today, Item my, boolean mine) {
        org.json.JSONObject data = WidgetStore.data(context);
        WidgetArt.Pal pal = WidgetArt.pal(data);
        int[] sz = WidgetArt.size(context, m, id, 250, 110);
        if (pair(m, id)) {
            RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.ayah_pair_widget);
            v.setImageViewBitmap(R.id.pair_bg, WidgetArt.background(context, pal, sz[0], sz[1]));
            fill(context, v, today, true, R.id.pair_a_label, R.id.pair_a_ref, R.id.pair_a_text, R.id.pair_a_ar, R.id.pair_a_credit);
            fill(context, v, my, true, R.id.pair_b_label, R.id.pair_b_ref, R.id.pair_b_text, R.id.pair_b_ar, R.id.pair_b_credit);
            v.setOnClickPendingIntent(R.id.pair_a, open(context, today.hash, id * 4 + 1));
            v.setOnClickPendingIntent(R.id.pair_b, open(context, my.hash, id * 4 + 2));
            return v;
        }
        Item it = mine ? my : today;
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.daily_ayah_widget);
        v.setImageViewBitmap(R.id.daily_bg, WidgetArt.background(context, pal, sz[0], sz[1]));
        fill(context, v, it, false, R.id.daily_label, R.id.daily_ref, R.id.daily_text, R.id.daily_ar, R.id.daily_credit);
        v.setOnClickPendingIntent(R.id.daily_root, open(context, it.hash, id * 4));
        return v;
    }

    /** One ayah into a panel. Two panels: its label ("My ayah") on its own line above the reference. One panel: My
     *  ayah's label goes in front of the reference. Under the ayah: why it is mine, or the translator (none under an
     *  Arabic picture of today's ayah, which needs no translator). */
    static void fill(Context context, RemoteViews v, Item it, boolean two, int label, int ref, int text, int arId, int credit) {
        if (two) {
            v.setTextViewText(label, it.label);
            v.setViewVisibility(label, it.label.isEmpty() ? View.GONE : View.VISIBLE);
            v.setTextViewText(ref, it.ref);
        } else {
            v.setViewVisibility(label, View.GONE);
            v.setTextViewText(ref, it.mine && !it.label.isEmpty() ? it.label + " · " + it.ref : it.ref);
        }
        Bitmap ar = null;
        if (it.arabic && !it.key.isEmpty()) {
            File f = picture(context, it.key);
            if (f.exists()) ar = alphaPicture(f);
        }
        if (ar != null) {
            v.setImageViewBitmap(arId, ar);
            v.setInt(arId, "setColorFilter", 0xFFFFFFFF);
            v.setViewVisibility(arId, View.VISIBLE);
            v.setViewVisibility(text, View.GONE);
        } else {
            v.setViewVisibility(arId, View.GONE);
            v.setViewVisibility(text, View.VISIBLE);
            v.setTextViewText(text, it.text);
        }
        v.setTextViewText(credit, it.credit);
        v.setViewVisibility(credit, it.credit.isEmpty() || (ar != null && !it.mine) ? View.GONE : View.VISIBLE);
    }

    static PendingIntent open(Context context, String hash, int code) {
        Intent open = new Intent(context, AppActivity.class);
        open.setAction(Intent.ACTION_VIEW);
        open.putExtra(AppActivity.EXTRA_HASH, hash);
        open.setData(android.net.Uri.parse("ayah://w/" + code)); // one PendingIntent per panel
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(context, code, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
