package com.brandyco.ayahstudio;

import android.os.Build;
import android.webkit.WebView;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Shows / updates / ends PlaybackService for the Listen player (src/native.ts → listenGuard()). While
 * it runs the WebView's renderer stays important when the app is not visible, so Android keeps it.
 * Notification buttons come back to the page as "button" events.
 */
@CapacitorPlugin(name = "PlaybackService")
public class PlaybackServicePlugin extends Plugin {
    private boolean running = false;

    @PluginMethod
    public void show(PluginCall call) {
        PlaybackService.onButton = (b) -> {
            JSObject o = new JSObject();
            o.put("b", b);
            notifyListeners("button", o);
        };
        String[] labels = null;
        try {
            JSArray a = call.getArray("labels");
            if (a != null && a.length() == 5) {
                labels = new String[5];
                for (int i = 0; i < 5; i++) labels[i] = a.getString(i);
            }
        } catch (Exception ignored) { /* default labels */ }
        try {
            ContextCompat.startForegroundService(getContext(), PlaybackService.intent(getContext(), PlaybackService.ACTION_SHOW)
                .putExtra("title", call.getString("title", ""))
                .putExtra("text", call.getString("text", ""))
                .putExtra("playing", Boolean.TRUE.equals(call.getBoolean("playing", false)))
                .putExtra("labels", labels));
        } catch (RuntimeException e) {
            // Android 12+ refuses to start a foreground service from the background; it starts on the next play.
            call.reject("not started", e);
            return;
        }
        if (!running) rendererImportant(true);
        running = true;
        call.resolve();
    }

    @PluginMethod
    public void hide(PluginCall call) {
        PlaybackService.onButton = null;
        getContext().stopService(PlaybackService.intent(getContext(), PlaybackService.ACTION_SHOW));
        if (running) rendererImportant(false);
        running = false;
        call.resolve();
    }

    private void rendererImportant(boolean on) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        getActivity().runOnUiThread(() -> {
            WebView wv = getBridge().getWebView();
            if (wv == null) return;
            wv.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, !on);
        });
    }
}
