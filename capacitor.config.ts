import type { CapacitorConfig } from '@capacitor/cli';

// Android app (Phase 1c). The web build in dist/ is copied into the app by `npx cap sync android`;
// it runs at https://localhost (androidScheme https), which the stock-library proxy allows.
const config: CapacitorConfig = {
  appId: 'com.brandyco.ayahstudio',
  appName: 'Ayah Studio',
  webDir: 'dist',
  server: { androidScheme: 'https' },
  // Ramadan reminders (T7): local notifications with a crescent as the small icon.
  plugins: { LocalNotifications: { smallIcon: 'ic_stat_crescent', iconColor: '#0a6e55' } },
};

export default config;
