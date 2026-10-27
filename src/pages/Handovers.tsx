import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLocations } from '@/hooks/useLocations';
import { useHandovers } from '@/hooks/useHandovers';
import { HandoverCard } from '@/components/handover/HandoverCard';
import { MasterCompanyNotice } from '@/components/MasterCompanyNotice';
import { MessageSquareText } from 'lucide-react';

export default function Handovers() {
  const { locations } = useLocations();
  const [locationId, setLocationId] = useState<string>('all');
  const { handovers, loading } = useHandovers({
    locationId: locationId === 'all' ? null : locationId,
    limit: 200,
  });

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto space-y-5 animate-fade-in pb-6">
        <PageHeader
          icon={<MessageSquareText className="h-6 w-6" />}
          title="Passagens de Turno"
          description="Recados deixados entre turnos em cada local"
        />
        <MasterCompanyNotice />

        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground shrink-0">Local:</Label>
          <Select value={locationId} onValueChange={setLocationId}>
            <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os locais</SelectItem>
              {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}</div>
        ) : handovers.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-muted flex items-center justify-center">
                <MessageSquareText className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="font-medium">Nenhuma passagem registrada</p>
              <p className="text-sm text-muted-foreground mt-1">
                Os guardiões deixam recados ao bater a saída; eles aparecem aqui.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {handovers.map((h) => <HandoverCard key={h.id} handover={h} />)}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
