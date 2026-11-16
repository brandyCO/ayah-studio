import UIKit
import Capacitor

/// While a reel is being made (src/native.ts exportGuard): the screen stays on, and if the user leaves the app iOS
/// is asked for the extra time it gives (usually ~30 s) so a nearly finished export can complete. Android's
/// ExportService.java is a full foreground service; the iPhone has no such thing, so the page also says to keep
/// the app open. Reciter downloads use the same guard.
@objc(ExportServicePlugin)
public class ExportServicePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ExportServicePlugin"
    public let jsName = "ExportService"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "progress", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]
    private var task: UIBackgroundTaskIdentifier = .invalid

    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            UIApplication.shared.isIdleTimerDisabled = true
            if self.task == .invalid {
                self.task = UIApplication.shared.beginBackgroundTask(withName: "export") { [weak self] in self?.end() }
            }
            call.resolve()
        }
    }

    @objc func progress(_ call: CAPPluginCall) { call.resolve() }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.end(); call.resolve() }
    }

    private func end() {
        UIApplication.shared.isIdleTimerDisabled = false
        if task != .invalid {
            UIApplication.shared.endBackgroundTask(task)
            task = .invalid
        }
    }
}
