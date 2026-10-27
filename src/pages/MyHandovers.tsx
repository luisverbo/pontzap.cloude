import { useState, useEffect, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLocations } from '@/hooks/useLocations';
import { useHandovers, acknowledgeHandover } from '@/hooks/useHandovers';
import { HandoverComposer } from '@/components/handover/HandoverComposer';
import { HandoverCard } from '@/components/handover/HandoverCard';
import { toast } from 'sonner';
import { MessageSquareText, Plus } from 'lucide-react';

export default function MyHandovers() {
  const { user } = useAuth();
  const { locations } = useLocations();
  const { handovers, loading, refetch } = useHandovers({ limit: 60 });
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [primaryLocationId, setPrimaryLocationId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);

  useEffect(() => {
    (async () => {
      if (!user) return;
      const { data: emp } = await supabase.from('employees').select('id').eq('user_id', user.id).maybeSingle();
      if (!emp) return;
      setEmployeeId(emp.id);
      const { data: links } = await supabase
        .from('employee_locations')
        .select('location_id, is_primary')
        .eq('employee_id', emp.id);
      const primary = (links || []).find((l) => l.is_primary) || (links || [])[0];
      setPrimaryLocationId(primary?.location_id ?? null);
    })();
  }, [user]);

  const pending = useMemo(
    () => handovers.filter((h) => !h.acknowledged_at && h.employee_id !== employeeId),
    [handovers, employeeId],
  );
  const others = useMemo(
    () => handovers.filter((h) => !pending.includes(h)),
    [handovers, pending],
  );

  const ack = async (h: { id: string }) => {
    if (!employeeId) return;
    try {
      await acknowledgeHandover(h.id, employeeId);
      toast.success('Marcado como ciente.');
      refetch();
    } catch (e: any) {
      toast.error(`Erro: ${e?.message || 'desconhecido'}`);
    }
  };

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto space-y-5 animate-fade-in pb-6">
        <PageHeader
          icon={<MessageSquareText className="h-6 w-6" />}
          title="Passagem de Turno"
          description="O que quem saiu deixou para quem entra"
          actions={
            <Button onClick={() => setComposerOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Deixar passagem
            </Button>
          }
        />

        {loading ? (
          <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}</div>
        ) : (
          <>
            {pending.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold text-foreground">Para você ler agora ({pending.length})</h2>
                {pending.map((h) => <HandoverCard key={h.id} handover={h} onAcknowledge={ack} highlight />)}
              </section>
            )}

            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">Histórico</h2>
              {others.length === 0 && pending.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-muted flex items-center justify-center">
                      <MessageSquareText className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="font-medium">Nenhuma passagem ainda</p>
                    <p className="text-sm text-muted-foreground mt-1 mb-4">
                      Ao bater a saída, deixe um recado para quem entra: encomendas, chaves, avisos.
                    </p>
                    <Button onClick={() => setComposerOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Deixar passagem
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                others.map((h) => <HandoverCard key={h.id} handover={h} />)
              )}
            </section>
          </>
        )}
      </div>

      <HandoverComposer
        open={composerOpen}
        onOpenChange={setComposerOpen}
        locations={locations.map((l) => ({ id: l.id, name: l.name }))}
        defaultLocationId={primaryLocationId}
        onSaved={refetch}
      />
    </MainLayout>
  );
}
