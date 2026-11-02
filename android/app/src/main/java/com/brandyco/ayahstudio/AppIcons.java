package com.brandyco.ayahstudio;

import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;

/**
 * The launcher icon follows the app's theme colours (src/ui/theme.ts). Each theme has an activity-alias
 * in the manifest with its own icon (".MainActivity" = Emerald, so home-screen icons from older versions
 * keep working; the others ".Icon{Id}"). Exactly one alias is enabled at a time.
 * The switch is applied when the app leaves the screen (AppActivity.onStop): changing the launcher entry
 * makes the launcher refresh, which must not happen while the user is looking at the app.
 */
final class AppIcons {
    private static final String PREFS = "appIcon";

    private AppIcons() {}

    static String alias(Context c, String id) {
        String name = "emerald".equals(id) ? "MainActivity"
            : "Icon" + Character.toUpperCase(id.charAt(0)) + id.substring(1);
        return c.getPackageName() + "." + name;
    }

    /** Remembers the theme whose icon should show (applied by apply()). */
    static void want(Context c, String id) {
        if (id == null || id.isEmpty() || !id.matches("[a-z]+")) return;
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("want", id).apply();
    }

    static void apply(Context c) {
        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String id = p.getString("want", null);
        if (id == null || id.equals(p.getString("done", "emerald"))) return;
        PackageManager pm = c.getPackageManager();
        String target = alias(c, id);
        try {
            PackageInfo info = pm.getPackageInfo(c.getPackageName(),
                PackageManager.GET_ACTIVITIES | PackageManager.MATCH_DISABLED_COMPONENTS);
            boolean known = false;
            for (ActivityInfo a : info.activities) if (a.targetActivity != null && a.name.equals(target)) known = true;
            if (!known) return; // an id without an icon (newer web code): keep the current one
            // Turn the new one on before the others off, so the app is never without a launcher entry.
            pm.setComponentEnabledSetting(new ComponentName(c, target),
                PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
            for (ActivityInfo a : info.activities) {
                if (a.targetActivity == null || a.name.equals(target)) continue;
                pm.setComponentEnabledSetting(new ComponentName(c, a.name),
                    PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
            }
            p.edit().putString("done", id).apply();
        } catch (Exception e) {
            // keep the current icon
        }
    }
}
