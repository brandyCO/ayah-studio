package com.brandyco.ayahstudio;

import android.app.ActivityManager;
import android.app.ApplicationExitInfo;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.InputStream;
import java.util.List;

/**
 * Why the app last closed when it was not the user closing it (owner 2026-11-24: "I was listening to Quran and
 * suddenly it forced stop", and Sentry had nothing: a native crash, a dead WebView renderer or Android killing the
 * app happen outside the page, where the browser Sentry SDK cannot see). On the next start the page asks for these
 * (src/errors.ts) and sends each one to Sentry:
 *  - Android 11+: the system's own record of each earlier exit (ApplicationExitInfo): crash, native crash,
 *    not responding (with the start of its thread dump), low memory, killed by the phone's battery manager...
 *  - every version: a WebView renderer that died (AppActivity.onRenderProcessGone saves it here).
 */
@CapacitorPlugin(name = "Exits")
public class ExitsPlugin extends Plugin {
    private static final String PREFS = "exits";

    /** AppActivity: the WebView renderer died (crashed, or killed for memory); reported on the next start. */
    static void rendererGone(Context c, boolean crashed, int priority, boolean playing) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("renderer", (crashed ? "crashed" : "killed (memory)") + "|" + priority + "|" + playing + "|" + System.currentTimeMillis())
            .commit(); // commit: the process may be about to go
    }

    @PluginMethod
    public void take(PluginCall call) {
        Context c = getContext();
        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSArray out = new JSArray();
        String r = p.getString("renderer", null);
        if (r != null) {
            String[] f = r.split("\\|");
            JSObject o = new JSObject();
            o.put("reason", "renderer " + f[0]);
            o.put("description", "WebView renderer " + f[0] + (f.length > 2 && "true".equals(f[2]) ? " while the recitation played" : ""));
            o.put("time", f.length > 3 ? Long.parseLong(f[3]) : 0);
            o.put("rendererPriority", f.length > 1 ? f[1] : "");
            out.put(o);
        }
        long seen = p.getLong("seen", 0);
        long newest = seen;
        if (Build.VERSION.SDK_INT >= 30) {
            try {
                ActivityManager am = (ActivityManager) c.getSystemService(Context.ACTIVITY_SERVICE);
                List<ApplicationExitInfo> list = am.getHistoricalProcessExitReasons(null, 0, 8);
                for (ApplicationExitInfo e : list) {
                    long t = e.getTimestamp();
                    if (t <= seen) continue;
                    newest = Math.max(newest, t);
                    if (seen == 0) continue; // first run of this version: older history is not news
                    if (!worthTelling(e)) continue;
                    JSObject o = new JSObject();
                    o.put("reason", reasonName(e.getReason()));
                    o.put("description", e.getDescription() == null ? "" : e.getDescription());
                    o.put("time", t);
                    o.put("importance", importanceName(e.getImportance()));
                    o.put("status", e.getStatus());
                    o.put("pssKb", e.getPss());
                    o.put("rssKb", e.getRss());
                    o.put("process", e.getProcessName());
                    if (e.getReason() == ApplicationExitInfo.REASON_ANR) o.put("trace", trace(e));
                    out.put(o);
                }
                if (newest == 0) newest = System.currentTimeMillis();
            } catch (Exception ignored) { /* no history on this phone */ }
        }
        p.edit().remove("renderer").putLong("seen", Math.max(newest, seen == 0 ? 1 : seen)).apply();
        JSObject res = new JSObject();
        res.put("exits", out);
        res.put("sdk", Build.VERSION.SDK_INT);
        res.put("maker", Build.MANUFACTURER);
        res.put("model", Build.MODEL);
        ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo();
        ((ActivityManager) c.getSystemService(Context.ACTIVITY_SERVICE)).getMemoryInfo(mi);
        res.put("ramMb", mi.totalMem / (1024 * 1024));
        res.put("lowRamDevice", ((ActivityManager) c.getSystemService(Context.ACTIVITY_SERVICE)).isLowRamDevice());
        call.resolve(res);
    }

    /** Not the user leaving: crashes, hangs and kills while the app was on screen or playing. */
    private static boolean worthTelling(ApplicationExitInfo e) {
        switch (e.getReason()) {
            case ApplicationExitInfo.REASON_CRASH:
            case ApplicationExitInfo.REASON_CRASH_NATIVE:
            case ApplicationExitInfo.REASON_ANR:
            case ApplicationExitInfo.REASON_INITIALIZATION_FAILURE:
            case ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE:
                return true;
            case ApplicationExitInfo.REASON_EXIT_SELF:
            case ApplicationExitInfo.REASON_DEPENDENCY_DIED:
            case ApplicationExitInfo.REASON_PERMISSION_CHANGE:
            case ApplicationExitInfo.REASON_PACKAGE_UPDATED:
            case ApplicationExitInfo.REASON_PACKAGE_STATE_CHANGE:
                return false;
            default:
                // low memory, signalled, "user" / task-manager kills, other: only while it mattered (on screen or playing)
                return e.getImportance() <= ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND_SERVICE;
        }
    }

    private static String trace(ApplicationExitInfo e) {
        try (InputStream in = e.getTraceInputStream()) {
            if (in == null) return "";
            byte[] buf = new byte[6000];
            int n = 0;
            for (int k; n < buf.length && (k = in.read(buf, n, buf.length - n)) > 0; ) n += k;
            return new String(buf, 0, n, "UTF-8");
        } catch (Exception ignored) {
            return "";
        }
    }

    private static String reasonName(int r) {
        switch (r) {
            case 1: return "exit self";
            case 2: return "signaled";
            case 3: return "low memory";
            case 4: return "crash";
            case 5: return "native crash";
            case 6: return "not responding (ANR)";
            case 7: return "initialization failure";
            case 8: return "permission change";
            case 9: return "excessive resource use";
            case 10: return "user requested";
            case 11: return "user stopped";
            case 12: return "dependency died";
            case 13: return "other";
            case 14: return "freezer";
            case 15: return "package state change";
            case 16: return "package updated";
            default: return "unknown " + r;
        }
    }

    private static String importanceName(int i) {
        if (i <= ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND) return "on screen";
        if (i <= ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND_SERVICE) return "playing in background";
        if (i <= ActivityManager.RunningAppProcessInfo.IMPORTANCE_VISIBLE) return "visible";
        return "background (" + i + ")";
    }
}
