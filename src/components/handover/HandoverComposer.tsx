import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Mic, Square, Trash2, Loader2, Send, MessageSquareText } from 'lucide-react';
import { startRecording, isAudioRecordingSupported, type AudioRecording, type AudioRecorderHandle } from '@/lib/audioRecorder';
import { createHandover } from '@/hooks/useHandovers';

interface LocationOption { id: string; name: string }

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Locais que o funcionário pode escolher. Com um só, o seletor some. */
  locations: LocationOption[];
  defaultLocationId?: string | null;
  onSaved?: () => void;
  /** Texto de contexto no topo (ex.: "Você acabou de bater a saída"). */
  hint?: string;
}

/**
 * Diálogo "Deixar passagem de turno": texto e/ou áudio curto.
 * Usado na tela do ponto (logo após a saída) e na página de passagens.
 */
export function HandoverComposer({ open, onOpenChange, locations, defaultLocationId, onSaved, hint }: Props) {
  const [locationId, setLocationId] = useState<string>('');
  const [note, setNote] = useState('');
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [audio, setAudio] = useState<AudioRecording | null>(null);
  const [saving, setSaving] = useState(false);
  const handleRef = useRef<AudioRecorderHandle | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (open) {
      setLocationId(defaultLocationId || locations[0]?.id || '');
      setNote('');
      discardAudio();
    } else {
      // Fechou gravando? Solta o microfone.
      handleRef.current?.cancel();
      handleRef.current = null;
      setRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const discardAudio = () => {
    if (audio) URL.revokeObjectURL(audio.url);
    setAudio(null);
    setElapsed(0);
  };

  const handleRecord = async () => {
    try {
      // Dentro do toque: iOS só libera o microfone assim.
      const handle = await startRecording(120);
      handleRef.current = handle;
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } catch (e: any) {
      toast.error(
        /denied|permission|NotAllowed/i.test(String(e?.name || e?.message))
          ? 'Permita o microfone para gravar.'
          : e?.message || 'Não foi possível gravar.',
      );
    }
  };

  const handleStop = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const handle = handleRef.current;
    handleRef.current = null;
    setRecording(false);
    if (!handle) return;
    const rec = await handle.stop();
    setAudio(rec);
    setElapsed(rec.seconds);
  };

  const handleSave = async () => {
    if (!locationId) { toast.error('Escolha o local.'); return; }
    if (!note.trim() && !audio) { toast.error('Escreva ou grave alguma coisa.'); return; }
    setSaving(true);
    try {
      await createHandover({ locationId, note, audio });
      toast.success('Passagem de turno registrada. Quem entrar vai ver.');
      onOpenChange(false);
      onSaved?.();
    } catch (e: any) {
      toast.error(`Erro ao salvar: ${e?.message || 'desconhecido'}`);
    } finally {
      setSaving(false);
    }
  };

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquareText className="h-5 w-5 text-primary" />
            Passagem de turno
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {hint && <p className="text-sm text-muted-foreground">{hint}</p>}

          {locations.length > 1 && (
            <div className="space-y-2">
              <Label>Local</Label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger><SelectValue placeholder="Escolha o local" /></SelectTrigger>
                <SelectContent>
                  {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>O que o próximo turno precisa saber</Label>
            <Textarea
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex: encomenda do 302 na guarita; bomba da piscina desligada, técnico vem amanhã 9h"
            />
          </div>

          {isAudioRecordingSupported() && (
            <div className="space-y-2">
              <Label>Ou grave um áudio (até 2 min)</Label>
              {audio ? (
                <div className="flex items-center gap-2 rounded-lg border border-border/60 p-2">
                  <audio controls src={audio.url} className="flex-1 h-10" />
                  <Button variant="ghost" size="icon" onClick={discardAudio} aria-label="Descartar áudio">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ) : recording ? (
                <Button variant="destructive" className="w-full" onClick={handleStop}>
                  <Square className="h-4 w-4 mr-2" />
                  Parar · {fmt(elapsed)}
                </Button>
              ) : (
                <Button variant="outline" className="w-full" onClick={handleRecord}>
                  <Mic className="h-4 w-4 mr-2" />
                  Gravar áudio
                </Button>
              )}
            </div>
          )}

          <Button className="w-full" onClick={handleSave} disabled={saving || recording}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Deixar passagem
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
