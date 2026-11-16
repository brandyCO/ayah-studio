package com.brandyco.ayahstudio;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** The web app says its first screen is drawn (src/ui/opening.ts): the native splash may leave (AppActivity). */
@CapacitorPlugin(name = "Launch")
public class LaunchPlugin extends Plugin {
    @PluginMethod
    public void ready(PluginCall call) {
        AppActivity.firstScreen();
        call.resolve();
    }
}
