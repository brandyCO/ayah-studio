import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = AyahBridgeViewController()
        window?.makeKeyAndVisible()

        // Opened by a tap on an ayah widget: the page takes the address with Daily.takeLaunchHash().
        for c in connectionOptions.urlContexts { _ = DailyPlugin.take(url: c.url) }
        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        // An ayah widget tapped while the app was open: the page asks on resume (src/ui/morning.ts).
        let rest = URLContexts.filter { !DailyPlugin.take(url: $0.url) }
        if !rest.isEmpty { SceneDelegateProxy.shared.scene(scene, openURLContexts: rest) }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
