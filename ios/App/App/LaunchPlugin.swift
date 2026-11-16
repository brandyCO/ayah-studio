import UIKit
import Capacitor

/// The page's "first screen is up" (src/ui/opening.ts → Launch.ready()), the counterpart of Android's LaunchPlugin:
/// the opening layer (AyahBridgeViewController) fades out once the character has played and the page is drawn.
@objc(LaunchPlugin)
public class LaunchPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LaunchPlugin"
    public let jsName = "Launch"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "ready", returnType: CAPPluginReturnPromise),
    ]
    weak var host: AyahBridgeViewController?

    @objc func ready(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.host?.firstScreenUp() }
        call.resolve()
    }
}
