import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pontzap.funcionario',
  appName: 'PONTZAP',
  webDir: 'dist',
  // Bundled assets are served locally (offline-capable). No remote server URL:
  // the whole employee app ships inside the APK.
  android: {
    backgroundColor: '#2f5d47',
    // Allow the WebView to use the device camera (selfie / QR) and mixed content
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: '#2f5d47',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    Geolocation: {},
  },
};

export default config;
