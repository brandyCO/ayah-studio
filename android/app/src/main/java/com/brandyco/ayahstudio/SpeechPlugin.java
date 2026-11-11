package com.brandyco.ayahstudio;

import android.Manifest;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.ResolveInfo;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognitionService;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;
import java.util.List;

/**
 * Voice follow-along in a tasmi' (src/ui/follow.ts): the phone's own speech recognition in Arabic, on the
 * device where it can (Android 12+ with the Arabic offline pack), otherwise the system recogniser with
 * "prefer offline". Only text comes back: no audio is kept. Each utterance ends on a pause; the app starts
 * the next one while the user is still reciting.
 * Events: "partial" {text}, "result" {text}, "end" {}, "error" {code}.
 * Phones differ: the on-device recogniser often has no Arabic pack (error 12/13), and the default service on
 * some phones (e.g. Samsung's) has no Arabic either. So the plugin tries, in turn: on-device → the default
 * service → each Google recognition service installed, moving on when one says it cannot do Arabic or
 * fails to start, and keeps the one that worked for the rest of the session.
 */
@CapacitorPlugin(name = "Speech", permissions = { @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "mic") })
public class SpeechPlugin extends Plugin {
    private SpeechRecognizer sr;
    private final Handler main = new Handler(Looper.getMainLooper());
    /** The ways to listen on this phone, best first; `way` = the one in use. null entries: on-device / default. */
    private static List<Object> ways = null;
    private static int way = 0;
    private static boolean heardOnce = false;
    private static final String ON_DEVICE = "on-device", DEFAULT = "default";

