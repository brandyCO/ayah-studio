import Foundation
import AVFoundation
import Speech
import Capacitor

/// "Follow my voice" (src/ui/follow.ts) on the iPhone: Apple's speech recogniser in Arabic, on the device when the
/// phone has it, listening one utterance at a time like Android's SpeechPlugin.java (same calls and events):
/// "partial" {text}, "result" {text}, "end" {}, "error" {code}. An utterance ends after a pause (no new words for
/// PAUSE seconds), then "result" + "end", and the app starts the next one at once. Only text comes back; no audio
/// is kept. Error codes follow Android's so the app reacts the same: 9 no permission, 12 no Arabic recogniser,
/// 7 nothing understood, 3 audio problem, 8 busy.
@objc(SpeechPlugin)
public class SpeechPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SpeechPlugin"
    public let jsName = "Speech"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "mic", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]
    private static let PAUSE: TimeInterval = 1.1
    private let engine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var recognizer: SFSpeechRecognizer?
    private var pauseTimer: Timer?
    private var last = ""
    private var ended = true

    private func arabic(_ lang: String?) -> SFSpeechRecognizer? {
        for id in [lang ?? "ar-SA", "ar-SA", "ar-AE", "ar"] {
            if let r = SFSpeechRecognizer(locale: Locale(identifier: id)) { return r }
        }
        return nil
    }

    @objc func available(_ call: CAPPluginCall) {
        guard let r = arabic(nil) else {
            call.resolve(["available": false, "onDevice": false, "arabic": "no"]); return
        }
        call.resolve(["available": r.isAvailable, "onDevice": r.supportsOnDeviceRecognition, "arabic": "yes"])
    }

    @objc func mic(_ call: CAPPluginCall) {
        AVAudioSession.sharedInstance().requestRecordPermission { ok in call.resolve(["granted": ok]) }
    }

    private func permitted(_ done: @escaping (Bool) -> Void) {
        let ask = {
            AVAudioSession.sharedInstance().requestRecordPermission { ok in DispatchQueue.main.async { done(ok) } }
        }
        switch SFSpeechRecognizer.authorizationStatus() {
        case .authorized: ask()
        case .notDetermined:
            SFSpeechRecognizer.requestAuthorization { st in
                if st == .authorized { ask() } else { DispatchQueue.main.async { done(false) } }
            }
        default: DispatchQueue.main.async { done(false) }
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        let lang = call.getString("lang")
        let hints = (call.getArray("hints") as? [String]) ?? []
        permitted { ok in
            guard ok else { call.reject("Microphone or speech recognition denied", "denied"); return }
            guard let r = self.arabic(lang), r.isAvailable else {
                call.resolve(["onDevice": false, "way": "ios-none"])
                self.fail(12)
                return
            }
            self.release()
            self.recognizer = r
            do {
                let s = AVAudioSession.sharedInstance()
                try s.setCategory(.playAndRecord, mode: .measurement, options: [.duckOthers, .defaultToSpeaker, .allowBluetooth])
                try s.setActive(true, options: .notifyOthersOnDeactivation)
                let req = SFSpeechAudioBufferRecognitionRequest()
                req.shouldReportPartialResults = true
                req.taskHint = .dictation
                req.contextualStrings = Array(hints.prefix(80))
                if r.supportsOnDeviceRecognition { req.requiresOnDeviceRecognition = true }
                self.request = req
                let input = self.engine.inputNode
                let format = input.outputFormat(forBus: 0)
                input.removeTap(onBus: 0)
                input.installTap(onBus: 0, bufferSize: 1024, format: format) { buf, _ in req.append(buf) }
                self.engine.prepare()
                try self.engine.start()
                self.last = ""
                self.ended = false
                self.task = r.recognitionTask(with: req) { [weak self] result, error in
                    DispatchQueue.main.async { self?.heard(result, error) }
                }
                call.resolve(["onDevice": req.requiresOnDeviceRecognition, "way": req.requiresOnDeviceRecognition ? "ios-device" : "ios"])
            } catch {
                self.release()
                call.resolve(["onDevice": false, "way": "ios"])
                self.fail(3)
            }
        }
    }

    private func heard(_ result: SFSpeechRecognitionResult?, _ error: Error?) {
        if ended { return }
        if let result = result {
            let text = result.bestTranscription.formattedString
            if result.isFinal {
                finish(text)
                return
            }
            if text != last {
                last = text
                notifyListeners("partial", data: ["text": text])
                // A pause after some words ends this utterance (Apple's recogniser would keep going for a minute).
                pauseTimer?.invalidate()
                pauseTimer = Timer.scheduledTimer(withTimeInterval: SpeechPlugin.PAUSE, repeats: false) { [weak self] _ in
                    guard let self = self, !self.ended else { return }
                    self.finish(self.last)
                }
            }
        }
        if let error = error as NSError? {
            if !last.isEmpty { finish(last); return }
            // 1110: no speech heard; 203/1700s: nothing understood
            fail(error.code == 1110 || error.code == 203 ? 7 : error.code == 1101 ? 7 : 3)
        }
    }

    private func finish(_ text: String) {
        if ended { return }
        release()
        notifyListeners("result", data: ["text": text])
        notifyListeners("end", data: [:])
    }

    private func fail(_ code: Int) {
        release()
        notifyListeners("error", data: ["code": code])
        notifyListeners("end", data: [:])
    }

    private func release() {
        ended = true
        pauseTimer?.invalidate()
        pauseTimer = nil
        if engine.isRunning { engine.stop() }
        engine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        task?.cancel()
        task = nil
        request = nil
        // Back to playback, so recitation keeps playing in the background and through the speaker.
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.release(); call.resolve() }
    }
}
