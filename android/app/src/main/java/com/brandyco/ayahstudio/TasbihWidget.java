package com.brandyco.ayahstudio;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Vibrator;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Home-screen tasbih: the dhikr phrase, today's count and the goal. Tap the count to add one (a short
 * vibration; a longer one at the goal), ⟳ for the next dhikr. Counts are kept here until the app
 * takes them into the journey (WidgetsPlugin.takeTasbih). The phrases come from the app (fixed list).
 */
public class TasbihWidget extends AppWidgetProvider {
    static final String COUNT = "com.brandyco.ayahstudio.TASBIH_COUNT";
    static final String NEXT = "com.brandyco.ayahstudio.TASBIH_NEXT";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        draw(context, manager, ids);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        String a = intent.getAction();
        if (!COUNT.equals(a) && !NEXT.equals(a)) return;
        JSONObject data = WidgetStore.data(context);
        JSONArray list = data.optJSONArray("dhikr");
        if (list == null || list.length() == 0) return;
        int at = Math.floorMod(WidgetStore.prefs(context).getInt("tasbihAt", 0), list.length());
        JSONObject d = list.optJSONObject(at);
        if (COUNT.equals(a) && d != null) {
            String id = d.optString("id");
            WidgetStore.addCount(context, id, 1);
            int n = WidgetStore.todayCount(context, data, id);
            int goal = Math.max(1, d.optInt("target", 33));
            Vibrator vib = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
            try {
                if (vib != null) vib.vibrate(n % goal == 0 ? 60 : 12);
            } catch (Exception ignored) {
            }
        } else if (NEXT.equals(a)) {
            WidgetStore.prefs(context).edit().putInt("tasbihAt", (at + 1) % list.length()).apply();
        }
        AppWidgetManager m = AppWidgetManager.getInstance(context);
        draw(context, m, m.getAppWidgetIds(new ComponentName(context, TasbihWidget.class)));
    }

    static void draw(Context c, AppWidgetManager m, int[] ids) {
        JSONObject data = WidgetStore.data(c);
        JSONArray list = data.optJSONArray("dhikr");
        String ar = "سُبْحَانَ اللَّهِ";
        String en = "Subhan Allah";
        int count = 0;
        int goal = 33;
        if (list != null && list.length() > 0) {
            int at = Math.floorMod(WidgetStore.prefs(c).getInt("tasbihAt", 0), list.length());
            JSONObject d = list.optJSONObject(at);
            if (d != null) {
                ar = d.optString("ar", ar);
                en = d.optString("en", en);
                goal = Math.max(1, d.optInt("target", 33));
                count = WidgetStore.todayCount(c, data, d.optString("id"));
            }
        }
        WidgetArt.Pal pal = WidgetArt.pal(data);
        float d = WidgetArt.density(c);
        android.graphics.Bitmap ring = WidgetArt.ring(pal, goal > 0 ? Math.min(1f, count / (float) goal) : 0, Math.round(96 * d));
        for (int id : ids) {
            int[] sz = WidgetArt.size(c, m, id, 150, 150);
            RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.tasbih_widget);
            v.setImageViewBitmap(R.id.tb_bg, WidgetArt.background(c, pal, sz[0], sz[1]));
            v.setImageViewBitmap(R.id.tb_ring, ring);
            v.setTextViewText(R.id.tb_ar, ar);
            v.setTextViewText(R.id.tb_en, en);
            v.setTextColor(R.id.tb_en, pal.hi);
            v.setTextViewText(R.id.tb_count, String.valueOf(count));
            v.setTextViewText(R.id.tb_goal, (count >= goal ? "✓ " : "") + "/ " + goal);
            v.setOnClickPendingIntent(R.id.tb_tap, broadcast(c, COUNT, 7420));
            v.setOnClickPendingIntent(R.id.tb_next, broadcast(c, NEXT, 7421));
            m.updateAppWidget(id, v);
        }
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, android.os.Bundle options) {
        draw(context, manager, new int[] { id });
    }

    private static PendingIntent broadcast(Context c, String action, int code) {
        Intent i = new Intent(c, TasbihWidget.class).setAction(action);
        return PendingIntent.getBroadcast(c, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
