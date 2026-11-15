package com.brandyco.ayahstudio;

import android.content.Intent;
import android.graphics.ImageDecoder;
import android.graphics.drawable.Animatable2;
import android.graphics.drawable.AnimatedImageDrawable;
import android.graphics.drawable.Drawable;
import android.os.Build;
import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.DisplayMetrics;
import android.util.Log;
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
    /** The opening (owner 2026-11-14: "make a motion animation that's premium"; every web-drawn opening lagged,
     *  because the phone is busiest exactly while the app starts). Android 9+: res/raw/opening.webp, the rigged
     *  character pre-rendered at 60 fps (scripts/opening_anim.py --webp), plays on a full-screen layer on the splash
     *  colour as an AnimatedImageDrawable: its frames are decoded on a worker thread and drawn by the render thread, so
     *  the app starting underneath cannot make it stutter, and it opens in milliseconds (the Lottie version took 1.5-3 s
     *  to parse and stuttered on the owner's phone, 2026-11-15). He holds his last pose until the first screen is drawn
     *  underneath (LaunchPlugin.ready), then the layer fades out. Not ready within 2.5 s, or Android 8 and older: the
     *  still character instead, so the screen is never empty. */
    private static volatile boolean firstUp = false;
    static void firstScreen() { firstUp = true; }
    private static final long WAIT_PICTURE = 2500, MAX_SPLASH = 6000, MAX_OPENING = 9000;
    private volatile AnimatedImageDrawable opening = null;
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
        final boolean animate = Build.VERSION.SDK_INT >= 28 && savedInstanceState == null; // older: the still splash (res/drawable/splash_anim.xml)
        if (animate) {
            new Thread(() -> {
                try {
                    Drawable d = ImageDecoder.decodeDrawable(ImageDecoder.createSource(getResources(), R.raw.opening));
                    if (d instanceof AnimatedImageDrawable) opening = (AnimatedImageDrawable) d;
                    else noPicture = true;
                    Log.i("AyahOpening", "ready in " + (SystemClock.uptimeMillis() - start) + " ms, ok=" + (opening != null));
                } catch (Exception | OutOfMemoryError e) {
                    noPicture = true;
                    Log.w("AyahOpening", "could not open the opening", e);
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
            return !animate && !firstUp && now < start + MAX_SPLASH; // Android 9+: the still character takes over at once
        });
        splash.setOnExitAnimationListener((v) -> {
            if (!noPicture && opening != null) {
                Log.i("AyahOpening", "playing after " + (SystemClock.uptimeMillis() - start) + " ms");
                playOpening(opening, start);
            } else {
                Log.i("AyahOpening", "still picture after " + (SystemClock.uptimeMillis() - start) + " ms");
                if (!animate) {
                    v.getView().animate().alpha(0f).setDuration(200)
                        .setInterpolator(new DecelerateInterpolator()).withEndAction(() -> { v.remove(); plainBackground(); }).start();
                    return;
                }
                showStill(start);
            }
            v.remove(); // the layer, same colour, is already on top: no flash
        });
        super.onCreate(savedInstanceState);
        if (animate) {
            // On top from the first frame: between the system splash and the opening the (white) web view never shows.
            ensureCover();
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                if (cover != null && !coverUsed) { removeCover(); }
            }, MAX_OPENING + 1000);
        }
    }

    private FrameLayout cover;
    private boolean coverUsed;

    private FrameLayout ensureCover() {
        if (cover != null) return cover;
        final ViewGroup decor = (ViewGroup) getWindow().getDecorView();
        cover = new FrameLayout(this);
        cover.setBackgroundColor(getResources().getColor(R.color.splash_background, getTheme()));
        cover.setClickable(true);
        decor.addView(cover, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT));
        return cover;
    }

    private void removeCover() {
        if (cover == null) return;
        ((ViewGroup) getWindow().getDecorView()).removeView(cover);
        cover = null;
        plainBackground();
    }

    /** The still character (splash_icon) pops in on the splash colour, holds until the first screen, then fades. */
    private void showStill(long start) {
        coverUsed = true;
        final FrameLayout layer = ensureCover();
        final ImageView pic = new ImageView(this);
        pic.setImageResource(R.drawable.splash_icon);
        int size = (int) (288 * getResources().getDisplayMetrics().density);
        layer.addView(pic, new FrameLayout.LayoutParams(size, size, Gravity.CENTER));
        pic.setScaleX(0.8f);
        pic.setScaleY(0.8f);
        pic.setAlpha(0f);
        pic.animate().scaleX(1f).scaleY(1f).alpha(1f).setDuration(320)
            .setInterpolator(new android.view.animation.OvershootInterpolator(1.4f)).start();
        final Handler h = new Handler(Looper.getMainLooper());
        h.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (!firstUp && SystemClock.uptimeMillis() < start + MAX_OPENING) {
                    h.postDelayed(this, 40);
                    return;
                }
                layer.animate().alpha(0f).setDuration(250).setInterpolator(new DecelerateInterpolator())
                    .withEndAction(this::removeCover).start();
            }
        }, 600);
    }

    /** The theme keeps the window in the splash colour while starting; afterwards the usual day / night colour. */
    private void plainBackground() {
        boolean night = (getResources().getConfiguration().uiMode
            & android.content.res.Configuration.UI_MODE_NIGHT_MASK) == android.content.res.Configuration.UI_MODE_NIGHT_YES;
        getWindow().setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(night ? 0xff07130f : 0xffffffff));
    }

    private void playOpening(AnimatedImageDrawable pic, long start) {
        coverUsed = true;
        final FrameLayout layer = ensureCover();
        final ImageView view = new ImageView(this);
        view.setScaleType(ImageView.ScaleType.FIT_CENTER);
        view.setImageDrawable(pic);
        pic.setRepeatCount(0); // once, then he holds the last frame
        DisplayMetrics m = getResources().getDisplayMetrics();
        float ratio = (float) pic.getIntrinsicHeight() / Math.max(1, pic.getIntrinsicWidth());
        int w = (int) Math.min(m.widthPixels * 0.94f, m.heightPixels * 0.66f / ratio);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(w, (int) (w * ratio), Gravity.CENTER);
        layer.addView(view, lp);
        view.setTranslationY(-0.05f * m.heightPixels);
        final boolean[] played = { false };
        pic.registerAnimationCallback(new Animatable2.AnimationCallback() {
            @Override
            public void onAnimationEnd(Drawable d) { played[0] = true; }
        });
        pic.start(); // decoded on a worker thread and drawn by the render thread: a busy app start cannot make it stutter
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
                        removeCover();
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
