package com.brandyco.ayahstudio;

import android.os.Build;
import android.webkit.WebView;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Starts/stops ExportService around an export (src/native.ts → exportGuard()). While it runs, the
 * WebView's renderer also stays important when the app is not visible, so Android does not drop it.
 */
@CapacitorPlugin(name = "ExportService")
public class ExportServicePlugin extends Plugin {
    private int lastPercent = -1;

    @PluginMethod
    public void start(PluginCall call) {
        lastPercent = 0;
        ExportService.onCancel = () -> notifyListeners("cancel", new JSObject());
        ContextCompat.startForegroundService(getContext(), ExportService.intent(getContext(), ExportService.ACTION_START)
            .putExtra("title", call.getString("title", ""))
            .putExtra("cancel", call.getString("cancel", "")));
        rendererImportant(true);
        call.resolve();
    }

    @PluginMethod
    public void progress(PluginCall call) {
        int pct = Math.max(0, Math.min(100, call.getInt("percent", 0)));
        if (lastPercent >= 0 && pct != lastPercent) {
            lastPercent = pct;
            getContext().startService(ExportService.intent(getContext(), ExportService.ACTION_PROGRESS).putExtra("percent", pct));
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        lastPercent = -1;
        ExportService.onCancel = null;
        getContext().stopService(ExportService.intent(getContext(), ExportService.ACTION_START));
        rendererImportant(false);
        call.resolve();
    }

    private void rendererImportant(boolean on) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        getActivity().runOnUiThread(() -> {
            WebView wv = getBridge().getWebView();
            if (wv == null) return;
            if (on) wv.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
            else wv.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, true);
        });
    }
}
