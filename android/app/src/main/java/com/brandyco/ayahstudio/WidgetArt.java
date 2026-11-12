package com.brandyco.ayahstudio;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.DashPathEffect;
import android.graphics.LinearGradient;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.SweepGradient;
import android.os.Bundle;
import org.json.JSONObject;

/**
 * The widgets' pictures, drawn on the phone in the app's theme colours (handed over by the app as
 * `theme`, the same palette as the Me tab): a night background with a soft glow, the streak flame
 * (the app's own shape, src/ui/flame.ts), the week's day circles (a check in a gradient circle,
 * today dashed, missed dim) and the tasbih ring. Drawn at the widget's real size, so nothing stretches.
 */
final class WidgetArt {
    private WidgetArt() {}

    static final class Pal {
        int deep, deep2, n1, n2, n3, hi, core, night, night2, night3;
    }

    private static int col(JSONObject t, String k, String def) {
        try {
            return Color.parseColor(t == null ? def : t.optString(k, def));
        } catch (Exception e) {
            return Color.parseColor(def);
        }
    }

    /** The theme from the app's data (Emerald until the app has run). */
    static Pal pal(JSONObject data) {
        JSONObject t = data.optJSONObject("theme");
        Pal p = new Pal();
        p.deep = col(t, "deep", "#05573d");
        p.deep2 = col(t, "deep2", "#0f8273");
        p.n1 = col(t, "n1", "#22b3a0");
        p.n2 = col(t, "n2", "#5eead4");
        p.n3 = col(t, "n3", "#5eead4");
        p.hi = col(t, "hi", "#aef4e8");
        p.core = col(t, "core", "#e7fcf8");
        p.night = col(t, "night", "#0f3328");
        p.night2 = col(t, "night2", "#0b1a15");
        p.night3 = col(t, "night3", "#070e0c");
        return p;
    }

    static int alpha(int c, float a) {
        return Color.argb(Math.round(255 * a), Color.red(c), Color.green(c), Color.blue(c));
    }

    static float density(Context c) {
        // Capped at 2: everything a widget shows travels to the launcher in one Binder call (≈ 1 MB);
        // bigger pictures make the update fail and the launcher shows "Can't load widget".
        return Math.min(c.getResources().getDisplayMetrics().density, 2f);
    }

    /** The widget's size in px (portrait: min width × max height), or the default in dp. */
    static int[] size(Context c, AppWidgetManager m, int id, int defW, int defH) {
        float d = density(c);
        int w = defW, h = defH;
        try {
            Bundle o = m.getAppWidgetOptions(id);
            int ow = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
            int oh = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
            if (ow > 40) w = ow;
            if (oh > 40) h = oh;
        } catch (Exception ignored) {
        }
        return new int[] { Math.max(80, Math.round(w * d)), Math.max(80, Math.round(h * d)) };
    }

    /** Longest side of the background picture. It is only soft gradients, so the launcher's scaling
     *  up is invisible, and at 2 bytes a pixel it stays far below the Binder limit. */
    private static final int BG_MAX = 360;

