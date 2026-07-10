import { isNative } from './native';
import { ensureLocationPermission } from './nativePermissions';

export interface SimpleCoords {
  lat: number;
  lng: number;
}

export type GeoErrorKind = 'permission' | 'disabled' | 'unavailable';

export class GeoError extends Error {
  kind: GeoErrorKind;
  constructor(kind: GeoErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

/**
 * Get the current position using the native Geolocation plugin in the app
 * (proper Android permission dialog, faster/more accurate) and the browser's
 * navigator.geolocation on the web. Throws a typed GeoError so callers can tell
 * "no permission" from "GPS turned off" from "couldn't get a fix".
 */
export async function getCurrentPosition(): Promise<SimpleCoords> {
  if (isNative) {
    const granted = await ensureLocationPermission();
    if (!granted) {
      throw new GeoError('permission', 'Permissão de localização negada.');
    }
    const { Geolocation } = await import('@capacitor/geolocation');
    try {
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15000,
      });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch (e: any) {
      const msg = String(e?.message || e || '').toLowerCase();
      // Android throws this when the device's Location/GPS toggle is OFF
      if (msg.includes('disabled') || msg.includes('location services') || msg.includes('not enabled')) {
        throw new GeoError('disabled', 'O GPS do celular está desligado.');
      }
      if (msg.includes('denied') || msg.includes('permission')) {
        throw new GeoError('permission', 'Permissão de localização negada.');
      }
      throw new GeoError('unavailable', 'Não foi possível obter a localização.');
    }
  }

  // Web fallback
  return new Promise<SimpleCoords>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new GeoError('unavailable', 'Geolocalização não suportada pelo navegador.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(new GeoError('permission', 'Permissão de localização negada.'));
        } else {
          reject(new GeoError('unavailable', 'Não foi possível obter a localização.'));
        }
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  });
}

/**
 * Open the device settings so the user can turn Location/GPS on (native only).
 * Falls back gracefully if the plugin call isn't available.
 */
export async function openLocationSettings(): Promise<void> {
  if (!isNative) return;
  try {
    const { NativeSettings, AndroidSettings } = await import('capacitor-native-settings');
    await NativeSettings.openAndroid({ option: AndroidSettings.Location });
  } catch (e) {
    console.error('openLocationSettings unavailable:', e);
  }
}
