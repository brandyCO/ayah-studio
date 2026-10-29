package com.brandyco.ayahstudio;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;

/**
 * Bridge for the Me tab's widgets (src/ui/widgets.ts): stores the data the widgets show, redraws
 * them, keeps the lock-screen prayer line and its alarms up to date, and hands back the counts made
 * on the tasbih widget. Also the Widgets page (Me → Settings → Widgets): which widgets are on the home
 * screen, and "Add to home screen" (Android 8+ asks the launcher to place one in a single tap).
 */
@CapacitorPlugin(name = "Widgets")
public class WidgetsPlugin extends Plugin {

    @PluginMethod
    public void update(PluginCall call) {
        JSObject data = call.getData();
        WidgetStore.prefs(getContext()).edit().putString("data", data.toString()).apply();
        Widgets.refreshAll(getContext());
        call.resolve();
    }

    @PluginMethod
    public void takeTasbih(PluginCall call) {
        JSONObject counts = WidgetStore.takeCounts(getContext());
        JSObject r = new JSObject();
        try {
            r.put("counts", JSObject.fromJSONObject(counts));
        } catch (Exception e) {
            r.put("counts", new JSObject());
        }
        Widgets.refreshAll(getContext());
        call.resolve(r);
    }

    private static Class<?> widget(String kind) {
        if ("streak".equals(kind)) return StreakWidget.class;
        if ("tasbih".equals(kind)) return TasbihWidget.class;
        if ("prayer".equals(kind)) return PrayerWidget.class;
        if ("daily".equals(kind)) return DailyAyahWidget.class;
        return null;
    }

    private boolean canPin() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            && AppWidgetManager.getInstance(getContext()).isRequestPinAppWidgetSupported();
    }

    /** How many of each widget are on the home screen, and whether one can be added in a tap. */
    @PluginMethod
    public void status(PluginCall call) {
        AppWidgetManager m = AppWidgetManager.getInstance(getContext());
        JSObject on = new JSObject();
        for (String k : new String[] { "streak", "tasbih", "prayer", "daily" }) {
            on.put(k, m.getAppWidgetIds(new ComponentName(getContext(), widget(k))).length);
        }
        JSObject r = new JSObject();
        r.put("canPin", canPin());
        r.put("on", on);
        call.resolve(r);
    }

    /** Asks the launcher to place a widget (it shows its own confirmation). ok = the request was made. */
    @PluginMethod
    public void pin(PluginCall call) {
        Class<?> w = widget(call.getString("kind"));
        JSObject r = new JSObject();
        if (w == null || !canPin()) {
            r.put("ok", false);
            call.resolve(r);
            return;
        }
        boolean ok = false;
        try {
            ok = AppWidgetManager.getInstance(getContext()).requestPinAppWidget(new ComponentName(getContext(), w), null, null);
        } catch (Exception e) {
            ok = false;
        }
        r.put("ok", ok);
        call.resolve(r);
    }
}
