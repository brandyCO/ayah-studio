package com.brandyco.ayahstudio;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Theme colours → launcher icon (src/ui/theme.ts). The change shows once the app leaves the screen. */
@CapacitorPlugin(name = "AppIcon")
public class AppIconPlugin extends Plugin {

    @PluginMethod
    public void set(PluginCall call) {
        AppIcons.want(getContext(), call.getString("id", "emerald"));
        call.resolve();
    }
}
