import UIKit
import Capacitor

/// The home-screen icon follows the theme or the unlockable tier the user wears (src/ui/theme.ts, src/ui/appIcons.ts;
/// on Android AppIcons.java). Icons: Assets.xcassets/AppIcon-{id} (scripts/make-character-icons.py --ios), listed in
/// the target's ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES. "emerald" (the default theme) is the main icon.
/// iOS shows a short "You have changed the icon" note each time it changes, so it is changed only when it differs.
@objc(AppIconPlugin)
public class AppIconPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppIconPlugin"
    public let jsName = "AppIcon"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
    ]

    @objc func set(_ call: CAPPluginCall) {
        let id = call.getString("id") ?? ""
        let safe = id.range(of: "^[a-z]{1,20}$", options: .regularExpression) != nil
        let want: String? = (!safe || id == "emerald") ? nil : "AppIcon-\(id)"
        DispatchQueue.main.async {
            let app = UIApplication.shared
            guard app.supportsAlternateIcons else { call.resolve(); return }
            if app.alternateIconName == want { call.resolve(); return }
            if app.applicationState != .active {
                // iOS refuses while the app is not on screen: try once it is back.
                var token: NSObjectProtocol?
                token = NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { _ in
                    if let t = token { NotificationCenter.default.removeObserver(t) }
                    if app.alternateIconName != want { app.setAlternateIconName(want) { _ in } }
                }
                call.resolve()
                return
            }
            app.setAlternateIconName(want) { error in
                if let error = error { call.reject(error.localizedDescription) } else { call.resolve() }
            }
        }
    }
}
