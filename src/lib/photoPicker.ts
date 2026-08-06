import { isNative } from './native';
import { ensureCameraPermission } from './nativePermissions';

/**
 * Pick a photo (camera or gallery) and return it as a compressed JPEG data URL.
 * Uses the native Camera plugin in the app — the plain <input type="file">
 * is unreliable inside the Android WebView — and falls back to a file input
 * on the web. Returns null when the user cancels.
 */
export async function pickPhoto(source: 'camera' | 'gallery' = 'camera'): Promise<string | null> {
  if (isNative) {
    const ok = await ensureCameraPermission();
    if (!ok && source === 'camera') return null;
    try {
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
      const photo = await Camera.getPhoto({
        quality: 65,
        width: 1280,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
        promptLabelHeader: 'Foto da ocorrência',
        promptLabelCancel: 'Cancelar',
      });
      return photo.dataUrl ?? null;
    } catch {
      // User cancelled or the plugin failed — treat both as "no photo"
      return null;
    }
  }

  // Web: hidden file input + canvas downscale
  return new Promise<string | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (source === 'camera') input.capture = 'environment';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 1280;
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(null);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.65));
        };
        img.onerror = () => resolve(null);
        img.src = String(reader.result);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    };
    // If the user dismisses the picker onchange never fires; that's fine —
    // the promise just stays pending until the component unmounts.
    input.click();
  });
}

/** Convert a data URL to a Blob for upload. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, b64] = dataUrl.split(',');
  const mime = /:(.*?);/.exec(header)?.[1] || 'image/jpeg';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
