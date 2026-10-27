import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Check, Loader2, MapPin, User, Mic } from 'lucide-react';
import { handoverAudioUrl, type Handover } from '@/hooks/useHandovers';

interface Props {
  handover: Handover;
  /** Mostra o botão "Ciente" (quem está entrando no turno). */
  onAcknowledge?: (h: Handover) => Promise<void> | void;
  showLocation?: boolean;
  highlight?: boolean;
}

export function HandoverCard({ handover: h, onAcknowledge, showLocation = true, highlight = false }: Props) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    if (h.audio_path) handoverAudioUrl(h.audio_path).then((u) => { if (alive) setAudioUrl(u); });
    return () => { alive = false; };
  }, [h.audio_path]);

  const ack = async () => {
    if (!onAcknowledge) return;
    setBusy(true);
    try { await onAcknowledge(h); } finally { setBusy(false); }
  };

  return (
    <Card className={highlight ? 'border-primary/50 bg-primary/5' : undefined}>
      <CardContent className="p-4 space-y-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 text-xs text-muted-foreground space-y-0.5">
            <p className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" />
              <span className="text-foreground font-medium">{h.employee_name || 'Guardião'}</span>
              <span>·</span>
              {format(new Date(h.created_at), 'dd/MM HH:mm')}
            </p>
            {showLocation && h.location_name && (
              <p className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {h.location_name}
              </p>
            )}
          </div>
          {h.acknowledged_at ? (
            <Badge variant="secondary">Ciente · {h.acknowledged_name || 'Guardião'}</Badge>
          ) : (
            <Badge variant="warning">Não lida</Badge>
          )}
        </div>

        {h.note && <p className="text-sm whitespace-pre-wrap text-foreground/90">{h.note}</p>}

        {h.audio_path && (
          audioUrl ? (
            <audio controls src={audioUrl} className="w-full h-10" preload="none" />
          ) : (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Mic className="h-3.5 w-3.5" /> Carregando áudio…
            </p>
          )
        )}

        {onAcknowledge && !h.acknowledged_at && (
          <div className="border-t border-border/60 pt-3">
            <Button size="sm" className="w-full" onClick={ack} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Check className="h-4 w-4 mr-1.5" />}
              Ciente
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
