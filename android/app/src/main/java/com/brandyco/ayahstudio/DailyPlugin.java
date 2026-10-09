package com.brandyco.ayahstudio;

import android.content.Context;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Bridge for the ayah of the day (src/ui/morning.ts): stores the chosen translation's texts of the
 * curated list for the home-screen widget, and hands the web app the address a widget tap opened.
 */
@CapacitorPlugin(name = "Daily")
public class DailyPlugin extends Plugin {

    /** { texts: { "94:5-6": "…" }, names: { "94": "Ash-Sharh" }, credit: "Saheeh International" } */
    @PluginMethod
    public void store(PluginCall call) {
        JSObject texts = call.getObject("texts", new JSObject());
        JSObject names = call.getObject("names", new JSObject());
        getContext().getSharedPreferences(DailyAyahWidget.PREFS, Context.MODE_PRIVATE).edit()
            .putString("texts", texts.toString())
            .putString("names", names.toString())
            .putString("credit", call.getString("credit", ""))
            .apply();
        DailyAyahWidget.refresh(getContext());
        call.resolve();
    }

    /** The address a widget tap asked for (once), or none. */
    @PluginMethod
    public void takeLaunchHash(PluginCall call) {
        JSObject r = new JSObject();
        String h = MainActivity.takeHash();
        if (h != null) r.put("hash", h);
        call.resolve(r);
    }
}