    private List<Object> ways() {
        if (ways != null) return ways;
        List<Object> w = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext())) w.add(ON_DEVICE);
        if (SpeechRecognizer.isRecognitionAvailable(getContext())) w.add(DEFAULT);
        try {
            List<ResolveInfo> svcs = getContext().getPackageManager().queryIntentServices(new Intent(RecognitionService.SERVICE_INTERFACE), 0);
            List<Object> google = new ArrayList<>(), other = new ArrayList<>();
            for (ResolveInfo r : svcs) {
                if (r.serviceInfo == null) continue;
                ComponentName c = new ComponentName(r.serviceInfo.packageName, r.serviceInfo.name);
                (r.serviceInfo.packageName.startsWith("com.google.") ? google : other).add(c);
            }
            w.addAll(google);
            w.addAll(other);
        } catch (Exception ignored) { }
        ways = w;
        return w;
    }
    /** Moves on to the next way to listen; false when none is left. */
    private boolean nextWay() {
        if (heardOnce) return false; // this way has worked: an error now is not about the phone
        if (way + 1 >= ways().size()) return false;
        way++;
        return true;
    }

    @PluginMethod
    public void available(PluginCall call) {
        JSObject r = new JSObject();
        boolean onDevice = Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext());
        r.put("available", !ways().isEmpty());
        r.put("onDevice", onDevice);
        call.resolve(r);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("mic") != PermissionState.GRANTED) {
            requestPermissionForAlias("mic", call, "micAnswered");
            return;
        }
        begin(call);
    }

    /** The microphone permission for recording in the page (Record me): asked here so the answer is clear. */
    @PluginMethod
    public void mic(PluginCall call) {
        if (getPermissionState("mic") == PermissionState.GRANTED) { JSObject r = new JSObject(); r.put("granted", true); call.resolve(r); return; }
        requestPermissionForAlias("mic", call, "micChecked");
    }

    @PermissionCallback
    private void micChecked(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", getPermissionState("mic") == PermissionState.GRANTED);
        call.resolve(r);
    }

    @PermissionCallback
    private void micAnswered(PluginCall call) {
        if (getPermissionState("mic") == PermissionState.GRANTED) begin(call);
        else call.reject("denied", "denied");
    }

    private void begin(PluginCall call) {
        final String lang = call.getString("lang", "ar-SA");
        final ArrayList<String> hints = new ArrayList<>();
        try {
            com.getcapacitor.JSArray arr = call.getArray("hints");
            if (arr != null) for (int i = 0; i < arr.length() && i < 50; i++) hints.add(arr.getString(i));
        } catch (Exception ignored) { }
        main.post(() -> listen(call, lang, hints));
    }

    private void listen(PluginCall call, String lang, ArrayList<String> hints) {
        List<Object> w = ways();
        if (w.isEmpty()) { call.reject("failed", "none"); return; }
        Object how = w.get(Math.min(way, w.size() - 1));
        boolean onDevice = ON_DEVICE.equals(how);
        try {
            release();
            if (onDevice && Build.VERSION.SDK_INT >= 31) sr = SpeechRecognizer.createOnDeviceSpeechRecognizer(getContext());
            else if (how instanceof ComponentName) sr = SpeechRecognizer.createSpeechRecognizer(getContext(), (ComponentName) how);
            else sr = SpeechRecognizer.createSpeechRecognizer(getContext());
            sr.setRecognitionListener(new Listener());
            Intent it = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            it.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            it.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
            it.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
            // the phone's own recogniser: on the device where it can; a fallback service: as it likes (online)
            if (!(how instanceof ComponentName)) it.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
            it.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
            it.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 2500L);
            it.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 2500L);
            // Android 13+: lean towards the words that come next in the text
            if (Build.VERSION.SDK_INT >= 33 && !hints.isEmpty()) it.putStringArrayListExtra(RecognizerIntent.EXTRA_BIASING_STRINGS, hints);
            sr.startListening(it);
            JSObject r = new JSObject();
            r.put("onDevice", onDevice);
            r.put("way", String.valueOf(how));
            call.resolve(r);
        } catch (Exception e) {
            release();
            if (nextWay()) { listen(call, lang, hints); return; }
            call.reject("failed", e);
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        main.post(this::release);
        call.resolve();
    }

    private void release() {
        if (sr == null) return;
        try { sr.cancel(); sr.destroy(); } catch (Exception ignored) { }
        sr = null;
    }

    @Override
    protected void handleOnDestroy() {
        main.post(this::release);
    }

    private static String first(Bundle b) {
        if (b == null) return "";
        ArrayList<String> l = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        return l == null || l.isEmpty() || l.get(0) == null ? "" : l.get(0);
    }

    private class Listener implements RecognitionListener {
        private void send(String name, String text) {
            JSObject o = new JSObject();
            o.put("text", text);
            notifyListeners(name, o);
        }
        @Override public void onReadyForSpeech(Bundle params) { }
        @Override public void onBeginningOfSpeech() { }
        @Override public void onRmsChanged(float rmsdB) { }
        @Override public void onBufferReceived(byte[] buffer) { }
        @Override public void onEndOfSpeech() { }
        @Override public void onEvent(int eventType, Bundle params) { }
        @Override public void onPartialResults(Bundle partial) { String t = first(partial); if (!t.isEmpty()) heardOnce = true; send("partial", t); }
        @Override public void onResults(Bundle results) {
            String t = first(results);
            if (!t.isEmpty()) heardOnce = true;
            send("result", t);
            release();
            notifyListeners("end", new JSObject());
        }
        @Override public void onError(int error) {
            // 3 audio, 4 server, 11 server disconnected, 12/13 no Arabic, 14/15 cannot check languages:
            // this way cannot listen in Arabic here, try the next one (the app starts again on "end").
            boolean noWay = error == 3 || error == 4 || error == 11 || error == 12 || error == 13 || error == 14 || error == 15;
            if (noWay && nextWay()) {
                release();
                notifyListeners("end", new JSObject());
                return;
            }
            JSObject o = new JSObject();
            o.put("code", error);
            notifyListeners("error", o);
            release();
            notifyListeners("end", new JSObject());
        }
    }
}
