import type { CapacitorConfig } from '@capacitor/cli';

// Android app (Phase 1c) and iPhone app (docs/ios.md). The web build in dist/ is copied into the apps by
// `npx cap sync`; Android runs it at https://localhost (androidScheme https), the iPhone at capacitor://localhost
// (WKWebView cannot serve https itself); the stock-library proxy allows both.
const config: CapacitorConfig = {
  appId: 'com.brandyco.ayahstudio',
  appName: 'Ayah Studio',
  webDir: 'dist',
  server: { androidScheme: 'https' },
  ios: {
    // The page draws under the notch and home bar itself (env(safe-area-inset-*)), like a home-screen web app.
    contentInset: 'never',
    backgroundColor: '#5b3fbf',
    allowsLinkPreview: false,
    // Media plays inline (the Listen bar, background videos), never the full-screen iPhone player.
    preferredContentMode: 'mobile',
  },
  plugins: {
    // Ramadan reminders (T7): local notifications with a crescent as the small icon.
    LocalNotifications: { smallIcon: 'ic_stat_crescent', iconColor: '#0a6e55' },
    // Only Google and Apple sign-in: the Facebook SDK and the others are left out of both apps.
    SocialLogin: { providers: { google: true, apple: true, facebook: false, twitter: false } },
  },
};

export default config;
