import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Building2, KeyRound, Loader2, RefreshCw, Users, History, ClipboardList, MessageSquareText, Phone, ShieldCheck,
} from 'lucide-react';
import logoPontzap from '@/assets/logo-pontzap.png';

interface Person {
  name: string;
  status: 'on_duty' | 'break' | 'absent' | 'done';
  status_label: string;
  since: string | null;
  punches?: { type: string; at: string }[];
}

interface PortalData {
  location_name: string;
  company_name: string | null;
  company_phone: string | null;
  welcome_text: string | null;
  generated_at: string;
  sections: { on_duty: boolean; times: boolean; history_days: number; occurrences: boolean; handovers: boolean };
  today?: { date: string; people: Person[] };
  history?: { date: string; people: { name: string; entry?: string | null; exit?: string | null }[] }[];
  occurrences?: { type_name: string; description: string; severity: string; occurred_at: string; public_token: string | null }[];
  handovers?: { name: string; note: string | null; audio_url: string | null; audio_seconds: number | null; created_at: string }[];
}

const PUNCH_LABEL: Record<string, string> = {
  entry: 'Entrada', lunch_out: 'Saída almoço', lunch_in: 'Volta almoço', exit: 'Saída',
};
const STATUS_VARIANT: Record<Person['status'], 'success' | 'warning' | 'destructive' | 'secondary'> = {
  on_duty: 'success', break: 'warning', absent: 'destructive', done: 'secondary',
};
const SEVERITY: Record<string, { label: string; variant: 'secondary' | 'warning' | 'destructive' }> = {
  low: { label: 'Baixa', variant: 'secondary' },
  medium: { label: 'Média', variant: 'warning' },
  high: { label: 'Alta', variant: 'destructive' },
};

const time = (iso: string) => format(new Date(iso), 'HH:mm');
const day = (d: string) => format(new Date(`${d}T12:00:00`), 'dd/MM (EEEE)', { locale: ptBR });

