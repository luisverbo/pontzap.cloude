import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/layout/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  ClipboardList, Plus, Camera, X, Loader2, MapPin, Send, ImageIcon,
} from 'lucide-react';
import { pickPhoto } from '@/lib/photoPicker';
import {
  useOccurrences, useOccurrenceTypes, uploadOccurrencePhotos, photoUrl,
  SEVERITY_LABELS, STATUS_LABELS, type OccurrenceSeverity,
} from '@/hooks/useOccurrences';

const MAX_PHOTOS = 3;

export default function MyOccurrences() {
  const { user } = useAuth();
  const { occurrences, loading, refetch } = useOccurrences();
  const { activeTypes, loading: loadingTypes } = useOccurrenceTypes();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [myLocations, setMyLocations] = useState<{ id: string; name: string }[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);

  const [form, setForm] = useState({
    type_id: '',
    location_id: '',
    description: '',
    severity: 'low' as OccurrenceSeverity,
    send_to_condo: false,
  });

  // The guard's own employee row + the locations they work at
  useEffect(() => {
    (async () => {
      if (!user) return;
      const { data: emp } = await supabase
        .from('employees')
        .select('id, employee_locations(location_id, locations(id, name))')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!emp) return;
      setEmployeeId(emp.id);
      const locs = (emp as any).employee_locations
        ?.map((el: any) => el.locations)
        .filter(Boolean) ?? [];
      setMyLocations(locs);
      // Fall back to every company location when the guard has none assigned
      if (locs.length === 0) {
        const { data: all } = await supabase.from('locations').select('id, name').order('name');
        setMyLocations(all || []);
      }
    })();
  }, [user]);

  const addPhoto = async () => {
    if (photos.length >= MAX_PHOTOS) {
      toast.error(`Máximo de ${MAX_PHOTOS} fotos.`);
      return;
    }
    const dataUrl = await pickPhoto('camera');
    if (dataUrl) setPhotos((p) => [...p, dataUrl]);
  };

  const resetForm = () => {
    setForm({ type_id: '', location_id: '', description: '', severity: 'low', send_to_condo: false });
    setPhotos([]);
  };

  const handleSave = async () => {
    if (!form.type_id) { toast.error('Escolha o tipo da ocorrência.'); return; }
    if (!form.description.trim()) { toast.error('Descreva a ocorrência.'); return; }
    if (!employeeId) { toast.error('Funcionário não identificado.'); return; }

    setSaving(true);
    try {
      const paths = photos.length ? await uploadOccurrencePhotos(photos) : [];
      const typeName = activeTypes.find((t) => t.id === form.type_id)?.name || 'Outros';

      const { error } = await supabase.from('occurrences').insert({
        employee_id: employeeId,
        location_id: form.location_id || null,
        type_id: form.type_id,
        type_name: typeName,
        description: form.description.trim(),
        severity: form.severity,
        photo_paths: paths,
        send_to_condo: form.send_to_condo,
        // Asking to notify the condo puts it in the admin's approval queue
        status: form.send_to_condo ? 'pending_approval' : 'internal',
      } as any);
      if (error) throw error;

      toast.success(
        form.send_to_condo
          ? 'Ocorrência registrada! Aguardando aprovação para envio ao condomínio.'
          : 'Ocorrência registrada!'
      );
      setDialogOpen(false);
      resetForm();
      refetch();
    } catch (e: any) {
      console.error('Erro ao salvar ocorrência:', e);
      toast.error(e?.message ? `Erro ao salvar: ${e.message}` : 'Erro ao salvar ocorrência');
    } finally {
      setSaving(false);
    }
  };

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto space-y-5 animate-fade-in pb-6">
        <PageHeader
          icon={<ClipboardList className="h-6 w-6" />}
          title="Livro de Ocorrências"
          description="Registre o que aconteceu no local de trabalho"
          actions={
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Nova
            </Button>
          }
        />

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}
          </div>
        ) : occurrences.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-muted flex items-center justify-center">
                <ClipboardList className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="font-medium">Nenhuma ocorrência registrada</p>
              <p className="text-sm text-muted-foreground mt-1 mb-4">
                Registre problemas, incidentes ou observações do seu local.
              </p>
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Registrar ocorrência
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {occurrences.map((occ) => {
              const st = STATUS_LABELS[occ.status];
              return (
                <Card key={occ.id}>
                  <CardContent className="p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{occ.type_name}</p>
                        <p className="text-xs text-muted-foreground font-mono tabular-nums">
                          {format(new Date(occ.occurred_at), 'dd/MM/yyyy HH:mm')}
                        </p>
                      </div>
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </div>

                    {occ.locations?.name && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" />
                        {occ.locations.name}
                      </p>
                    )}

                    <p className="text-sm text-foreground/90 whitespace-pre-wrap">{occ.description}</p>

                    {occ.photo_paths?.length > 0 && (
                      <div className="flex gap-2 pt-1">
                        {occ.photo_paths.map((p) => (
                          <button
                            key={p}
                            onClick={() => setViewingPhoto(photoUrl(p))}
                            className="h-16 w-16 rounded-lg overflow-hidden border border-border/60 focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <img src={photoUrl(p)} alt="Foto da ocorrência" className="h-full w-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}

                    {occ.status === 'rejected' && occ.review_note && (
                      <p className="text-xs text-destructive border-t border-border/60 pt-2">
                        Motivo: {occ.review_note}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Nova ocorrência */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Ocorrência</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo *</Label>
              <Select value={form.type_id} onValueChange={(v) => setForm({ ...form, type_id: v })}>
                <SelectTrigger><SelectValue placeholder={loadingTypes ? 'Carregando...' : 'Selecione o tipo'} /></SelectTrigger>
                <SelectContent>
                  {activeTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Local</Label>
              <Select value={form.location_id} onValueChange={(v) => setForm({ ...form, location_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione o local" /></SelectTrigger>
                <SelectContent>
                  {myLocations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Gravidade</Label>
              <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v as OccurrenceSeverity })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(SEVERITY_LABELS) as OccurrenceSeverity[]).map((s) => (
                    <SelectItem key={s} value={s}>{SEVERITY_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>O que aconteceu? *</Label>
              <Textarea
                rows={4}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Descreva a ocorrência com o máximo de detalhes"
              />
            </div>

            <div className="space-y-2">
              <Label>Fotos ({photos.length}/{MAX_PHOTOS})</Label>
              <div className="flex gap-2 flex-wrap">
                {photos.map((p, i) => (
                  <div key={i} className="relative h-20 w-20 rounded-lg overflow-hidden border border-border/60">
                    <img src={p} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
                    <button
                      onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                      className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                      aria-label="Remover foto"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {photos.length < MAX_PHOTOS && (
                  <button
                    onClick={addPhoto}
                    className="h-20 w-20 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                  >
                    <Camera className="h-5 w-5" />
                    <span className="text-[10px]">Adicionar</span>
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-start justify-between gap-3 rounded-lg border border-border/60 p-3">
              <div className="min-w-0">
                <p className="font-medium text-sm flex items-center gap-1.5">
                  <Send className="h-3.5 w-3.5" />
                  Enviar para a administração do condomínio
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Passa pela aprovação da empresa antes de ser enviada.
                </p>
              </div>
              <Switch
                checked={form.send_to_condo}
                onCheckedChange={(v) => setForm({ ...form, send_to_condo: v })}
              />
            </div>

            <Button className="w-full" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ClipboardList className="h-4 w-4 mr-2" />}
              Registrar ocorrência
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Visualizar foto */}
      <Dialog open={!!viewingPhoto} onOpenChange={(o) => { if (!o) setViewingPhoto(null); }}>
        <DialogContent className="max-w-lg p-2">
          <DialogHeader className="sr-only">
            <DialogTitle>Foto da ocorrência</DialogTitle>
          </DialogHeader>
          {viewingPhoto && <img src={viewingPhoto} alt="Foto da ocorrência" className="w-full rounded-lg" />}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
