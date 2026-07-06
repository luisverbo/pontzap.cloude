import { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { X, Camera, Loader2, QrCode, MapPin } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ClockType, CLOCK_TYPE_LABELS } from '@/types';

interface QRCodeScannerProps {
  onScan: (locationId: string, locationName: string) => void;
  onClose: () => void;
  onClockIn: (type: ClockType, locationId: string, photo?: string) => Promise<{ success: boolean }>;
  disabledTypes: ClockType[];
  defaultClockType?: ClockType | null;
  onGPSFallback?: () => void;
  hasLocation?: boolean;
}

export function QRCodeScanner({ 
  onScan, 
  onClose, 
  onClockIn, 
  disabledTypes, 
  defaultClockType,
  onGPSFallback,
  hasLocation = false
}: QRCodeScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scannedLocation, setScannedLocation] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading] = useState<ClockType | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const photoResolveRef = useRef<((v: string | null) => void) | null>(null);
  const [capturingPhoto, setCapturingPhoto] = useState(false);
  const [photoCameraReady, setPhotoCameraReady] = useState(false);
  const [photoCameraError, setPhotoCameraError] = useState<string | null>(null);

  const stopPhotoStream = () => {
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

  // Show an in-page front-camera preview; resolve with a compressed selfie when
  // the user taps Capturar (or null if they skip). CRITICAL for iOS: getUserMedia
  // is invoked SYNCHRONOUSLY here, directly in the button-tap gesture — any await
  // before it loses the gesture and the camera never opens. The QR scanner camera
  // is already stopped by the time these buttons are shown.
  const startPhotoCapture = (): Promise<string | null> => {
    setPhotoCameraError(null);
    setPhotoCameraReady(false);
    setCapturingPhoto(true);

    let streamPromise: Promise<MediaStream>;
    try {
      streamPromise = navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    } catch (e) {
      streamPromise = Promise.reject(e);
    }

    return new Promise((resolve) => {
      photoResolveRef.current = resolve;
      streamPromise
        .then((stream) => attachStream(stream))
        .catch(async () => {
          // Fallback: some iOS setups reject the facingMode constraint
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            attachStream(stream);
          } catch (e2) {
            console.error('Selfie camera error:', e2);
            setPhotoCameraError('Não foi possível abrir a câmera. Verifique a permissão de câmera do navegador.');
          }
        });
    });
  };

  const captureFrame = () => {
    const video = videoRef.current;
    const resolve = photoResolveRef.current;
    photoResolveRef.current = null;
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
    stopPhotoStream();
    setCapturingPhoto(false);
    setPhotoCameraReady(false);
    resolve?.(dataUrl);
  };

  const skipPhoto = () => {
    const resolve = photoResolveRef.current;
    photoResolveRef.current = null;
    stopPhotoStream();
    setCapturingPhoto(false);
    setPhotoCameraReady(false);
    setPhotoCameraError(null);
    resolve?.(null);
  };

  // Auto-start camera when component mounts
  useEffect(() => {
    const timer = setTimeout(() => {
      startScanner();
    }, 300);
    
    return () => {
      clearTimeout(timer);
      stopScanner();
      stopPhotoStream();
    };
  }, []);

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState();
        if (state === 2) { // Html5QrcodeScannerState.SCANNING
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch (error) {
        console.log('Scanner cleanup:', error);
      }
      scannerRef.current = null;
    }
    setIsScanning(false);
  };

  const startScanner = async () => {
    setCameraError(null);

    // Wait for container to be ready
    await new Promise(resolve => setTimeout(resolve, 100));

    if (!document.getElementById('qr-reader')) {
      console.log('QR reader container not ready');
      return;
    }

    // Let html5-qrcode request the camera directly (single permission prompt).
    try {
      const html5QrCode = new Html5Qrcode('qr-reader');
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        async (decodedText) => {
          await stopScanner();
          await handleQRCodeScanned(decodedText);
        },
        () => {
          // QR code not found - ignore
        }
      );

      setIsScanning(true);
      setHasPermission(true);
    } catch (error: any) {
      console.error('Error starting scanner:', error);
      setHasPermission(false);
      
      if (error.message?.includes('Permission')) {
        setCameraError('Permissão de câmera negada. Por favor, permita o acesso à câmera nas configurações do navegador.');
      } else {
        setCameraError('Não foi possível iniciar a câmera. Tente novamente ou use a opção sem QR Code.');
      }
    }
  };

  const handleQRCodeScanned = async (qrCode: string) => {
    try {
      // Find location by QR code
      const { data: location, error } = await supabase
        .from('locations')
        .select('id, name')
        .eq('qr_code', qrCode)
        .single();

      if (error || !location) {
        toast.error('QR Code inválido. Este código não pertence a nenhum local de trabalho.');
        // Restart scanner
        setTimeout(() => startScanner(), 1000);
        return;
      }

      setScannedLocation(location);
      onScan(location.id, location.name);
      toast.success(`Local identificado: ${location.name}`);

      // Do NOT auto-clock: we always show the Entrada/Saída buttons so the punch
      // (and the selfie capture) happens inside a real tap gesture — required for
      // the camera to open on iOS.
    } catch (error) {
      console.error('Error validating QR code:', error);
      toast.error('Erro ao validar QR Code');
      setTimeout(() => startScanner(), 1000);
    }
  };

  const handleClockIn = async (type: ClockType, locationId?: string) => {
    const locId = locationId || scannedLocation?.id;
    if (!locId) return;

    // Capture a selfie (in-page front camera). Auto-clock (locationId passed
    // from a decoded QR, no tap) skips it.
    const photo = locationId ? null : await startPhotoCapture();

    setLoading(type);
    const result = await onClockIn(type, locId, photo || undefined);

    if (result.success) {
      onClose();
    }

    setLoading(null);
  };

  const clockButtons = [
    { type: 'entry' as ClockType, label: 'Entrada', color: 'bg-success hover:bg-success/90' },
    { type: 'exit' as ClockType, label: 'Saída', color: 'bg-accent hover:bg-accent/90' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm animate-fade-in overflow-auto">
      {/* Selfie capture overlay (in-page front camera) */}
      {capturingPhoto && (
        <div className="fixed inset-0 z-[60] bg-black flex flex-col items-center justify-center p-4">
          <p className="text-white text-sm mb-3">Confirme sua identidade — tire uma selfie</p>
          <div className="relative w-full max-w-sm aspect-[3/4] rounded-2xl overflow-hidden bg-slate-900 flex items-center justify-center">
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              onCanPlay={() => setPhotoCameraReady(true)}
              onLoadedMetadata={() => setPhotoCameraReady(true)}
              className="w-full h-full object-cover"
              style={{ transform: 'scaleX(-1)' }}
            />
            {!photoCameraReady && !photoCameraError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white/80">
                <Loader2 className="h-8 w-8 animate-spin mb-2" />
                <span className="text-sm">Abrindo câmera...</span>
              </div>
            )}
            {photoCameraError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
                <Camera className="h-8 w-8 text-white/60 mb-2" />
                <span className="text-sm text-white/80">{photoCameraError}</span>
              </div>
            )}
          </div>
          <div className="flex gap-3 mt-5 w-full max-w-sm">
            <Button variant="outline" className="flex-1 h-12 bg-slate-800 border-slate-700 text-white hover:bg-slate-700" onClick={skipPhoto}>
              {photoCameraError ? 'Continuar sem foto' : 'Pular'}
            </Button>
            <Button
              className="flex-1 h-12 bg-success hover:bg-success/90 text-white disabled:opacity-50"
              onClick={captureFrame}
              disabled={!photoCameraReady}
            >
              <Camera className="h-5 w-5 mr-2" />
              Capturar
            </Button>
          </div>
        </div>
      )}

      <div className="container max-w-md mx-auto px-4 py-4 sm:py-6 min-h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2">
            <QrCode className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            Scanner QR Code
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-10 w-10 touch-manipulation">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Scanner Area */}
        {!scannedLocation ? (
          <Card className="flex-1 flex flex-col">
            <CardContent className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6">
              <div className="w-full space-y-3 sm:space-y-4">
                {/* Camera container - always rendered for html5-qrcode */}
                <div 
                  id="qr-reader" 
                  ref={containerRef}
                  className="rounded-lg sm:rounded-xl overflow-hidden min-h-[250px] sm:min-h-[300px]"
                />
                
                {!isScanning && !cameraError && (
                  <div className="text-center">
                    <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 animate-spin text-primary mx-auto mb-2" />
                    <p className="text-xs sm:text-sm text-muted-foreground">Iniciando câmera...</p>
                  </div>
                )}
                
                {cameraError && (
                  <div className="text-center space-y-3 sm:space-y-4 p-3 sm:p-4">
                    <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
                      <Camera className="h-6 w-6 sm:h-8 sm:w-8 text-destructive" />
                    </div>
                    <p className="text-xs sm:text-sm text-destructive font-medium">{cameraError}</p>
                    <Button onClick={startScanner} variant="outline" className="w-full h-11 touch-manipulation">
                      <Camera className="h-4 w-4 mr-2" />
                      Tentar Novamente
                    </Button>
                  </div>
                )}
                
                {isScanning && (
                  <p className="text-center text-xs sm:text-sm text-muted-foreground">
                    Posicione o QR Code dentro da área de leitura
                  </p>
                )}
                
                {/* GPS Fallback Option */}
                {onGPSFallback && (
                  <div className="border-t pt-3 sm:pt-4 mt-3 sm:mt-4">
                    <p className="text-center text-xs sm:text-sm text-muted-foreground mb-2 sm:mb-3">
                      Problemas com o QR Code?
                    </p>
                    <Button 
                      variant="outline" 
                      onClick={onGPSFallback}
                      className="w-full h-12 sm:h-11 bg-gradient-to-br from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white border-0 shadow-md touch-manipulation text-sm sm:text-base"
                      disabled={!hasLocation}
                    >
                      <MapPin className="h-4 w-4 mr-2" />
                      Bater ponto sem QR Code
                    </Button>
                    {!hasLocation && (
                      <p className="text-[10px] sm:text-xs text-muted-foreground text-center mt-2">
                        Aguardando localização GPS...
                      </p>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          /* Clock-in Selection */
          <Card className="flex-1 flex flex-col">
            <CardHeader className="text-center pb-2 px-4 sm:px-6">
              <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-2 rounded-full bg-success/10 flex items-center justify-center">
                <QrCode className="h-6 w-6 sm:h-8 sm:w-8 text-success" />
              </div>
              <CardTitle className="text-base sm:text-lg">Local Identificado</CardTitle>
              <p className="text-xl sm:text-2xl font-bold text-primary">{scannedLocation.name}</p>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col px-4 sm:px-6 pb-4 sm:pb-6">
              <p className="text-center text-muted-foreground mb-4 sm:mb-6 text-sm">
                Selecione o tipo de registro
              </p>
              <div className="grid grid-cols-2 gap-3 sm:gap-4 flex-1">
                {clockButtons.map((btn) => {
                  const isDisabled = disabledTypes.includes(btn.type);
                  return (
                    <Button
                      key={btn.type}
                      size="xl"
                      className={`${btn.color} text-white flex-col h-20 sm:h-24 gap-1.5 sm:gap-2 rounded-xl touch-manipulation`}
                      onClick={() => handleClockIn(btn.type)}
                      disabled={loading !== null || isDisabled}
                    >
                      {loading === btn.type ? (
                        <Loader2 className="h-5 w-5 sm:h-6 sm:w-6 animate-spin" />
                      ) : (
                        <span className="text-sm sm:text-base font-semibold">{btn.label}</span>
                      )}
                      {isDisabled && (
                        <span className="text-[10px] sm:text-xs opacity-70">Já registrado</span>
                      )}
                    </Button>
                  );
                })}
              </div>
              <Button 
                variant="outline" 
                onClick={() => {
                  setScannedLocation(null);
                  setTimeout(() => startScanner(), 300);
                }}
                className="w-full mt-3 sm:mt-4 h-11 touch-manipulation"
              >
                Escanear Outro QR Code
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