export default function PublicPortal() {
  const { token } = useParams<{ token: string }>();
  const storageKey = `portal-pin-${token}`;
  const [pin, setPin] = useState<string>(() => { try { return sessionStorage.getItem(storageKey) || ''; } catch { return ''; } });
  const [pinInput, setPinInput] = useState('');
  const [needsPin, setNeedsPin] = useState(false);
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (usePin: string) => {
    if (!token) { setError('Link inválido.'); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const { data: res, error: fnError } = await supabase.functions.invoke('condo-portal', {
        body: { token, pin: usePin },
      });
      let payload: any = res;
      if (fnError) {
        try { payload = await (fnError as any).context?.json?.(); } catch { payload = null; }
        if (!payload) throw new Error('Não foi possível carregar o portal.');
      }
      if (payload?.needs_pin) {
        setNeedsPin(true);
        setData(null);
        if (payload.error) setError(payload.error);
        try { sessionStorage.removeItem(storageKey); } catch { /* ignore */ }
        return;
      }
      if (payload?.error) throw new Error(payload.error);
      setNeedsPin(false);
      setData(payload as PortalData);
      try { if (usePin) sessionStorage.setItem(storageKey, usePin); } catch { /* ignore */ }
    } catch (e: any) {
      setError(e?.message || 'Não foi possível carregar o portal.');
    } finally {
      setLoading(false);
    }
  }, [token, storageKey]);

  useEffect(() => { load(pin); /* eslint-disable-next-line */ }, [token]);

  // Atualiza sozinho a cada minuto enquanto a aba estiver aberta
  useEffect(() => {
    if (!data) return;
    const id = setInterval(() => load(pin), 60000);
    return () => clearInterval(id);
  }, [data, pin, load]);

  const submitPin = () => {
    if (!/^\d{4,6}$/.test(pinInput)) { setError('Digite o PIN de 4 a 6 números.'); return; }
    setPin(pinInput);
    load(pinInput);
  };

  const s = data?.sections;

  return (
    <div className="min-h-screen bg-background py-6 px-4">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <img src={logoPontzap} alt="PONTZAP" className="h-8" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Portal do Síndico</p>
            {data && <p className="font-semibold truncate">{data.location_name}</p>}
          </div>
        </div>

        {loading && !data ? (
          <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}</div>
        ) : needsPin ? (
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-primary" />
                <p className="font-semibold">Digite o PIN de acesso</p>
              </div>
              <p className="text-sm text-muted-foreground">A empresa responsável passou um PIN para você.</p>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => { if (e.key === 'Enter') submitPin(); }}
                placeholder="••••"
                className="font-mono tracking-widest text-center text-lg"
                autoFocus
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button className="w-full" onClick={submitPin} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Entrar
              </Button>
            </CardContent>
          </Card>
        ) : error ? (
          <Card>
            <CardContent className="py-10 text-center">
              <Building2 className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="font-medium">{error}</p>
            </CardContent>
          </Card>
        ) : data && (
          <>
            {data.welcome_text && (
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="p-4 text-sm whitespace-pre-wrap">{data.welcome_text}</CardContent>
              </Card>
            )}

            {/* Hoje */}
            {s?.on_duty && data.today && (
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Hoje no posto</p>
                    <Button variant="ghost" size="sm" onClick={() => load(pin)} disabled={loading} aria-label="Atualizar">
                      <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                  {data.today.people.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum registro hoje até agora.</p>
                  ) : data.today.people.map((p, i) => (
                    <div key={i} className="rounded-lg border border-border/60 p-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">{p.name}</p>
                        <Badge variant={STATUS_VARIANT[p.status]}>{p.status_label}</Badge>
                      </div>
                      {p.since && s.times && (
                        <p className="text-xs text-muted-foreground">Desde {time(p.since)}</p>
                      )}
                      {p.punches && p.punches.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {p.punches.map((r, j) => (
                            <span key={j} className="inline-flex px-2 py-0.5 rounded text-xs bg-muted font-mono tabular-nums">
                              {PUNCH_LABEL[r.type] || r.type} {time(r.at)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  <p className="text-[11px] text-muted-foreground">
                    Atualizado às {time(data.generated_at)} · atualiza sozinho a cada minuto
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Passagens de turno */}
            {s?.handovers && data.handovers && (
              <Card>
                <CardContent className="p-4 space-y-3">
                  <p className="font-semibold flex items-center gap-2"><MessageSquareText className="h-4 w-4 text-primary" /> Passagens de turno</p>
                  {data.handovers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum recado registrado.</p>
                  ) : data.handovers.map((h, i) => (
                    <div key={i} className="rounded-lg border border-border/60 p-3 space-y-1.5">
                      <p className="text-xs text-muted-foreground">{h.name} · {format(new Date(h.created_at), 'dd/MM HH:mm')}</p>
                      {h.note && <p className="text-sm whitespace-pre-wrap">{h.note}</p>}
                      {h.audio_url && <audio controls src={h.audio_url} className="w-full h-10" preload="none" />}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Ocorrências */}
            {s?.occurrences && data.occurrences && (
              <Card>
                <CardContent className="p-4 space-y-3">
                  <p className="font-semibold flex items-center gap-2"><ClipboardList className="h-4 w-4 text-primary" /> Ocorrências</p>
                  {data.occurrences.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma ocorrência registrada.</p>
                  ) : data.occurrences.map((o, i) => {
                    const sev = SEVERITY[o.severity] || SEVERITY.low;
                    return (
                      <div key={i} className="rounded-lg border border-border/60 p-3 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-sm">{o.type_name}</p>
                          <Badge variant={sev.variant}>{sev.label}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{format(new Date(o.occurred_at), 'dd/MM/yyyy HH:mm')}</p>
                        <p className="text-sm whitespace-pre-wrap">{o.description}</p>
                        {o.public_token && (
                          <a href={`/ocorrencia/${o.public_token}`} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
                            Ver com fotos
                          </a>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {/* Histórico */}
            {(s?.history_days ?? 0) > 0 && data.history && (
              <Card>
                <CardContent className="p-4 space-y-3">
                  <p className="font-semibold flex items-center gap-2"><History className="h-4 w-4 text-primary" /> Últimos {s!.history_days} dias</p>
                  {data.history.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sem registros no período.</p>
                  ) : data.history.map((d) => (
                    <div key={d.date} className="rounded-lg border border-border/60 p-3">
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">{day(d.date)}</p>
                      {d.people.map((p, i) => (
                        <div key={i} className="flex items-center justify-between text-sm py-0.5">
                          <span>{p.name}</span>
                          {s!.times ? (
                            <span className="font-mono tabular-nums text-xs text-muted-foreground">
                              {p.entry ? time(p.entry) : '—'} → {p.exit ? time(p.exit) : '—'}
                            </span>
                          ) : (
                            <ShieldCheck className="h-4 w-4 text-success" />
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {!s?.on_duty && !s?.handovers && !s?.occurrences && !(s?.history_days) && (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  A empresa ainda não liberou informações neste portal.
                </CardContent>
              </Card>
            )}

            <div className="text-center text-xs text-muted-foreground pt-2 space-y-1">
              {data.company_name && <p>Serviço prestado por <strong>{data.company_name}</strong></p>}
              {data.company_phone && (
                <p className="flex items-center justify-center gap-1"><Phone className="h-3 w-3" /> {data.company_phone}</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
