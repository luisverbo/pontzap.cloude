import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, Loader2 } from 'lucide-react';

/**
 * Reusable front-camera selfie capture for clock-in (anti-fraud).
 *
 * CRITICAL for iOS: `capture()` invokes getUserMedia SYNCHRONOUSLY, so it MUST be
 * called directly inside the button-tap gesture with no `await` before it — any
 * await before it loses the gesture and the camera never opens. Evaluate it first
 * in the handler, e.g. `const photo = await capture();` (the call fires synchronously,
 * then the await suspends).
 *
 * Returns `overlay` (render it once in the component tree) and `capture()` which
 * resolves with a compressed JPEG data URL, or null if the user skips / the camera fails.
 */
export function useSelfieCapture() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const resolveRef = useRef<((v: string | null) => void) | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const attachStream = (stream: MediaStream) => {
    streamRef.current = stream;
    const attach = () => {
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.play().catch(() => {});
      } else {
        setTimeout(attach, 60);
      }
    };
    attach();
  };

  const capture = (): Promise<string | null> => {
    setError(null);
    setReady(false);
    setCapturing(true);

    let streamPromise: Promise<MediaStream>;
    try {
      streamPromise = navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    } catch (e) {
      streamPromise = Promise.reject(e);
    }

    return new Promise((resolve) => {
      resolveRef.current = resolve;
      streamPromise
        .then((stream) => attachStream(stream))
        .catch(async () => {
          // Fallback: some iOS setups reject the facingMode constraint
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            attachStream(stream);
          } catch (e2) {
            console.error('Selfie camera error:', e2);
            setError('Não foi possível abrir a câmera. Verifique a permissão de câmera do navegador.');
          }
        });
    });
  };

  const captureFrame = () => {
    const video = videoRef.current;
    const resolve = resolveRef.current;
    resolveRef.current = null;
    let dataUrl: string | null = null;
    if (video && video.videoWidth > 0) {
      const maxDim = 640;
      const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        dataUrl = canvas.toDataURL('image/jpeg', 0.7);
      }
    }
    stopStream();
    setCapturing(false);
    setReady(false);
    resolve?.(dataUrl);
  };

  const skip = () => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    stopStream();
    setCapturing(false);
    setReady(false);
    setError(null);
    resolve?.(null);
  };

  const overlay = capturing ? (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col items-center justify-center p-4">
      <p className="text-white text-sm mb-3">Confirme sua identidade — tire uma selfie</p>
      <div className="relative w-full max-w-sm aspect-[3/4] rounded-2xl overflow-hidden bg-slate-900 flex items-center justify-center">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          onCanPlay={() => setReady(true)}
          onLoadedMetadata={() => setReady(true)}
          className="w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)' }}
        />
        {!ready && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white/80">
            <Loader2 className="h-8 w-8 animate-spin mb-2" />
            <span className="text-sm">Abrindo câmera...</span>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
            <Camera className="h-8 w-8 text-white/60 mb-2" />
            <span className="text-sm text-white/80">{error}</span>
          </div>
        )}
      </div>
      <div className="flex gap-3 mt-5 w-full max-w-sm">
        <Button variant="outline" className="flex-1 h-12 bg-slate-800 border-slate-700 text-white hover:bg-slate-700" onClick={skip}>
          {error ? 'Continuar sem foto' : 'Pular'}
        </Button>
        <Button
          className="flex-1 h-12 bg-success hover:bg-success/90 text-white disabled:opacity-50"
          onClick={captureFrame}
          disabled={!ready}
        >
          <Camera className="h-5 w-5 mr-2" />
          Capturar
        </Button>
      </div>
    </div>
  ) : null;

  return { capture, overlay };
}
