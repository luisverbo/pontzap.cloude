import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { ClipboardList, MapPin, AlertTriangle, Calendar } from 'lucide-react';

interface PublicOccurrenceData {
  type_name: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  occurred_at: string;
  created_at: string;
  location_name: string | null;
  company_name: string | null;
  company_phone: string | null;
  photos: string[];
}

const SEVERITY: Record<string, { label: string; variant: 'secondary' | 'warning' | 'destructive' }> = {
  low: { label: 'Gravidade baixa', variant: 'secondary' },
  medium: { label: 'Gravidade média', variant: 'warning' },
  high: { label: 'Gravidade alta', variant: 'destructive' },
};

export default function PublicOccurrence() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PublicOccurrenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!token) { setError('Link inválido.'); setLoading(false); return; }
      try {
        const { data: res, error: fnError } = await supabase.functions.invoke('occurrence-public', {
          body: { token },
        });
        if (fnError) {
          let info: any = {};
          try { info = await (fnError as any).context?.json?.(); } catch { /* ignore */ }
          throw new Error(info?.error || 'Não foi possível carregar a ocorrência.');
        }
        if ((res as any)?.error) throw new Error((res as any).error);
        setData(res as PublicOccurrenceData);
      } catch (e: any) {
        setError(e?.message || 'Não foi possível carregar a ocorrência.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-lg mx-auto space-y-5">
        {loading ? (
          <>
            <Skeleton className="h-10 w-56" />
            <Skeleton className="h-72 w-full rounded-lg" />
          </>
        ) : error ? (
          <Card>
            <CardContent className="py-14 text-center">
              <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <p className="font-semibold">{error}</p>
              <p className="text-sm text-muted-foreground mt-1">
                O link pode ter expirado ou sido revogado.
              </p>
            </CardContent>
          </Card>
        ) : data ? (
          <>
            <div className="flex items-center gap-2.5">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <ClipboardList className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold leading-tight">Registro de Ocorrência</h1>
                {data.company_name && (
                  <p className="text-xs text-muted-foreground">{data.company_name}</p>
                )}
              </div>
            </div>

            <Card>
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-semibold">{data.type_name}</h2>
                  <Badge variant={SEVERITY[data.severity]?.variant || 'secondary'}>
                    {SEVERITY[data.severity]?.label || data.severity}
                  </Badge>
                </div>

                <div className="space-y-1.5 text-sm">
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-4 w-4 shrink-0" />
                    <span className="font-mono tabular-nums">
                      {format(new Date(data.occurred_at), "dd/MM/yyyy 'às' HH:mm")}
                    </span>
                  </p>
                  {data.location_name && (
                    <p className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="h-4 w-4 shrink-0" />
                      {data.location_name}
                    </p>
                  )}
                </div>

                <div className="border-t border-border/60 pt-4">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">
                    Descrição
                  </p>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{data.description}</p>
                </div>

                {data.photos.length > 0 && (
                  <div className="border-t border-border/60 pt-4">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                      Fotos
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {data.photos.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noreferrer" className="block">
                          <img
                            src={url}
                            alt={`Foto ${i + 1} da ocorrência`}
                            className="w-full rounded-lg border border-border/60 object-cover aspect-[4/3]"
                          />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <p className="text-xs text-muted-foreground text-center">
              Registro enviado por {data.company_name || 'a empresa prestadora'}
              {data.company_phone ? ` · ${data.company_phone}` : ''}
            </p>
            <p className="text-[11px] text-muted-foreground/70 text-center">
              Gerado pelo PONTZAP
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
