import { useState, useEffect, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/layout/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { FileHeart, Check, X, Loader2, User } from 'lucide-react';
import { JUSTIFICATION_STATUS, justificationPhotoUrl } from './MyJustifications';

interface Row {
  id: string;
  employee_id: string;
  date: string;
  reason: string;
  photo_paths: string[];
  status: 'pending' | 'approved' | 'rejected';
  review_note: string | null;
  created_at: string;
  employee_name?: string;
}

export default function Justifications() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'all' | 'approved' | 'rejected'>('pending');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Row | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('absence_justifications')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const list = (data || []) as Row[];

      const empIds = [...new Set(list.map((r) => r.employee_id))];
      if (empIds.length) {
        const { data: emps } = await supabase.from('employees').select('id, user_id').in('id', empIds);
        const userIds = [...new Set((emps || []).map((e: any) => e.user_id).filter(Boolean))];
        const { data: profs } = userIds.length
          ? await supabase.from('profiles').select('id, name').in('id', userIds)
          : { data: [] as any[] };
        const nameByUser = Object.fromEntries((profs || []).map((p: any) => [p.id, p.name]));
        const nameByEmp = Object.fromEntries((emps || []).map((e: any) => [e.id, nameByUser[e.user_id] || 'Funcionário']));
        list.forEach((r) => { r.employee_name = nameByEmp[r.employee_id]; });
      }
      setRows(list);
    } catch (e) {
      console.error('Erro ao carregar justificativas:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(
    () => (filter === 'all' ? rows : rows.filter((r) => r.status === filter)),
    [rows, filter]
  );
  const pendingCount = rows.filter((r) => r.status === 'pending').length;

  const review = async (row: Row, status: 'approved' | 'rejected', note?: string) => {
    setBusyId(row.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('absence_justifications')
        .update({
          status,
          review_note: note?.trim() || null,
          reviewed_by: user?.id ?? null,
          reviewed_at: new Date().toISOString(),
        } as any)
        .eq('id', row.id);
      if (error) throw error;
      toast.success(status === 'approved' ? 'Falta justificada!' : 'Justificativa recusada.');
      setRejecting(null);
      setRejectNote('');
      load();
    } catch (e: any) {
      toast.error(`Erro: ${e?.message || 'desconhecido'}`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto space-y-5 animate-fade-in pb-6">
        <PageHeader
          icon={<FileHeart className="h-6 w-6" />}
          title="Justificativas de Falta"
          description="Atestados e motivos enviados pelos funcionários"
        />

        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground shrink-0">Filtrar:</Label>
          <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
            <SelectTrigger className="w-60"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">
                Aguardando análise{pendingCount > 0 ? ` (${pendingCount})` : ''}
              </SelectItem>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="approved">Aprovadas</SelectItem>
              <SelectItem value="rejected">Recusadas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-muted flex items-center justify-center">
                <FileHeart className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="font-medium">Nada por aqui</p>
              <p className="text-sm text-muted-foreground mt-1">
                {filter === 'pending' ? 'Nenhuma justificativa aguardando análise.' : 'Nenhum registro para este filtro.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((r) => {
              const st = JUSTIFICATION_STATUS[r.status];
              const isBusy = busyId === r.id;
              return (
                <Card key={r.id}>
                  <CardContent className="p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold">
                          Falta de <span className="font-mono tabular-nums">{format(new Date(`${r.date}T12:00:00`), 'dd/MM/yyyy')}</span>
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                          <User className="h-3.5 w-3.5" />
                          {r.employee_name || 'Funcionário'}
                        </p>
                      </div>
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </div>

                    <p className="text-sm text-foreground/90 whitespace-pre-wrap">{r.reason}</p>

                    {r.photo_paths?.length > 0 && (
                      <div className="flex gap-2">
                        {r.photo_paths.map((p) => (
                          <button
                            key={p}
                            onClick={() => setViewingPhoto(justificationPhotoUrl(p))}
                            className="h-20 w-20 rounded-lg overflow-hidden border border-border/60 focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <img src={justificationPhotoUrl(p)} alt="Atestado" className="h-full w-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}

                    {r.status === 'pending' && (
                      <div className="flex gap-2 border-t border-border/60 pt-3">
                        <Button size="sm" className="flex-1" onClick={() => review(r, 'approved')} disabled={isBusy}>
                          {isBusy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Check className="h-4 w-4 mr-1.5" />}
                          Aprovar
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1" onClick={() => { setRejecting(r); setRejectNote(''); }} disabled={isBusy}>
                          <X className="h-4 w-4 mr-1.5" />
                          Recusar
                        </Button>
                      </div>
                    )}
                    {r.status === 'rejected' && r.review_note && (
                      <p className="text-xs text-muted-foreground border-t border-border/60 pt-2">Motivo da recusa: {r.review_note}</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!rejecting} onOpenChange={(o) => { if (!o) setRejecting(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Recusar justificativa</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Motivo (o funcionário verá)</Label>
              <Textarea rows={3} value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder="Ex: atestado ilegível, reenviar foto" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setRejecting(null)}>Cancelar</Button>
              <Button variant="destructive" className="flex-1" onClick={() => rejecting && review(rejecting, 'rejected', rejectNote)} disabled={!!busyId}>
                {busyId ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
                Recusar
              </Button>
            </div>
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