    /** The night card: a deep gradient in the theme's hue, a glow rising from the lower corner.
     *  Square and opaque (RGB 565): the rounded corners come from the layout's outline (widget_frame). */
    static Bitmap background(Context c, Pal p, int fullW, int fullH) {
        float k = Math.min(1f, BG_MAX / (float) Math.max(fullW, fullH));
        int w = Math.max(16, Math.round(fullW * k)), h = Math.max(16, Math.round(fullH * k));
        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.RGB_565);
        Canvas cv = new Canvas(b);
        RectF box = new RectF(0, 0, w, h);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.DITHER_FLAG);
        paint.setShader(new LinearGradient(0, 0, w * 0.35f, h, new int[] { p.night, p.night2, p.night3 }, new float[] { 0, 0.55f, 1 }, Shader.TileMode.CLAMP));
        cv.drawRect(box, paint);
        float big = Math.max(w, h);
        paint.setShader(new RadialGradient(w * 0.12f, h * 1.05f, big * 0.85f,
            new int[] { alpha(p.n1, 0.34f), alpha(p.n1, 0.10f), alpha(p.n1, 0) }, new float[] { 0, 0.45f, 1 }, Shader.TileMode.CLAMP));
        cv.drawRect(box, paint);
        paint.setShader(new RadialGradient(w * 0.98f, -h * 0.15f, big * 0.6f,
            new int[] { alpha(p.n3, 0.16f), alpha(p.n3, 0) }, null, Shader.TileMode.CLAMP));
        cv.drawRect(box, paint);
        return b;
    }

    // The app's flame (src/ui/flame.ts → flatFireCore.ts drawFire): one soft teardrop with no outline, a light
    // outer flame, a deeper inner flame and a white drop, standing on (50, 135) in a 100 × 140 box.
    private static Path tear(float x, float y, float w, float hh, float lean, float bump) {
        float R = w, H = Math.max(hh, R * 1.05f), cy = y - R, rise = H - R;
        float tx = x + R * 0.12f + lean, ty = y - H, sh = Math.min(R * 0.22f, bump * 0.18f);
        Path o = new Path();
        o.moveTo(x + R, cy);
        o.cubicTo(x + R, cy - rise * 0.55f, tx + R * 0.32f, ty + rise * 0.28f, tx, ty);
        o.cubicTo(tx - R * 0.42f, ty + rise * 0.3f, x - R - sh, cy - rise * 0.42f, x - R, cy);
        o.arcTo(new RectF(x - R, cy - R, x + R, cy + R), 180, -180);
        o.close();
        return o;
    }

    private static void fire(Canvas cv, Paint paint, int top, int bottom, int inTop, int inBottom, int core, float drop, int alpha) {
        float x = 50, y = 135, w = 40, hh = 104, lean = 5.5f, bump = 31;
        float soft = Math.min(w * 0.22f, Math.max(hh, w) * 0.2f), base = y - soft * 0.5f;
        paint.setStyle(Paint.Style.FILL_AND_STROKE);
        paint.setStrokeJoin(Paint.Join.ROUND);
        paint.setStrokeWidth(soft);
        paint.setShader(new LinearGradient(0, base - hh, 0, base, top, bottom, Shader.TileMode.CLAMP));
        paint.setAlpha(alpha);
        cv.drawPath(tear(x, base, w, hh, lean, bump), paint);
        float iw = w * 0.7f, ih = Math.max(w * 0.75f, hh * 0.68f), ib = base - w * 0.08f;
        paint.setStrokeWidth(soft * 0.75f);
        paint.setShader(new LinearGradient(0, ib - ih, 0, ib, inTop, inBottom, Shader.TileMode.CLAMP));
        paint.setAlpha(alpha);
        cv.drawPath(tear(x, ib, iw, ih, lean * 0.55f, bump * 0.5f), paint);
        paint.setShader(null);
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(core);
        paint.setAlpha(alpha);
        float r = w * 0.3f * drop, cx = x + lean * 0.1f, cy = base - w * 0.62f;
        Path d = new Path();
        d.moveTo(cx, cy - r * 1.75f);
        d.cubicTo(cx + r * 0.35f, cy - r * 1.25f, cx + r, cy - r * 0.7f, cx + r, cy);
        d.arcTo(new RectF(cx - r, cy - r, cx + r, cy + r), 0, 180);
        d.cubicTo(cx - r, cy - r * 0.7f, cx - r * 0.35f, cy - r * 1.25f, cx, cy - r * 1.75f);
        d.close();
        cv.drawPath(d, paint);
    }

    /** tier 0 = out (the flame in grey with a curl of smoke), 1–3 as in the app; `dim` = lit before but not yet today. */
    static Bitmap flame(Pal p, int tier, boolean dim, int hPx) {
        float s = hPx / 140f;
        int wPx = Math.round(100 * s);
        Bitmap b = Bitmap.createBitmap(wPx, hPx, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(b);
        cv.scale(s, s);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        if (tier == 0) {
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(2.4f);
            paint.setStrokeCap(Paint.Cap.ROUND);
            paint.setColor(Color.argb(90, 255, 255, 255));
            Path smoke = new Path();
            smoke.moveTo(51, 30);
            smoke.cubicTo(45, 22, 57, 15, 50, 7);
            smoke.cubicTo(46, 2, 53, -3, 50, -8);
            cv.drawPath(smoke, paint);
            fire(cv, paint, Color.parseColor("#5b6461"), Color.parseColor("#4a524f"), Color.parseColor("#737c79"),
                Color.parseColor("#646d6a"), Color.parseColor("#8b9491"), 0.85f, 255);
            return b;
        }
        int glow = tier == 3 ? p.n3 : p.n1;
        if (!dim) {
            RadialGradient g = new RadialGradient(0, 0, 1, new int[] { alpha(glow, 0.55f), alpha(glow, 0.2f), alpha(glow, 0) },
                new float[] { 0, 0.45f, 1 }, Shader.TileMode.CLAMP);
            Matrix mx = new Matrix();
            mx.setScale(62, 58);
            mx.postTranslate(50, 94);
            g.setLocalMatrix(mx);
            paint.setShader(g);
            cv.drawOval(new RectF(-12, 36, 112, 152), paint);
        }
        fire(cv, paint, p.n2, p.n3, p.n1, p.n2, Color.WHITE, tier == 3 ? 1.18f : 1f, dim ? 140 : 255);
        return b;
    }

    /** A day of the week: lit / revived (check in a gradient circle), frozen, today (dashed), missed, future. */
    static Bitmap pip(Context c, Pal p, String state, int sizePx) {
        Bitmap b = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(b);
        float s = sizePx / 24f;
        cv.scale(s, s);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        float cx = 12, cy = 12, r = 10.6f;
        switch (state) {
            case "lit":
            case "revived": {
                paint.setShader(new RadialGradient(cx, cy + 2, 13, new int[] { alpha(p.n2, 0.45f), alpha(p.n2, 0) }, null, Shader.TileMode.CLAMP));
                cv.drawCircle(cx, cy, 12, paint);
                paint.setShader(new LinearGradient(4, 2, 20, 22, p.n1, p.n3, Shader.TileMode.CLAMP));
                cv.drawCircle(cx, cy, r, paint);
                paint.setShader(null);
                paint.setStyle(Paint.Style.STROKE);
                paint.setStrokeWidth(2.6f);
                paint.setStrokeCap(Paint.Cap.ROUND);
                paint.setStrokeJoin(Paint.Join.ROUND);
                paint.setColor(Color.WHITE);
                Path tick = new Path();
                tick.moveTo(7.2f, 12.4f);
                tick.rLineTo(3.3f, 3.3f);
                tick.rLineTo(6.4f, -7.4f);
                cv.drawPath(tick, paint);
                break;
            }
            case "frozen": {
                paint.setColor(Color.argb(46, 120, 200, 255));
                cv.drawCircle(cx, cy, r, paint);
                paint.setStyle(Paint.Style.STROKE);
                paint.setStrokeWidth(1.4f);
                paint.setColor(Color.argb(150, 150, 215, 255));
                cv.drawCircle(cx, cy, r - 0.7f, paint);
                paint.setStrokeCap(Paint.Cap.ROUND);
                paint.setStrokeWidth(1.6f);
                paint.setColor(Color.argb(230, 190, 230, 255));
                for (int i = 0; i < 3; i++) {
                    double a = Math.PI * i / 3;
                    float dx = (float) Math.cos(a) * 5.2f, dy = (float) Math.sin(a) * 5.2f;
                    cv.drawLine(cx - dx, cy - dy, cx + dx, cy + dy, paint);
                }
                break;
            }
            case "today": {
                paint.setColor(alpha(p.n1, 0.14f));
                cv.drawCircle(cx, cy, r, paint);
                paint.setStyle(Paint.Style.STROKE);
                paint.setStrokeWidth(1.6f);
                paint.setColor(alpha(p.hi, 0.9f));
                paint.setPathEffect(new DashPathEffect(new float[] { 2.6f, 2.2f }, 0));
                cv.drawCircle(cx, cy, r - 0.8f, paint);
                break;
            }
            case "missed": {
                paint.setColor(Color.argb(20, 255, 255, 255));
                cv.drawCircle(cx, cy, r, paint);
                paint.setStyle(Paint.Style.STROKE);
                paint.setStrokeWidth(1.2f);
                paint.setColor(Color.argb(40, 255, 255, 255));
                cv.drawCircle(cx, cy, r - 0.6f, paint);
                break;
            }
            default: {
                paint.setStyle(Paint.Style.STROKE);
                paint.setStrokeWidth(1.2f);
                paint.setColor(Color.argb(46, 255, 255, 255));
                cv.drawCircle(cx, cy, r - 0.6f, paint);
            }
        }
        return b;
    }

    /** The tasbih ring: a faint track and the count so far as a gradient arc with a bright head. */
    static Bitmap ring(Pal p, float frac, int sizePx) {
        Bitmap b = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(b);
        float st = sizePx * 0.075f;
        RectF box = new RectF(st, st, sizePx - st, sizePx - st);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(alpha(p.n1, 0.08f));
        cv.drawOval(box, paint);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(st);
        paint.setColor(Color.argb(30, 255, 255, 255));
        cv.drawOval(box, paint);
        frac = Math.max(0, Math.min(1, frac));
        if (frac > 0) {
            float cx = sizePx / 2f;
            SweepGradient g = new SweepGradient(cx, cx, new int[] { p.n1, p.n2, p.hi, p.n1 }, new float[] { 0, 0.5f, 0.98f, 1 });
            Matrix mx = new Matrix();
            mx.setRotate(-90, cx, cx);
            g.setLocalMatrix(mx);
            paint.setShader(g);
            paint.setStrokeCap(Paint.Cap.ROUND);
            cv.drawArc(box, -90, 360 * frac, false, paint);
        }
        return b;
    }

    // --- the du'a lanterns (DuaWidget), the same lantern as the Me tab's string (src/ui/dayLanterns.ts) ---

    /** One lantern, 32 × 48 units plus room for its glow. state 0 = not yet, 1 = its time now, 2 = lit. */
    static Bitmap lantern(Pal p, int state, int hPx) {
        float pad = 6;
        float s = hPx / (48f + pad * 2);
        int wPx = Math.round((32 + pad * 2) * s);
        Bitmap b = Bitmap.createBitmap(Math.max(8, wPx), Math.max(8, hPx), Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(b);
        cv.scale(s, s);
        cv.translate(pad, pad);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        boolean lit = state == 2, now = state == 1;
        if (lit || now) {
            int g = lit ? Color.rgb(255, 186, 80) : p.n2;
            paint.setShader(new RadialGradient(16, 25, 26, new int[] { alpha(g, lit ? 0.55f : 0.32f), alpha(g, 0) }, null, Shader.TileMode.CLAMP));
            cv.drawCircle(16, 25, 26, paint);
            paint.setShader(null);
        }
        int line = Color.argb(lit ? 140 : 90, 255, 255, 255);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(1.5f);
        paint.setStrokeCap(Paint.Cap.ROUND);
        paint.setColor(line);
        cv.drawLine(16, -pad, 16, 6, paint);
        Path body = new Path();
        body.moveTo(9, 12);
        body.lineTo(23, 12);
        body.cubicTo(26, 18, 26, 30, 23, 36);
        body.lineTo(9, 36);
        body.cubicTo(6, 30, 6, 18, 9, 12);
        body.close();
        paint.setStyle(Paint.Style.FILL);
        if (lit) paint.setShader(new LinearGradient(0, 12, 0, 36, Color.rgb(255, 214, 140), Color.rgb(242, 160, 60), Shader.TileMode.CLAMP));
        else paint.setColor(Color.argb(now ? 34 : 20, 255, 255, 255));
        cv.drawPath(body, paint);
        paint.setShader(null);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(now ? 2f : 1.4f);
        paint.setColor(lit ? Color.rgb(232, 155, 44) : now ? p.n2 : Color.argb(110, 255, 255, 255));
        cv.drawPath(body, paint);
        // Ribs
        paint.setStrokeWidth(1f);
        paint.setColor(lit ? Color.argb(90, 176, 98, 10) : Color.argb(45, 255, 255, 255));
        cv.drawLine(16, 12, 16, 36, paint);
        Path rib = new Path();
        rib.moveTo(12, 12); rib.cubicTo(10.4f, 19, 10.4f, 29, 12, 36);
        rib.moveTo(20, 12); rib.cubicTo(21.6f, 19, 21.6f, 29, 20, 36);
        cv.drawPath(rib, paint);
        // Caps
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(lit ? Color.rgb(201, 133, 42) : Color.argb(now ? 170 : 110, 255, 255, 255));
        cv.drawRoundRect(new RectF(10, 6, 22, 10), 2, 2, paint);
        cv.drawRoundRect(new RectF(11, 36, 21, 39.5f), 1.7f, 1.7f, paint);
        if (lit) {
            paint.setColor(Color.rgb(255, 246, 216));
            cv.drawOval(new RectF(12.6f, 20, 19.4f, 30), paint);
        }
        return b;
    }

    /** The string the lanterns hang from: a soft sag between the hooks of `n` equal columns. */
    static Bitmap lanternString(int wPx, int hPx, int n) {
        Bitmap b = Bitmap.createBitmap(Math.max(8, wPx), Math.max(4, hPx), Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(b);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(Math.max(1.5f, hPx * 0.09f));
        paint.setColor(Color.argb(70, 255, 255, 255));
        float col = wPx / (float) n, top = hPx * 0.2f, sag = hPx * 0.55f;
        Path path = new Path();
        path.moveTo(col * 0.2f, top);
        for (int i = 0; i < n; i++) {
            float x0 = col * (i - 0.5f), x1 = col * (i + 0.5f);
            if (i == 0) { path.lineTo(x1, top); continue; }
            path.quadTo((x0 + x1) / 2, top + sag, x1, top);
        }
        path.lineTo(wPx - col * 0.2f, top);
        cv.drawPath(path, paint);
        return b;
    }
}
