import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format, isToday, isTomorrow, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarOff, CalendarCheck, Repeat } from 'lucide-react';
import { DAY_OFF_KINDS, fetchWeeklyDaysOff, type DayOff } from '@/hooks/useDayOffs';
import { DAYS_OF_WEEK } from '@/types';

export default function MyDayOffs() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [weeklyOff, setWeeklyOff] = useState<number[]>([]);
  const [upcoming, setUpcoming] = useState<DayOff[]>([]);
  const [past, setPast] = useState<DayOff[]>([]);

  useEffect(() => {
    (async () => {
      if (!user) return;
      setLoading(true);
      try {
        const { data: emp } = await supabase
          .from('employees').select('id').eq('user_id', user.id).maybeSingle();
        if (!emp) { setLoading(false); return; }

        setWeeklyOff(await fetchWeeklyDaysOff(emp.id));

        const { data: offs } = await supabase
          .from('day_offs')
          .select('*')
          .eq('employee_id', emp.id)
          .order('date', { ascending: true });

        const today = startOfDay(new Date());
        const all = (offs || []) as unknown as DayOff[];
        setUpcoming(all.filter((o) => new Date(`${o.date}T12:00:00`) >= today));
        setPast(all.filter((o) => new Date(`${o.date}T12:00:00`) < today).reverse().slice(0, 10));
      } catch (e) {
        console.error('Erro ao carregar folgas:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const relativeLabel = (dateStr: string): string | null => {
    const d = new Date(`${dateStr}T12:00:00`);
    if (isToday(d)) return 'Hoje';
    if (isTomorrow(d)) return 'Amanhã';
    return null;
  };

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto space-y-5 animate-fade-in pb-6">
        <PageHeader
          icon={<CalendarOff className="h-6 w-6" />}
          title="Minhas Folgas"
          description="Seus dias de descanso"
        />

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
          </div>
        ) : (
          <>
            {/* Folga fixa da semana */}
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Repeat className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium">Folga semanal</p>
                  <p className="text-sm text-muted-foreground">
                    {weeklyOff.length > 0
                      ? `Toda ${weeklyOff.map((d) => DAYS_OF_WEEK[d].label.toLowerCase()).join(' e ')}`
                      : 'Nenhuma folga fixa na sua escala'}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Próximas folgas */}
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
                Próximas folgas
              </h2>
              {upcoming.length === 0 ? (
                <Card>
                  <CardContent className="py-10 text-center">
                    <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-muted flex items-center justify-center">
                      <CalendarCheck className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Nenhuma folga escalada além da sua folga semanal.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {upcoming.map((off) => {
                    const k = DAY_OFF_KINDS[off.kind];
                    const rel = relativeLabel(off.date);
                    const d = new Date(`${off.date}T12:00:00`);
                    return (
                      <Card key={off.id} className={rel ? 'border-primary/40' : undefined}>
                        <CardContent className="p-4 flex items-center gap-4">
                          <div className="text-center shrink-0 w-12">
                            <p className="text-2xl font-bold font-mono tabular-nums leading-none">
                              {format(d, 'dd')}
                            </p>
                            <p className="text-[11px] uppercase text-muted-foreground mt-0.5">
                              {format(d, 'MMM', { locale: ptBR })}
                            </p>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium capitalize">
                                {format(d, 'EEEE', { locale: ptBR })}
                              </p>
                              {rel && <Badge variant="info">{rel}</Badge>}
                            </div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <Badge variant={k.variant}>{k.short}</Badge>
                              {off.notes && (
                                <span className="text-xs text-muted-foreground">{off.notes}</span>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Histórico */}
            {past.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
                  Folgas anteriores
                </h2>
                <Card>
                  <CardContent className="p-4 divide-y divide-border/60">
                    {past.map((off) => (
                      <div key={off.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="font-mono tabular-nums text-sm text-muted-foreground">
                            {format(new Date(`${off.date}T12:00:00`), 'dd/MM/yyyy')}
                          </span>
                          <span className="text-xs text-muted-foreground capitalize">
                            {format(new Date(`${off.date}T12:00:00`), 'EEEE', { locale: ptBR })}
                          </span>
                        </div>
                        <Badge variant="secondary">{DAY_OFF_KINDS[off.kind].short}</Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            )}
          </>
        )}
      </div>
    </MainLayout>
  );
}
