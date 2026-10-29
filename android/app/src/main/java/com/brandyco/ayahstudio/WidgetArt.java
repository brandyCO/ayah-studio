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

    // The app's flame (src/ui/flame.ts), in a 100 × 140 box.
    private static Path outer() {
        Path o = new Path();
        o.moveTo(62, 6);
        o.cubicTo(70, 26, 92, 46, 92, 88);
        o.cubicTo(92, 116, 73, 134, 50, 134);
        o.cubicTo(27, 134, 8, 116, 8, 90);
        o.cubicTo(8, 72, 14, 58, 22, 46);
        o.cubicTo(25, 54, 29, 59, 35, 61);
        o.cubicTo(36, 42, 44, 22, 62, 6);
        o.close();
        return o;
    }

    private static Path mid() {
        Path m = new Path();
        m.moveTo(51, 66);
        m.cubicTo(57, 80, 72, 92, 72, 108);
        m.cubicTo(72, 121, 62, 129, 50, 129);
        m.cubicTo(38, 129, 28, 121, 28, 108);
        m.cubicTo(28, 92, 44, 80, 51, 66);
        m.close();
        return m;
    }

    /** tier 0 = out (an ember), 1–3 as in the app; `dim` = lit before but not yet today. */
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
            smoke.moveTo(50, 118);
            smoke.cubicTo(44, 104, 58, 96, 50, 82);
            smoke.cubicTo(44, 70, 56, 62, 50, 48);
            cv.drawPath(smoke, paint);
            paint.setStyle(Paint.Style.FILL);
            paint.setColor(Color.parseColor("#3a302b"));
            cv.drawOval(new RectF(30, 121, 70, 135), paint);
            paint.setShader(new RadialGradient(50, 125, 12, new int[] { alpha(p.n1, 0.9f), alpha(p.deep, 0) }, null, Shader.TileMode.CLAMP));
            cv.drawOval(new RectF(38, 120, 62, 130), paint);
            return b;
        }
        int glow = tier == 3 ? p.n3 : p.n1;
        int o1 = tier == 1 ? p.deep2 : p.n1, o2 = tier == 1 ? p.n1 : tier == 2 ? p.n2 : p.n3;
        int m1 = tier == 1 ? p.n2 : tier == 2 ? p.n3 : p.hi, m2 = tier == 1 ? p.n3 : tier == 2 ? p.hi : p.core;
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
        paint.setShader(new LinearGradient(0, 134, 0, 6, o1, o2, Shader.TileMode.CLAMP));
        if (dim) paint.setAlpha(140);
        cv.drawPath(outer(), paint);
        paint.setShader(new LinearGradient(0, 129, 0, 66, m1, m2, Shader.TileMode.CLAMP));
        if (dim) paint.setAlpha(140);
        cv.drawPath(mid(), paint);
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
}
