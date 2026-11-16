import UIKit
import Capacitor

/// The Taptic Engine for the page's vibrate() (src/iosHaptics.ts): WKWebView has none of its own.
@objc(HapticPlugin)
public class HapticPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HapticPlugin"
    public let jsName = "Haptic"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "impact", returnType: CAPPluginReturnNone),
    ]
    private lazy var light = UIImpactFeedbackGenerator(style: .light)
    private lazy var medium = UIImpactFeedbackGenerator(style: .medium)
    private lazy var heavy = UIImpactFeedbackGenerator(style: .heavy)

    @objc func impact(_ call: CAPPluginCall) {
        let style = call.getString("style") ?? "light"
        DispatchQueue.main.async {
            let g = style == "heavy" ? self.heavy : style == "medium" ? self.medium : self.light
            g.impactOccurred()
            g.prepare()
        }
    }
}
