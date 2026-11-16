import UIKit
import Capacitor

/// The app's web view (Capacitor), with Ayah Studio's own small iPhone plugins registered — the counterparts of the
/// Android Java plugins with the same names, so the web code calls them the same way (src/native.ts, src/ui/theme.ts,
/// src/ui/follow.ts). Plugins the iPhone has no counterpart for (home-screen widgets, the Play font pack, the Android
/// media service) are simply not registered: `Capacitor.isPluginAvailable()` is false and the app hides or skips them.
class AyahBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(AppIconPlugin())
        bridge?.registerPluginInstance(MediaScanPlugin())
        bridge?.registerPluginInstance(ExportServicePlugin())
        bridge?.registerPluginInstance(SpeechPlugin())
        bridge?.registerPluginInstance(HapticPlugin())
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        // The splash colour behind the page while it loads and when it bounces (no white flash).
        let night = UIColor(red: 0x5b / 255, green: 0x3f / 255, blue: 0xbf / 255, alpha: 1)
        view.backgroundColor = night
        webView?.isOpaque = false
        webView?.backgroundColor = night
        webView?.scrollView.backgroundColor = night
        // The page scrolls inside itself; the web view never rubber-bands as a whole.
        webView?.scrollView.bounces = false
        webView?.allowsLinkPreview = false
    }
}
