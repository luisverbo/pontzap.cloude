import { Capacitor } from '@capacitor/core';

/** True when running inside the native Android/iOS shell (not a browser). */
export const isNative = Capacitor.isNativePlatform();

/** The current platform: 'android' | 'ios' | 'web'. */
export const platform = Capacitor.getPlatform();

/**
 * Native-only startup: hide the splash screen once the web app is ready and
 * style the status bar to match the brand. Safe no-op on web.
 */
export async function initNativeApp(): Promise<void> {
  if (!isNative) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Dark }); // dark = light icons on our green bar
    if (platform === 'android') {
      await StatusBar.setBackgroundColor({ color: '#2f5d47' });
    }
  } catch {
    /* status bar plugin unavailable — ignore */
  }
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide();
  } catch {
    /* splash plugin unavailable — ignore */
  }
}
