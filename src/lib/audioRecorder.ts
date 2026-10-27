/**
 * Gravação de áudio curta (passagem de turno) com MediaRecorder.
 * Funciona no navegador e dentro do WebView do app Android (precisa da
 * permissão RECORD_AUDIO declarada no manifest — o CI já faz isso).
 */

export interface AudioRecording {
  blob: Blob;
  mimeType: string;
  seconds: number;
  /** URL local para pré-escuta; chame URL.revokeObjectURL ao descartar. */
  url: string;
}

export interface AudioRecorderHandle {
  stop: () => Promise<AudioRecording>;
  cancel: () => void;
}

function pickMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(c)) return c;
  }
  return '';
}

export function isAudioRecordingSupported(): boolean {
  return typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

/** Extensão de arquivo coerente com o mimeType gravado. */
export function audioExtension(mimeType: string): string {
  if (mimeType.includes('mp4')) return 'm4a';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'webm';
}

/**
 * Pede o microfone e começa a gravar. Lança erro se o usuário negar.
 * Mantenha a chamada dentro do gesto de toque (iOS exige).
 */
export async function startRecording(maxSeconds = 120): Promise<AudioRecorderHandle> {
  if (!isAudioRecordingSupported()) {
    throw new Error('Gravação de áudio não suportada neste aparelho.');
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  const startedAt = Date.now();

  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  recorder.start(250);

  const releaseStream = () => stream.getTracks().forEach((t) => t.stop());

  let autoStop: ReturnType<typeof setTimeout> | null = null;
  let resolveStop: ((r: AudioRecording) => void) | null = null;

  const finish = () => {
    const type = recorder.mimeType || mimeType || 'audio/webm';
    const blob = new Blob(chunks, { type });
    const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    releaseStream();
    const result = { blob, mimeType: type, seconds, url: URL.createObjectURL(blob) };
    resolveStop?.(result);
  };

  recorder.onstop = finish;

  const stop = () =>
    new Promise<AudioRecording>((resolve) => {
      resolveStop = resolve;
      if (autoStop) clearTimeout(autoStop);
      if (recorder.state !== 'inactive') recorder.stop();
      else finish();
    });

  // Limite de duração: ninguém precisa de passagem de turno de 10 minutos.
  autoStop = setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, maxSeconds * 1000);

  const cancel = () => {
    if (autoStop) clearTimeout(autoStop);
    recorder.onstop = null;
    if (recorder.state !== 'inactive') recorder.stop();
    releaseStream();
  };

  return { stop, cancel };
}
