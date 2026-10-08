import type { CapacitorConfig } from '@capacitor/cli';

// Android app (Phase 1c). The web build in dist/ is copied into the app by `npx cap sync android`;
// it runs at https://localhost (androidScheme https), which the stock-library proxy allows.
const config: CapacitorConfig = {
  appId: 'com.brandyco.ayahstudio',
  appName: 'Ayah Studio',
  webDir: 'dist',
  server: { androidScheme: 'https' },
};

export default config;
