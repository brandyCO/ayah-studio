package com.brandyco.ayahstudio;

import android.content.Intent;
import android.graphics.ImageDecoder;
import android.graphics.drawable.Animatable2;
import android.graphics.drawable.AnimatedImageDrawable;
import android.graphics.drawable.Drawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.DisplayMetrics;
import android.view.Gravity;
import android.view.ViewGroup;
import android.view.animation.DecelerateInterpolator;
import android.widget.FrameLayout;
import android.widget.ImageView;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class AppActivity extends BridgeActivity {
    static final String EXTRA_HASH = "ayahstudio.hash";
    private static String pendingHash = null;
    /** The opening (owner 2026-11-14: "make a motion animation that's premium", and every web-drawn opening lagged,
     *  because the WebView's GPU is busiest exactly while the app starts). Android 9+: the system splash is the plain
     *  splash colour while res/raw/opening.webp (scripts/opening_anim.py: the rigged character, 2.25 s, 60 fps) is
     *  decoded off the main thread; then a full-screen layer on the same colour plays it with AnimatedImageDrawable,
     *  which decodes and draws on its own threads, so nothing the app does while starting can make it stutter. He
     *  holds his last pose until the first screen is drawn underneath (LaunchPlugin.ready), then the layer fades out.
     *  Android 8 and older, or if the picture is not ready within 0.7 s: the still splash until the first screen. */
    private static volatile boolean firstUp = false;
    static void firstScreen() { firstUp = true; }
    private static final long WAIT_PICTURE = 700, MAX_SPLASH = 4000, MAX_OPENING = 7000;
    private volatile Drawable opening = null;
    private volatile boolean noPicture = false;

    /** The app address a widget tap asked for, once (DailyPlugin.takeLaunchHash). */
    static synchronized String takeHash() {
        String h = pendingHash;
        pendingHash = null;
        return h;
    }

    private static synchronized void keepHash(Intent intent) {
        String h = intent == null ? null : intent.getStringExtra(EXTRA_HASH);
        if (h != null && h.startsWith("#/")) pendingHash = h;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MediaScanPlugin.class);
        registerPlugin(DailyPlugin.class);
        registerPlugin(ExportServicePlugin.class);
        registerPlugin(PlaybackServicePlugin.class);
        registerPlugin(WidgetsPlugin.class);
        registerPlugin(AppIconPlugin.class);
        registerPlugin(SpeechPlugin.class);
        registerPlugin(FontPackPlugin.class);
        registerPlugin(LaunchPlugin.class);
        keepHash(getIntent());
        firstUp = false;
        final long start = SystemClock.uptimeMillis();
        final boolean animate = Build.VERSION.SDK_INT >= 28 && savedInstanceState == null;
        if (animate) {
            new Thread(() -> {
                try {
                    opening = ImageDecoder.decodeDrawable(ImageDecoder.createSource(getResources(), R.raw.opening));
                } catch (Exception | OutOfMemoryError e) {
                    noPicture = true;
                }
            }, "opening").start();
        } else {
            noPicture = true;
        }
        SplashScreen splash = SplashScreen.installSplashScreen(this);
        splash.setKeepOnScreenCondition(() -> {
            long now = SystemClock.uptimeMillis();
            if (!noPicture && opening == null && now >= start + WAIT_PICTURE) noPicture = true;
            if (!noPicture) return opening == null;
            return !firstUp && now < start + MAX_SPLASH;
        });
        splash.setOnExitAnimationListener((v) -> {
            if (!noPicture && opening instanceof AnimatedImageDrawable) {
                playOpening((AnimatedImageDrawable) opening, start);
                v.remove(); // the layer, same colour, is already on top: no flash
            } else {
                v.getView().animate().alpha(0f).setDuration(200)
                    .setInterpolator(new DecelerateInterpolator()).withEndAction(v::remove).start();
            }
        });
        super.onCreate(savedInstanceState);
    }

    private void playOpening(AnimatedImageDrawable pic, long start) {
        final ViewGroup decor = (ViewGroup) getWindow().getDecorView();
        final FrameLayout layer = new FrameLayout(this);
        layer.setBackgroundColor(getResources().getColor(R.color.splash_background, getTheme()));
        layer.setClickable(true);
        ImageView view = new ImageView(this);
        view.setScaleType(ImageView.ScaleType.FIT_CENTER);
        view.setImageDrawable(pic);
        DisplayMetrics m = getResources().getDisplayMetrics();
        float ratio = (float) pic.getIntrinsicHeight() / Math.max(1, pic.getIntrinsicWidth());
        int w = (int) Math.min(m.widthPixels * 0.94f, m.heightPixels * 0.66f / ratio);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(w, (int) (w * ratio), Gravity.CENTER);
        layer.addView(view, lp);
        view.setTranslationY(-0.05f * m.heightPixels);
        decor.addView(layer, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT));
        final boolean[] played = { false };
        pic.setRepeatCount(0);
        pic.registerAnimationCallback(new Animatable2.AnimationCallback() {
            @Override
            public void onAnimationEnd(Drawable d) { played[0] = true; }
        });
        pic.start();
        // he holds his last pose until the first screen is drawn underneath, then the layer fades out
        final Handler h = new Handler(Looper.getMainLooper());
        h.postDelayed(new Runnable() {
            @Override
            public void run() {
                long now = SystemClock.uptimeMillis();
                if (!(played[0] && firstUp) && now < start + MAX_OPENING) {
                    h.postDelayed(this, 40);
                    return;
                }
                layer.animate().alpha(0f).setDuration(250).setInterpolator(new DecelerateInterpolator())
                    .withEndAction(() -> {
                        pic.stop();
                        decor.removeView(layer);
                        opening = null;
                    }).start();
            }
        }, 40);
    }

    @Override
    public void onStop() {
        super.onStop();
        AppIcons.apply(this); // the icon of the chosen theme colours (AppIcons)
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        keepHash(intent);
    }
}
