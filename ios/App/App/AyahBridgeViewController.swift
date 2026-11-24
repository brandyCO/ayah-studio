import UIKit
import ImageIO
import Capacitor

/// The app's web view (Capacitor), with Ayah Studio's own small iPhone plugins registered — the counterparts of the
/// Android Java plugins with the same names, so the web code calls them the same way (src/native.ts, src/ui/theme.ts,
/// src/ui/follow.ts). Plugins the iPhone has no counterpart for (the streak / tasbih / prayer widgets, the Play font pack, the Android
/// media service) are simply not registered: `Capacitor.isPluginAvailable()` is false and the app hides or skips them.
class AyahBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(AppIconPlugin())
        bridge?.registerPluginInstance(MediaScanPlugin())
        bridge?.registerPluginInstance(ExportServicePlugin())
        bridge?.registerPluginInstance(SpeechPlugin())
        bridge?.registerPluginInstance(HapticPlugin())
        bridge?.registerPluginInstance(DailyPlugin())
        let launch = LaunchPlugin()
        launch.host = self
        bridge?.registerPluginInstance(launch)
    }

    // The opening (as on Android, AppActivity.java): opening.webp, the rigged character pre-rendered at 60 fps, plays
    // on a layer in the splash colour over the web view. ImageIO decodes its frames off the main thread and times them
    // from the file, so the page starting underneath cannot make it stutter. He holds his last pose until the page says
    // its first screen is drawn (Launch.ready()), then the layer fades out (at most 7 s).
    private var cover: UIView?
    private var played = false, pageUp = false
    private let started = Date()

    private func playOpening() {
        let splash = UIColor(red: 0x5b / 255, green: 0x3f / 255, blue: 0xbf / 255, alpha: 1)
        let layer = UIView(frame: view.bounds)
        layer.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        layer.backgroundColor = splash
        view.addSubview(layer)
        cover = layer
        guard let url = Bundle.main.url(forResource: "opening", withExtension: "webp"),
              let src = CGImageSourceCreateWithURL(url as CFURL, nil),
              let first = CGImageSourceCreateImageAtIndex(src, 0, nil) else {
            played = true
            finishSoon()
            return
        }
        let count = CGImageSourceGetCount(src)
        let pic = UIImageView(image: UIImage(cgImage: first))
        pic.contentMode = .scaleAspectFit
        picRatio = CGFloat(first.height) / CGFloat(max(1, first.width))
        layer.addSubview(pic)
        self.pic = pic
        placePicture()
        CGAnimateImageAtURLWithBlock(url as CFURL, nil) { [weak self, weak pic] index, image, stop in
            pic?.image = UIImage(cgImage: image)
            if index >= count - 1 {
                stop.pointee = true // once, then he holds the last frame
                self?.played = true
                self?.finishSoon()
            }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 7) { [weak self] in self?.dropCover() }
    }

    private weak var pic: UIImageView?
    private var picRatio: CGFloat = 1

    /** Centred a little above the middle, as wide as fits (the same place as on Android). */
    private func placePicture() {
        guard let pic = pic else { return }
        let b = view.bounds
        let w = min(b.width * 0.94, b.height * 0.66 / picRatio)
        pic.frame = CGRect(x: (b.width - w) / 2, y: (b.height - w * picRatio) / 2 - b.height * 0.05, width: w, height: w * picRatio)
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        placePicture()
    }

    func firstScreenUp() {
        pageUp = true
        finishSoon()
    }

    private func finishSoon() {
        if played && pageUp { dropCover() }
    }

    private func dropCover() {
        guard let layer = cover else { return }
        cover = nil
        UIView.animate(withDuration: 0.25, delay: 0, options: [.curveEaseOut], animations: { layer.alpha = 0 }) { _ in
            layer.removeFromSuperview()
        }
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
        playOpening()
    }
}
