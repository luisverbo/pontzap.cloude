import { isNative } from './native';

/**
 * Ask for the native location permission (shows the Android system dialog on
 * first use). Returns true if granted. No-op → true on web (the browser prompts
 * on getCurrentPosition itself).
 */
export async function ensureLocationPermission(): Promise<boolean> {
  if (!isNative) return true;
  try {
    const { Geolocation } = await import('@capacitor/geolocation');
    let status = await Geolocation.checkPermissions();
    if (status.location !== 'granted' && status.coarseLocation !== 'granted') {
      status = await Geolocation.requestPermissions({ permissions: ['location'] });
    }
    return status.location === 'granted' || status.coarseLocation === 'granted';
  } catch (e) {
    console.error('ensureLocationPermission error:', e);
    return false;
  }
}

/**
 * Ask for the native camera permission (shows the Android system dialog). Once
 * granted, the WebView's getUserMedia (QR scanner / selfie) is allowed to open
 * the camera. No-op → true on web.
 */
export async function ensureCameraPermission(): Promise<boolean> {
  if (!isNative) return true;
  try {
    const { Camera } = await import('@capacitor/camera');
    let status = await Camera.checkPermissions();
    if (status.camera !== 'granted') {
      status = await Camera.requestPermissions({ permissions: ['camera'] });
    }
    return status.camera === 'granted';
  } catch (e) {
    console.error('ensureCameraPermission error:', e);
    return false;
  }
}
