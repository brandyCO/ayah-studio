package com.brandyco.ayahstudio;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
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

/**
 * Voice follow-along in a tasmi' (src/ui/follow.ts): the phone's own speech recognition in Arabic, on the
 * device where it can (Android 12+ with the Arabic offline pack), otherwise the system recogniser with
 * "prefer offline". Only text comes back: no audio is kept. Each utterance ends on a pause; the app starts
 * the next one while the user is still reciting.
 * Events: "partial" {text}, "result" {text}, "end" {}, "error" {code}.
 */
@CapacitorPlugin(name = "Speech", permissions = { @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "mic") })
public class SpeechPlugin extends Plugin {
    private SpeechRecognizer sr;
    private final Handler main = new Handler(Looper.getMainLooper());

    @PluginMethod
    public void available(PluginCall call) {
        JSObject r = new JSObject();
        boolean onDevice = Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext());
        r.put("available", onDevice || SpeechRecognizer.isRecognitionAvailable(getContext()));
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

    @PermissionCallback
    private void micAnswered(PluginCall call) {
        if (getPermissionState("mic") == PermissionState.GRANTED) begin(call);
        else call.reject("denied", "denied");
    }

    private void begin(PluginCall call) {
        final String lang = call.getString("lang", "ar-SA");
        main.post(() -> {
            try {
                release();
                boolean onDevice = Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext());
                sr = onDevice ? SpeechRecognizer.createOnDeviceSpeechRecognizer(getContext()) : SpeechRecognizer.createSpeechRecognizer(getContext());
                sr.setRecognitionListener(new Listener());
                Intent it = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                it.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                it.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
                it.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
                it.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
                it.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
                it.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 2500L);
                it.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 2500L);
                sr.startListening(it);
                JSObject r = new JSObject();
                r.put("onDevice", onDevice);
                call.resolve(r);
            } catch (Exception e) {
                release();
                call.reject("failed", e);
            }
        });
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
        @Override public void onPartialResults(Bundle partial) { send("partial", first(partial)); }
        @Override public void onResults(Bundle results) {
            send("result", first(results));
            release();
            notifyListeners("end", new JSObject());
        }
        @Override public void onError(int error) {
            JSObject o = new JSObject();
            o.put("code", error);
            notifyListeners("error", o);
            release();
            notifyListeners("end", new JSObject());
        }
    }
}
