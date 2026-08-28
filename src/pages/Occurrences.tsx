import { useState, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/layout/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  ClipboardList, Check, X, Loader2, MapPin, Link2, MessageCircle,
  Trash2, Plus, Settings2, ExternalLink, User,
} from 'lucide-react';
import {
  useOccurrences, useOccurrenceTypes, photoUrl, generatePublicToken, publicOccurrenceUrl,
  SEVERITY_LABELS, STATUS_LABELS, type Occurrence, type OccurrenceStatus,
} from '@/hooks/useOccurrences';

const SEVERITY_VARIANT: Record<string, 'secondary' | 'warning' | 'destructive'> = {
  low: 'secondary',
  medium: 'warning',
  high: 'destructive',
};

export default function Occurrences() {
  const { occurrences, loading, refetch } = useOccurrences();
  const { types, refetch: refetchTypes } = useOccurrenceTypes();

  const [filter, setFilter] = useState<'all' | OccurrenceStatus>('pending_approval');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Occurrence | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);
  const [newType, setNewType] = useState('');

  const pendingCount = occurrences.filter((o) => o.status === 'pending_approval').length;

  const filtered = useMemo(
    () => (filter === 'all' ? occurrences : occurrences.filter((o) => o.status === filter)),
    [occurrences, filter]
  );

  const handleApprove = async (occ: Occurrence) => {
    setBusyId(occ.id);
    try {
      // Reuse the token if it already has one, so a re-approval keeps the link valid
      const token = occ.public_token || generatePublicToken();
      const { error } = await supabase
        .from('occurrences')
        .update({
          status: 'approved',
          public_token: token,
          approved_at: new Date().toISOString(),
          review_note: null,
        } as any)
        .eq('id', occ.id);
      if (error) throw error;
      toast.success('Aprovada! O link já pode ser enviado ao condomínio.');
      refetch();
    } catch (e: any) {
      console.error('Erro ao aprovar:', e);
      toast.error(e?.message ? `Erro: ${e.message}` : 'Erro ao aprovar');
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async () => {
    if (!rejecting) return;
    setBusyId(rejecting.id);
    try {
      const { error } = await supabase
        .from('occurrences')
        .update({
          status: 'rejected',
          public_token: null, // revokes any previously shared link
          review_note: rejectNote.trim() || null,
        } as any)
        .eq('id', rejecting.id);
      if (error) throw error;
      toast.success('Ocorrência não será enviada ao condomínio.');
      setRejecting(null);
      setRejectNote('');
      refetch();
    } catch (e: any) {
      console.error('Erro ao recusar:', e);
      toast.error(e?.message ? `Erro: ${e.message}` : 'Erro ao recusar');
    } finally {
      setBusyId(null);
    }
  };

  const copyLink = async (occ: Occurrence) => {
    if (!occ.public_token) return;
    const url = publicOccurrenceUrl(occ.public_token);
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copiado!');
    } catch {
      window.prompt('Copie o link da ocorrência:', url);
    }
  };

  const shareWhatsApp = (occ: Occurrence) => {
    if (!occ.public_token) return;
    const url = publicOccurrenceUrl(occ.public_token);
    const text =
      `*Ocorrência — ${occ.type_name}*\n` +
      `${occ.locations?.name ? `Local: ${occ.locations.name}\n` : ''}` +
      `Data: ${format(new Date(occ.occurred_at), 'dd/MM/yyyy HH:mm')}\n\n` +
      `Ver detalhes e fotos:\n${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const addType = async () => {
    if (!newType.trim()) return;
    try {
      const { error } = await supabase
        .from('occurrence_types')
        .insert({ name: newType.trim(), sort_order: types.length + 1 } as any);
      if (error) throw error;
      setNewType('');
      refetchTypes();
      toast.success('Tipo adicionado.');
    } catch (e: any) {
      toast.error(e?.message ? `Erro: ${e.message}` : 'Erro ao adicionar tipo');
    }
  };

  const toggleType = async (id: string, is_active: boolean) => {
    try {
      const { error } = await supabase.from('occurrence_types').update({ is_active } as any).eq('id', id);
      if (error) throw error;
      refetchTypes();
    } catch (e: any) {
      toast.error('Erro ao atualizar tipo');
    }
  };

  const deleteType = async (id: string) => {
    if (!confirm('Excluir este tipo? As ocorrências antigas continuam com o nome registrado.')) return;
    try {
      const { error } = await supabase.from('occurrence_types').delete().eq('id', id);
      if (error) throw error;
      refetchTypes();
      toast.success('Tipo excluído.');
    } catch (e: any) {
      toast.error('Erro ao excluir tipo');
    }
  };

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto space-y-5 animate-fade-in pb-6">
        <PageHeader
          icon={<ClipboardList className="h-6 w-6" />}
          title="Livro de Ocorrências"
          description="Ocorrências registradas pelos funcionários"
        />

        <Tabs defaultValue="list">
          <TabsList>
            <TabsTrigger value="list">
              Ocorrências
              {pendingCount > 0 && (
                <Badge variant="warning" className="ml-2">{pendingCount}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="types">
              <Settings2 className="h-4 w-4 mr-1.5" />
              Tipos
            </TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-4 mt-4">
            <div className="flex items-center gap-2">
              <Label className="text-sm text-muted-foreground shrink-0">Filtrar:</Label>
              <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
                <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending_approval">Aguardando aprovação</SelectItem>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="internal">Internas</SelectItem>
                  <SelectItem value="approved">Enviadas ao condomínio</SelectItem>
                  <SelectItem value="rejected">Não enviadas</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full rounded-lg" />)}
              </div>
            ) : filtered.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-muted flex items-center justify-center">
                    <ClipboardList className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="font-medium">Nenhuma ocorrência aqui</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {filter === 'pending_approval'
                      ? 'Nada aguardando sua aprovação no momento.'
                      : 'Nenhum registro para este filtro.'}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {filtered.map((occ) => {
                  const st = STATUS_LABELS[occ.status];
                  const isBusy = busyId === occ.id;
                  return (
                    <Card key={occ.id}>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold">{occ.type_name}</p>
                              <Badge variant={SEVERITY_VARIANT[occ.severity]}>
                                {SEVERITY_LABELS[occ.severity]}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground font-mono tabular-nums mt-0.5">
                              {format(new Date(occ.occurred_at), 'dd/MM/yyyy HH:mm')}
                            </p>
                          </div>
                          <Badge variant={st.variant}>{st.label}</Badge>
                        </div>

                        <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5" />
                            {occ.employee_name || 'Funcionário não identificado'}
                          </span>
                          {occ.locations?.name && (
                            <span className="flex items-center gap-1.5">
                              <MapPin className="h-3.5 w-3.5" />
                              {occ.locations.name}
                            </span>
                          )}
                        </div>

                        <p className="text-sm text-foreground/90 whitespace-pre-wrap">{occ.description}</p>

                        {occ.photo_paths?.length > 0 && (
                          <div className="flex gap-2">
                            {occ.photo_paths.map((p) => (
                              <button
                                key={p}
                                onClick={() => setViewingPhoto(photoUrl(p))}
                                className="h-20 w-20 rounded-lg overflow-hidden border border-border/60 focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <img src={photoUrl(p)} alt="Foto da ocorrência" className="h-full w-full object-cover" />
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Ações */}
                        {occ.status === 'pending_approval' && (
                          <div className="flex gap-2 border-t border-border/60 pt-3">
                            <Button size="sm" className="flex-1" onClick={() => handleApprove(occ)} disabled={isBusy}>
                              {isBusy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Check className="h-4 w-4 mr-1.5" />}
                              Aprovar e gerar link
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1"
                              onClick={() => { setRejecting(occ); setRejectNote(''); }}
                              disabled={isBusy}
                            >
                              <X className="h-4 w-4 mr-1.5" />
                              Não enviar
                            </Button>
                          </div>
                        )}

                        {occ.status === 'approved' && occ.public_token && (
                          <div className="flex gap-2 border-t border-border/60 pt-3 flex-wrap">
                            <Button size="sm" onClick={() => shareWhatsApp(occ)}>
                              <MessageCircle className="h-4 w-4 mr-1.5" />
                              Enviar no WhatsApp
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => copyLink(occ)}>
                              <Link2 className="h-4 w-4 mr-1.5" />
                              Copiar link
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => window.open(publicOccurrenceUrl(occ.public_token!), '_blank')}
                            >
                              <ExternalLink className="h-4 w-4 mr-1.5" />
                              Ver
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              onClick={() => { setRejecting(occ); setRejectNote(''); }}
                            >
                              Revogar
                            </Button>
                          </div>
                        )}

                        {occ.status === 'rejected' && (
                          <div className="border-t border-border/60 pt-3 flex items-center justify-between gap-3">
                            <p className="text-xs text-muted-foreground">
                              {occ.review_note ? `Motivo: ${occ.review_note}` : 'Não enviada ao condomínio.'}
                            </p>
                            <Button size="sm" variant="outline" onClick={() => handleApprove(occ)} disabled={isBusy}>
                              <Check className="h-4 w-4 mr-1.5" />
                              Aprovar
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Tipos configuráveis */}
          <TabsContent value="types" className="space-y-4 mt-4">
            <Card>
              <CardContent className="p-4 space-y-4">
                <div className="flex gap-2">
                  <Input
                    value={newType}
                    onChange={(e) => setNewType(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') addType(); }}
                    placeholder="Novo tipo de ocorrência"
                  />
                  <Button onClick={addType} disabled={!newType.trim()}>
                    <Plus className="h-4 w-4 mr-1.5" />
                    Adicionar
                  </Button>
                </div>

                <div className="divide-y divide-border/60">
                  {types.map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                      <span className={t.is_active ? '' : 'text-muted-foreground line-through'}>{t.name}</span>
                      <div className="flex items-center gap-3">
                        <Switch checked={t.is_active} onCheckedChange={(v) => toggleType(t.id, v)} />
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => deleteType(t.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {types.length === 0 && (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      Nenhum tipo cadastrado. Adicione o primeiro acima.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Recusar / revogar */}
      <Dialog open={!!rejecting} onOpenChange={(o) => { if (!o) setRejecting(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {rejecting?.status === 'approved' ? 'Revogar envio' : 'Não enviar ao condomínio'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {rejecting?.status === 'approved'
                ? 'O link deixará de funcionar imediatamente.'
                : 'A ocorrência continua registrada internamente, mas não será enviada.'}
            </p>
            <div className="space-y-2">
              <Label>Motivo (opcional — o funcionário verá)</Label>
              <Textarea
                rows={3}
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="Ex.: já foi resolvido internamente"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setRejecting(null)}>
                Cancelar
              </Button>
              <Button variant="destructive" className="flex-1" onClick={handleReject} disabled={!!busyId}>
                {busyId ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
                Confirmar
              </Button>
            </div>
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
