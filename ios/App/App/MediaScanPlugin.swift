import Foundation
import Photos
import Capacitor

/// Saving an exported reel: on Android MediaScanPlugin.java adds the written file to the gallery; on the iPhone the
/// same call copies it into the Photos library (asks for "add only" access the first time), where Instagram, TikTok
/// and WhatsApp find it. The file itself stays in the app's Documents folder (visible in the Files app).
@objc(MediaScanPlugin)
public class MediaScanPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MediaScanPlugin"
    public let jsName = "MediaScan"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "scan", returnType: CAPPluginReturnPromise),
    ]

    @objc func scan(_ call: CAPPluginCall) {
        guard let path = call.getString("path") else { call.reject("No path"); return }
        let url = path.hasPrefix("file://") ? URL(string: path) : URL(fileURLWithPath: path)
        guard let file = url, FileManager.default.fileExists(atPath: file.path) else { call.reject("File not found"); return }
        let isImage = (call.getString("mime") ?? "").hasPrefix("image/")
        let save = {
            PHPhotoLibrary.shared().performChanges({
                if isImage {
                    PHAssetChangeRequest.creationRequestForAssetFromImage(atFileURL: file)
                } else {
                    PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: file)
                }
            }) { ok, error in
                if ok { call.resolve(["photos": true]) } else { call.reject(error?.localizedDescription ?? "Not saved to Photos") }
            }
        }
        let status = PHPhotoLibrary.authorizationStatus(for: .addOnly)
        if status == .authorized || status == .limited { save(); return }
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { st in
            if st == .authorized || st == .limited { save() } else { call.reject("Photos access denied", "DENIED") }
        }
    }
}
