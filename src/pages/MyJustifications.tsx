import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/layout/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { FileHeart, Plus, Camera, X, Loader2 } from 'lucide-react';
import { pickPhoto, dataUrlToBlob } from '@/lib/photoPicker';

interface Justification {
  id: string;
  date: string;
  reason: string;
  photo_paths: string[];
  status: 'pending' | 'approved' | 'rejected';
  review_note: string | null;
  created_at: string;
}

export const JUSTIFICATION_STATUS: Record<string, { label: string; variant: 'warning' | 'success' | 'destructive' }> = {
  pending: { label: 'Aguardando análise', variant: 'warning' },
  approved: { label: 'Aprovada', variant: 'success' },
  rejected: { label: 'Recusada', variant: 'destructive' },
};

export function justificationPhotoUrl(path: string): string {
  return supabase.storage.from('justification-photos').getPublicUrl(path).data.publicUrl;
}

export default function MyJustifications() {
  const { user } = useAuth();
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [items, setItems] = useState<Justification[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);
  const [form, setForm] = useState({ date: format(new Date(), 'yyyy-MM-dd'), reason: '' });

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: emp } = await supabase.from('employees').select('id').eq('user_id', user.id).maybeSingle();
      if (!emp) { setLoading(false); return; }
      setEmployeeId(emp.id);
      const { data } = await supabase
        .from('absence_justifications')
        .select('id, date, reason, photo_paths, status, review_note, created_at')
        .eq('employee_id', emp.id)
        .order('date', { ascending: false });
      setItems((data || []) as Justification[]);
    } catch (e) {
      console.error('Erro ao carregar justificativas:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user]);

  const addPhoto = async (source: 'camera' | 'gallery') => {
    if (photos.length >= 2) { toast.error('Máximo de 2 fotos.'); return; }
    const dataUrl = await pickPhoto(source);
    if (dataUrl) setPhotos((p) => [...p, dataUrl]);
  };

  const handleSave = async () => {
    if (!form.date) { toast.error('Escolha o dia da falta.'); return; }
    if (!form.reason.trim()) { toast.error('Descreva o motivo.'); return; }
    if (!employeeId) { toast.error('Funcionário não identificado.'); return; }

    setSaving(true);
    try {
      const paths: string[] = [];
      for (const dataUrl of photos) {
        const path = `${crypto.randomUUID()}.jpg`;
        const { error } = await supabase.storage
          .from('justification-photos')
          .upload(path, dataUrlToBlob(dataUrl), { contentType: 'image/jpeg' });
        if (error) throw error;
        paths.push(path);
      }

      const { error } = await supabase.from('absence_justifications').insert({
        employee_id: employeeId,
        date: form.date,
        reason: form.reason.trim(),
        photo_paths: paths,
      } as any);
      if (error) throw error;

      toast.success('Justificativa enviada! Aguarde a análise da empresa.');
      setDialogOpen(false);
      setForm({ date: format(new Date(), 'yyyy-MM-dd'), reason: '' });
      setPhotos([]);
      load();
    } catch (e: any) {
      const msg = String(e?.message || '');
      toast.error(
        msg.includes('duplicate') || msg.includes('unique')
          ? 'Você já enviou justificativa para este dia.'
          : `Erro ao enviar: ${e?.message || 'desconhecido'}`
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto space-y-5 animate-fade-in pb-6">
        <PageHeader
          icon={<FileHeart className="h-6 w-6" />}
          title="Justificar Falta"
          description="Envie o atestado ou o motivo de uma falta"
          actions={
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Nova
            </Button>
          }
        />

        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
          </div>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-muted flex items-center justify-center">
                <FileHeart className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="font-medium">Nenhuma justificativa enviada</p>
              <p className="text-sm text-muted-foreground mt-1 mb-4">
                Faltou por doença ou imprevisto? Justifique aqui com foto do atestado.
              </p>
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Justificar falta
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {items.map((j) => {
              const st = JUSTIFICATION_STATUS[j.status];
              return (
                <Card key={j.id}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold font-mono tabular-nums">
                        {format(new Date(`${j.date}T12:00:00`), 'dd/MM/yyyy')}
                      </p>
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </div>
                    <p className="text-sm text-foreground/90 whitespace-pre-wrap">{j.reason}</p>
                    {j.photo_paths?.length > 0 && (
                      <div className="flex gap-2 pt-1">
                        {j.photo_paths.map((p) => (
                          <button
                            key={p}
                            onClick={() => setViewingPhoto(justificationPhotoUrl(p))}
                            className="h-16 w-16 rounded-lg overflow-hidden border border-border/60 focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <img src={justificationPhotoUrl(p)} alt="Atestado" className="h-full w-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                    {j.status === 'rejected' && j.review_note && (
                      <p className="text-xs text-destructive border-t border-border/60 pt-2">Motivo: {j.review_note}</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Justificar falta</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Dia da falta *</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Motivo *</Label>
              <Textarea
                rows={3}
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="Ex: consulta médica — atestado em anexo"
              />
            </div>
            <div className="space-y-2">
              <Label>Foto do atestado ({photos.length}/2)</Label>
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
                {photos.length < 2 && (
                  <button
                    onClick={() => addPhoto('camera')}
                    className="h-20 w-20 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                  >
                    <Camera className="h-5 w-5" />
                    <span className="text-[10px]">Tirar foto</span>
                  </button>
                )}
              </div>
            </div>
            <Button className="w-full" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileHeart className="h-4 w-4 mr-2" />}
              Enviar justificativa
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewingPhoto} onOpenChange={(o) => { if (!o) setViewingPhoto(null); }}>
        <DialogContent className="max-w-lg p-2">
          <DialogHeader className="sr-only"><DialogTitle>Atestado</DialogTitle></DialogHeader>
          {viewingPhoto && <img src={viewingPhoto} alt="Atestado" className="w-full rounded-lg" />}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
