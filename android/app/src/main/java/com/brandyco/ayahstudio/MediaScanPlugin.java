package com.brandyco.ayahstudio;

import android.media.MediaScannerConnection;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Adds a video the app wrote to the public Movies folder to the gallery right away (src/native.ts). */
@CapacitorPlugin(name = "MediaScan")
public class MediaScanPlugin extends Plugin {

    @PluginMethod
    public void scan(PluginCall call) {
        String path = call.getString("path");
        if (path == null) {
            call.reject("path is required");
            return;
        }
        String mime = call.getString("mime", "video/mp4");
        MediaScannerConnection.scanFile(getContext(), new String[] { path }, new String[] { mime }, null);
        call.resolve();
    }
}
