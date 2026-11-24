import UIKit
import Capacitor
import WidgetKit

/// The ayah widgets' bridge (src/ui/morning.ts), the iPhone counterpart of DailyPlugin.java: the app hands over today's
/// ayah and My ayah by date, in the chosen translation, with the Arabic as pictures drawn in its Quran font (the Quran is
/// never drawn in a system font), and the theme's colours. They go into the App Group the widget extension reads
/// (AyahWidgets/AyahWidgets.swift); then the widgets are redrawn. A widget tap opens ayahstudio://open#/s/…, kept by the
/// scene (SceneDelegate) and handed to the page once by takeLaunchHash().
@objc(DailyPlugin)
public class DailyPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DailyPlugin"
    public let jsName = "Daily"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "store", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takeLaunchHash", returnType: CAPPluginReturnPromise),
    ]

    static let group = "group.com.brandyco.ayahstudio"
    /// The address a widget tap asked for, until the page takes it.
    static var pendingHash: String?

    /// ayahstudio://open#/s/2/255 → "#/s/2/255".
    static func take(url: URL) -> Bool {
        guard url.scheme == "ayahstudio", let frag = url.fragment, frag.hasPrefix("/") else { return false }
        pendingHash = "#" + frag
        return true
    }

    @objc func store(_ call: CAPPluginCall) {
        guard let defaults = UserDefaults(suiteName: DailyPlugin.group),
              let dir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: DailyPlugin.group)?.appendingPathComponent("daily", isDirectory: true) else {
            call.reject("No App Group")
            return
        }
        let doc: [String: Any] = [
            "today": call.getObject("today") ?? [:],
            "mine": call.getObject("mine") ?? [:],
            "labels": call.getObject("labels") ?? [:],
            "theme": call.getObject("theme") ?? [:],
            "lang": call.getString("lang") == "ar" ? "ar" : "tr",
        ]
        if let data = try? JSONSerialization.data(withJSONObject: doc) { defaults.set(data, forKey: "ayahWidget") }
        if let images = call.getObject("images"), !images.isEmpty {
            let fm = FileManager.default
            try? fm.removeItem(at: dir)
            try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
            for (key, value) in images {
                guard let b64 = value as? String, let png = Data(base64Encoded: b64) else { continue }
                try? png.write(to: dir.appendingPathComponent(key.replacingOccurrences(of: ":", with: "_") + ".png"))
            }
        }
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }

    @objc func takeLaunchHash(_ call: CAPPluginCall) {
        var r: [String: Any] = [:]
        if let h = DailyPlugin.pendingHash { r["hash"] = h; DailyPlugin.pendingHash = nil }
        call.resolve(r)
    }
}
