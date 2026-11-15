package com.brandyco.ayahstudio;

import android.content.Intent;
import android.os.Build;
import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
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
import com.airbnb.lottie.AsyncUpdates;
import com.airbnb.lottie.LottieAnimationView;
import com.airbnb.lottie.LottieComposition;
import com.airbnb.lottie.LottieCompositionFactory;
import com.airbnb.lottie.LottieResult;
import com.airbnb.lottie.RenderMode;
import com.getcapacitor.BridgeActivity;

public class AppActivity extends BridgeActivity {
    static final String EXTRA_HASH = "ayahstudio.hash";
    private static String pendingHash = null;
    /** The opening (owner 2026-11-14: "make a motion animation that's premium", and every web-drawn opening lagged,
     *  because the WebView's GPU is busiest exactly while the app starts). Android 9+: the system splash is the plain
     *  splash colour while res/raw/opening.json (scripts/opening_lottie.py: the rigged character as a vector Lottie,
     *  owner pick 2026-11-15) is parsed off the main thread; then a full-screen layer on the same colour plays it with
     *  lottie-android (hardware rendering, frames updated off the main thread), so the app starting underneath cannot
     *  make it stutter. He holds his last pose until the first screen is drawn underneath (LaunchPlugin.ready), then
     *  the layer fades out. Android 8 and older, or if it is not ready within 1.2 s: the still splash until the first screen. */
    private static volatile boolean firstUp = false;
    static void firstScreen() { firstUp = true; }
    private static final long WAIT_PICTURE = 1200, MAX_SPLASH = 4000, MAX_OPENING = 7000;
    private volatile LottieComposition opening = null;
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
                    LottieResult<LottieComposition> r = LottieCompositionFactory.fromRawResSync(this, R.raw.opening);
                    if (r.getValue() != null) opening = r.getValue();
                    else noPicture = true;
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
            if (!noPicture && opening != null) {
                playOpening(opening, start);
                v.remove(); // the layer, same colour, is already on top: no flash
            } else {
                v.getView().animate().alpha(0f).setDuration(200)
                    .setInterpolator(new DecelerateInterpolator()).withEndAction(v::remove).start();
            }
        });
        super.onCreate(savedInstanceState);
    }

    private void playOpening(LottieComposition pic, long start) {
        final ViewGroup decor = (ViewGroup) getWindow().getDecorView();
        final FrameLayout layer = new FrameLayout(this);
        layer.setBackgroundColor(getResources().getColor(R.color.splash_background, getTheme()));
        layer.setClickable(true);
        final LottieAnimationView view = new LottieAnimationView(this);
        view.setScaleType(ImageView.ScaleType.FIT_CENTER);
        view.setRenderMode(RenderMode.HARDWARE);
        view.setAsyncUpdates(AsyncUpdates.ENABLED);
        view.setComposition(pic);
        view.setRepeatCount(0);
        DisplayMetrics m = getResources().getDisplayMetrics();
        float ratio = (float) pic.getBounds().height() / Math.max(1, pic.getBounds().width());
        int w = (int) Math.min(m.widthPixels * 0.94f, m.heightPixels * 0.66f / ratio);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(w, (int) (w * ratio), Gravity.CENTER);
        layer.addView(view, lp);
        view.setTranslationY(-0.05f * m.heightPixels);
        decor.addView(layer, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT));
        final boolean[] played = { false };
        view.addAnimatorListener(new AnimatorListenerAdapter() {
            @Override
            public void onAnimationEnd(Animator a) { played[0] = true; }
        });
        view.playAnimation();
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
                        view.cancelAnimation();
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
