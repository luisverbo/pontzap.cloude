import { isNative } from './native';

/**
 * Save/deliver a generated file. On native we write it to the app's cache and
 * open the system share sheet (the user can "Save to Files", send on WhatsApp,
 * etc.) — the browser <a download> trick does NOT work inside the Android
 * WebView. On web we fall back to the normal blob download.
 *
 * @param filename  e.g. "comprovante-ponto-NSR-000000043.pdf"
 * @param base64    file contents as base64 (no data: prefix)
 * @param mimeType  e.g. "application/pdf"
 * @param dialogTitle title shown on the native share sheet
 * @returns 'shared' | 'downloaded' | 'error'
 */
export async function saveOrShareBase64(
  filename: string,
  base64: string,
  mimeType: string,
  dialogTitle = 'Comprovante de Ponto'
): Promise<'shared' | 'downloaded' | 'error'> {
  if (isNative) {
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');
      // Write to the app cache, then share its file:// URI
      await Filesystem.writeFile({
        path: filename,
        data: base64,
        directory: Directory.Cache,
      });
      const { uri } = await Filesystem.getUri({
        path: filename,
        directory: Directory.Cache,
      });
      await Share.share({
        title: dialogTitle,
        text: dialogTitle,
        url: uri,
        dialogTitle,
      });
      return 'shared';
    } catch (e) {
      console.error('saveOrShareBase64 native error:', e);
      return 'error';
    }
  }

  // Web fallback: standard blob download
  try {
    const byteChars = atob(base64);
    const bytes = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
    const blob = new Blob([bytes], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return 'downloaded';
  } catch (e) {
    console.error('saveOrShareBase64 web error:', e);
    return 'error';
  }
}
