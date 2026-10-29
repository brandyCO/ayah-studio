package com.brandyco.ayahstudio;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;

/**
 * Bridge for the Me tab's widgets (src/ui/widgets.ts): stores the data the widgets show, redraws
 * them, keeps the lock-screen prayer line and its alarms up to date, and hands back the counts made
 * on the tasbih widget.
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
}
