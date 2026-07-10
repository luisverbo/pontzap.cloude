import { isNative } from './native';

export interface SimpleCoords {
  lat: number;
  lng: number;
}

/**
 * Get the current position using the native Geolocation plugin when running in
 * the app (faster, more accurate, proper Android permission dialog), and fall
 * back to the browser's navigator.geolocation on the web. Same shape both ways.
 */
export async function getCurrentPosition(): Promise<SimpleCoords> {
  if (isNative) {
    const { Geolocation } = await import('@capacitor/geolocation');
    // Ensure permission (Android shows the system dialog here)
    try {
      const perm = await Geolocation.checkPermissions();
      if (perm.location !== 'granted') {
        await Geolocation.requestPermissions();
      }
    } catch {
      /* checkPermissions unsupported — requestPermissions below still runs on getCurrentPosition */
    }
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 15000,
    });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  }

  // Web fallback
  return new Promise<SimpleCoords>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocalização não suportada pelo navegador.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      (error) => reject(error),
      { enableHighAccuracy: true }
    );
  });
}
