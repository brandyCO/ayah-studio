package com.brandyco.ayahstudio;

import android.app.Activity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.assetpacks.AssetPackLocation;
import com.google.android.play.core.assetpacks.AssetPackManager;
import com.google.android.play.core.assetpacks.AssetPackManagerFactory;
import com.google.android.play.core.assetpacks.AssetPackState;
import com.google.android.play.core.assetpacks.AssetPackStateUpdateListener;
import com.google.android.play.core.assetpacks.model.AssetPackStatus;
import java.util.Collections;
import java.util.List;

/**
 * The mushaf page fonts in the Play build (src/data/fontPack.ts): pages 4–604 come as the fast-follow asset pack
 * "qcf_fonts", which Google Play downloads right after the install. This tells the app where the pack's files
 * are once they are on the phone, how far the download is (events "progress"), asks Play to fetch it, and can ask
 * the user to let it download on mobile data. In an APK not installed from Play there is no pack: "unknown".
 */
@CapacitorPlugin(name = "FontPack")
public class FontPackPlugin extends Plugin {
    static final String PACK = "qcf_fonts";
    private static final List<String> PACKS = Collections.singletonList(PACK);
    private AssetPackManager manager;
    private final AssetPackStateUpdateListener listener = (state) -> {
        if (PACK.equals(state.name())) notifyListeners("progress", toJs(state));
    };

    @Override
    public void load() {
        try {
            manager = AssetPackManagerFactory.getInstance(getContext());
            manager.registerListener(listener);
        } catch (Exception e) {
            manager = null;
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (manager != null) manager.unregisterListener(listener);
    }

    private String path() {
        try {
            AssetPackLocation loc = manager.getPackLocation(PACK);
            return loc == null ? null : loc.assetsPath();
        } catch (Exception e) {
            return null;
        }
    }

    private static JSObject unknown(String why) {
        JSObject o = new JSObject();
        o.put("state", "unknown");
        if (why != null) o.put("error", why);
        return o;
    }

    private JSObject toJs(AssetPackState s) {
        JSObject o = new JSObject();
        String st;
        switch (s.status()) {
            case AssetPackStatus.COMPLETED: st = "completed"; break;
            case AssetPackStatus.PENDING: st = "pending"; break;
            case AssetPackStatus.DOWNLOADING: st = "downloading"; break;
            case AssetPackStatus.TRANSFERRING: st = "transferring"; break;
            case AssetPackStatus.WAITING_FOR_WIFI: st = "wifi"; break;
            case AssetPackStatus.REQUIRES_USER_CONFIRMATION: st = "confirm"; break;
            case AssetPackStatus.FAILED: st = "failed"; break;
            case AssetPackStatus.CANCELED: st = "canceled"; break;
            case AssetPackStatus.NOT_INSTALLED: st = "missing"; break;
            default: st = "unknown";
        }
        o.put("state", st);
        o.put("done", s.bytesDownloaded());
        o.put("total", s.totalBytesToDownload());
        o.put("error", s.errorCode());
        if (s.status() == AssetPackStatus.COMPLETED) {
            String p = path();
            if (p != null) o.put("path", p);
        }
        return o;
    }

    @PluginMethod
    public void state(PluginCall call) {
        if (manager == null) { call.resolve(unknown("no manager")); return; }
        String p = path();
        if (p != null) {
            JSObject o = new JSObject();
            o.put("state", "completed");
            o.put("path", p);
            call.resolve(o);
            return;
        }
        manager.getPackStates(PACKS)
            .addOnSuccessListener((states) -> {
                AssetPackState s = states.packStates().get(PACK);
                call.resolve(s == null ? unknown(null) : toJs(s));
            })
            .addOnFailureListener((e) -> call.resolve(unknown(e.getMessage())));
    }

    @PluginMethod
    public void fetch(PluginCall call) {
        if (manager == null) { call.resolve(unknown("no manager")); return; }
        manager.fetch(PACKS)
            .addOnSuccessListener((states) -> {
                AssetPackState s = states.packStates().get(PACK);
                call.resolve(s == null ? unknown(null) : toJs(s));
            })
            .addOnFailureListener((e) -> call.resolve(unknown(e.getMessage())));
    }

    /** Play asks the user whether the pack may download on mobile data (or confirms the download). */
    @PluginMethod
    public void allowMobileData(PluginCall call) {
        Activity a = getActivity();
        if (manager == null || a == null) { call.resolve(new JSObject().put("ok", false)); return; }
        manager.showConfirmationDialog(a)
            .addOnSuccessListener((r) -> call.resolve(new JSObject().put("ok", r != null && r == Activity.RESULT_OK)))
            .addOnFailureListener((e) -> call.resolve(new JSObject().put("ok", false)));
    }
}
