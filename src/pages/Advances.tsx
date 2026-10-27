import { useState, useEffect, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/layout/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  Wallet, Check, X, Loader2, User, Settings, KeyRound, Copy,
  History as HistoryIcon, ShieldCheck, AlertTriangle, Banknote,
} from 'lucide-react';
import {
  useAdvanceConfig,
  useAdvanceRequests,
  notifyAdvance,
  formatMoney,
  ADVANCE_KIND_LABELS,
  ADVANCE_STATUS,
  PIX_KEY_TYPE_LABELS,
  DEFAULT_ADVANCE_CONFIG,
  type AdvanceRequest,
  type AdvanceStatus,
} from '@/hooks/useAdvances';
import { MasterCompanyNotice } from '@/components/MasterCompanyNotice';

interface PixHistoryRow {
  id: string;
  pix_key: string | null;
  pix_key_type: string | null;
  pix_key_owner_name: string | null;
  previous_pix_key: string | null;
  changed_by_self: boolean;
  confirmation: boolean;
  created_at: string;
}

export default function Advances() {
  const { config, companyId, loading: configLoading, refetch: refetchConfig } = useAdvanceConfig();
  const { requests, loading, refetch } = useAdvanceRequests();

  const [filter, setFilter] = useState<'pending' | 'all' | 'approved' | 'paid' | 'rejected'>('pending');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [approving, setApproving] = useState<AdvanceRequest | null>(null);
  const [approveAmount, setApproveAmount] = useState('');
  const [approveNote, setApproveNote] = useState('');

  const [rejecting, setRejecting] = useState<AdvanceRequest | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  const [historyOf, setHistoryOf] = useState<AdvanceRequest | null>(null);
  const [history, setHistory] = useState<PixHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [configOpen, setConfigOpen] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [cfgForm, setCfgForm] = useState({ ...DEFAULT_ADVANCE_CONFIG });

  useEffect(() => {
    if (config) {
      setCfgForm({
        enabled: config.enabled,
        allow_vale: config.allow_vale,
        allow_adiantamento: config.allow_adiantamento,
        max_amount: config.max_amount,
        max_total_per_month: config.max_total_per_month,
        max_requests_per_month: config.max_requests_per_month,
        min_days_between: config.min_days_between,
        window_day_from: config.window_day_from,
        window_day_to: config.window_day_to,
        require_reason: config.require_reason,
        max_installments: config.max_installments,
        notify_whatsapp: config.notify_whatsapp ?? '',
        rules_text: config.rules_text,
      });
    }
  }, [config]);

  const filtered = useMemo(
    () => (filter === 'all' ? requests : requests.filter((r) => r.status === filter)),
    [requests, filter],
  );
  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  const updateStatus = async (
    row: AdvanceRequest,
    status: AdvanceStatus,
    extra: Record<string, unknown> = {},
  ) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('advance_requests' as any)
      .update({
        status,
        reviewed_by: user?.id ?? null,
        reviewed_at: new Date().toISOString(),
        ...extra,
      } as any)
      .eq('id', row.id);
    if (error) throw error;
  };

  const handleApprove = async () => {
    if (!approving) return;
    const amount = approveAmount ? Number(String(approveAmount).replace(',', '.')) : Number(approving.amount);
    if (!amount || amount <= 0) { toast.error('Valor inválido.'); return; }

    setBusyId(approving.id);
    try {
      await updateStatus(approving, 'approved', {
        approved_amount: amount,
        review_note: approveNote.trim() || null,
      });
      const { sent } = await notifyAdvance(approving.id, 'approved');
      toast.success(sent ? 'Aprovado! O funcionário foi avisado no WhatsApp.' : 'Aprovado.');
      setApproving(null);
      setApproveAmount('');
      setApproveNote('');
      refetch();
    } catch (e: any) {
      toast.error(`Erro: ${e?.message || 'desconhecido'}`);
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async () => {
    if (!rejecting) return;
    setBusyId(rejecting.id);
    try {
      await updateStatus(rejecting, 'rejected', { review_note: rejectNote.trim() || null });
      await notifyAdvance(rejecting.id, 'rejected');
      toast.success('Pedido recusado.');
      setRejecting(null);
      setRejectNote('');
      refetch();
    } catch (e: any) {
      toast.error(`Erro: ${e?.message || 'desconhecido'}`);
    } finally {
      setBusyId(null);
    }
  };

  /** Marca como pago e lança a despesa no Financeiro. */
  const handleMarkPaid = async (row: AdvanceRequest) => {
    const amount = Number(row.approved_amount ?? row.amount);
    if (!confirm(`Confirmar o pagamento de ${formatMoney(amount)} para ${row.employee_name || 'o funcionário'}?`)) return;

    setBusyId(row.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Lançamento no Financeiro. Se falhar (migração/permissão), o pagamento
      // ainda é registrado — o lançamento é complemento, não pré-requisito.
      let financialEntryId: string | null = null;
      try {
        const { data: entry } = await supabase
          .from('financial_entries')
          .insert({
            company_id: row.company_id,
            description: `${ADVANCE_KIND_LABELS[row.kind]} — ${row.employee_name || 'Funcionário'}`,
            category: 'Vale/Adiantamento',
            amount,
            entry_type: 'expense',
            status: 'paid',
            paid_date: format(new Date(), 'yyyy-MM-dd'),
            notes: row.pix_key ? `PIX: ${row.pix_key}` : null,
          } as any)
          .select('id')
          .single();
        financialEntryId = (entry as any)?.id ?? null;
      } catch (e) {
        console.error('Não foi possível lançar no Financeiro:', e);
      }

      const { error } = await supabase
        .from('advance_requests' as any)
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          paid_by: user?.id ?? null,
          approved_amount: amount,
          financial_entry_id: financialEntryId,
        } as any)
        .eq('id', row.id);
      if (error) throw error;

      await notifyAdvance(row.id, 'paid');
      toast.success(
        financialEntryId
          ? 'Pagamento registrado e lançado no Financeiro.'
          : 'Pagamento registrado.',
      );
      refetch();
    } catch (e: any) {
      toast.error(`Erro: ${e?.message || 'desconhecido'}`);
    } finally {
      setBusyId(null);
    }
  };

  const openHistory = async (row: AdvanceRequest) => {
    setHistoryOf(row);
    setHistoryLoading(true);
    try {
      const { data } = await supabase
        .from('employee_pix_history' as any)
        .select('*')
        .eq('employee_id', row.employee_id)
        .order('created_at', { ascending: false });
      setHistory((data || []) as unknown as PixHistoryRow[]);
    } catch (e) {
      console.error('Erro ao carregar histórico de PIX:', e);
    } finally {
      setHistoryLoading(false);
    }
  };

  const copyKey = (key: string) => {
    navigator.clipboard?.writeText(key).then(
      () => toast.success('Chave PIX copiada.'),
      () => toast.error('Não foi possível copiar.'),
    );
  };

  const handleSaveConfig = async () => {
    if (!companyId) { toast.error('Empresa não encontrada.'); return; }
    setConfigSaving(true);
    try {
      // Janela do mês: 0 ou vazio conta como "qualquer dia". Se só um lado
      // for preenchido, avisa em vez de deixar o banco recusar.
      const from = cfgForm.window_day_from || null;
      const to = cfgForm.window_day_to || null;
      if ((from && !to) || (!from && to)) {
        toast.error('Preencha os dois dias da janela, ou deixe os dois vazios.');
        setConfigSaving(false);
        return;
      }
      if ((from && (from < 1 || from > 31)) || (to && (to < 1 || to > 31))) {
        toast.error('Os dias da janela devem ser de 1 a 31.');
        setConfigSaving(false);
        return;
      }
      const payload = {
        company_id: companyId,
        ...cfgForm,
        window_day_from: from,
        window_day_to: to,
        max_amount: cfgForm.max_amount || null,
        max_total_per_month: cfgForm.max_total_per_month || null,
        max_requests_per_month: Math.max(0, cfgForm.max_requests_per_month || 0),
        min_days_between: Math.max(0, cfgForm.min_days_between || 0),
        max_installments: Math.max(1, cfgForm.max_installments || 1),
        notify_whatsapp: cfgForm.notify_whatsapp?.trim() || null,
        rules_text: cfgForm.rules_text?.trim() || null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from('advance_config' as any)
        .upsert(payload as any, { onConflict: 'company_id' });
      if (error) throw error;
      toast.success('Regras salvas.');
      setConfigOpen(false);
      refetchConfig();
    } catch (e: any) {
      toast.error(`Erro ao salvar: ${e?.message || 'desconhecido'}`);
    } finally {
      setConfigSaving(false);
    }
  };

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto space-y-5 animate-fade-in pb-6">
        <PageHeader
          icon={<Wallet className="h-6 w-6" />}
          title="Vale / Adiantamento"
          description="Pedidos dos funcionários, aprovação e pagamento"
          actions={
            <Button variant="outline" onClick={() => setConfigOpen(true)}>
              <Settings className="h-4 w-4 mr-2" />
              Regras
            </Button>
          }
        />

        <MasterCompanyNotice />

        {!configLoading && !config?.enabled && (
          <Card className="border-warning/40 bg-warning/5">
            <CardContent className="p-4 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm">Pedidos desligados</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Os funcionários não conseguem pedir pelo app. Abra <strong>Regras</strong> e ligue
                  a chave para liberar.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground shrink-0">Filtrar:</Label>
          <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
            <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">
                Aguardando aprovação{pendingCount > 0 ? ` (${pendingCount})` : ''}
              </SelectItem>
              <SelectItem value="approved">Aprovados (a pagar)</SelectItem>
              <SelectItem value="paid">Pagos</SelectItem>
              <SelectItem value="rejected">Recusados</SelectItem>
              <SelectItem value="all">Todos</SelectItem>
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
                <Wallet className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="font-medium">Nada por aqui</p>
              <p className="text-sm text-muted-foreground mt-1">
                {filter === 'pending'
                  ? 'Nenhum pedido aguardando aprovação.'
                  : 'Nenhum registro para este filtro.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((r) => {
              const st = ADVANCE_STATUS[r.status];
              const isBusy = busyId === r.id;
              return (
                <Card key={r.id}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold">
                          {ADVANCE_KIND_LABELS[r.kind]} de{' '}
                          <span className="font-mono tabular-nums">{formatMoney(r.amount)}</span>
                          {r.installments > 1 && (
                            <span className="text-muted-foreground font-normal"> · {r.installments}x</span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                          <User className="h-3.5 w-3.5" />
                          {r.employee_name || 'Funcionário'}
                          <span>·</span>
                          {format(new Date(r.created_at), 'dd/MM/yyyy HH:mm')}
                        </p>
                      </div>
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </div>

                    {r.reason && (
                      <p className="text-sm text-foreground/90 whitespace-pre-wrap">{r.reason}</p>
                    )}

                    {/* Chave PIX congelada no pedido */}
                    <div className="rounded-lg bg-muted/50 p-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <KeyRound className="h-3.5 w-3.5" />
                          Chave PIX no momento do pedido
                          {r.pix_key_type && ` (${PIX_KEY_TYPE_LABELS[r.pix_key_type] ?? r.pix_key_type})`}
                        </p>
                        {r.pix_key && (
                          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => copyKey(r.pix_key!)}>
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                      {r.pix_key ? (
                        <>
                          <p className="font-mono text-sm break-all">{r.pix_key}</p>
                          {r.pix_key_owner_name && (
                            <p className="text-xs text-muted-foreground">Titular: {r.pix_key_owner_name}</p>
                          )}
                          <p className="text-xs text-success flex items-center gap-1.5">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Confirmada pelo funcionário ao fazer o pedido
                          </p>
                        </>
                      ) : (
                        <p className="text-xs text-destructive">Sem chave PIX cadastrada.</p>
                      )}
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-xs"
                        onClick={() => openHistory(r)}
                      >
                        <HistoryIcon className="h-3 w-3 mr-1" />
                        Ver histórico de chaves deste funcionário
                      </Button>
                    </div>

                    {r.approved_amount != null && Number(r.approved_amount) !== Number(r.amount) && (
                      <p className="text-sm">
                        Valor liberado:{' '}
                        <strong className="font-mono tabular-nums">{formatMoney(r.approved_amount)}</strong>
                      </p>
                    )}

                    {r.review_note && (
                      <p className="text-xs text-muted-foreground">Observação: {r.review_note}</p>
                    )}

                    {r.status === 'paid' && r.paid_at && (
                      <p className="text-xs text-success">
                        Pago em {format(new Date(r.paid_at), 'dd/MM/yyyy HH:mm')}
                        {r.financial_entry_id ? ' · lançado no Financeiro' : ''}
                      </p>
                    )}

                    {r.status === 'pending' && (
                      <div className="flex gap-2 border-t border-border/60 pt-3">
                        <Button
                          size="sm"
                          className="flex-1"
                          disabled={isBusy}
                          onClick={() => {
                            setApproving(r);
                            setApproveAmount(String(r.amount));
                            setApproveNote('');
                          }}
                        >
                          {isBusy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Check className="h-4 w-4 mr-1.5" />}
                          Aprovar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          disabled={isBusy}
                          onClick={() => { setRejecting(r); setRejectNote(''); }}
                        >
                          <X className="h-4 w-4 mr-1.5" />
                          Recusar
                        </Button>
                      </div>
                    )}

                    {r.status === 'approved' && (
                      <div className="border-t border-border/60 pt-3">
                        <Button size="sm" className="w-full" disabled={isBusy} onClick={() => handleMarkPaid(r)}>
                          {isBusy
                            ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                            : <Banknote className="h-4 w-4 mr-1.5" />}
                          Marcar como pago
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ----- Aprovar ----- */}
      <Dialog open={!!approving} onOpenChange={(o) => { if (!o) setApproving(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Aprovar pedido</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Valor a liberar (R$)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={approveAmount}
                onChange={(e) => setApproveAmount(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Pedido: {approving ? formatMoney(approving.amount) : '—'}. Você pode liberar menos.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Observação (o funcionário verá)</Label>
              <Textarea
                rows={2}
                value={approveNote}
                onChange={(e) => setApproveNote(e.target.value)}
                placeholder="Ex: será descontado no próximo pagamento"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setApproving(null)}>Cancelar</Button>
              <Button className="flex-1" onClick={handleApprove} disabled={!!busyId}>
                {busyId ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
                Aprovar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ----- Recusar ----- */}
      <Dialog open={!!rejecting} onOpenChange={(o) => { if (!o) setRejecting(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Recusar pedido</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Motivo (o funcionário verá)</Label>
              <Textarea
                rows={3}
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="Ex: limite do mês já utilizado"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setRejecting(null)}>Cancelar</Button>
              <Button variant="destructive" className="flex-1" onClick={handleReject} disabled={!!busyId}>
                {busyId ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
                Recusar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ----- Histórico de chaves PIX ----- */}
      <Dialog open={!!historyOf} onOpenChange={(o) => { if (!o) setHistoryOf(null); }}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Chaves PIX de {historyOf?.employee_name || 'funcionário'}</DialogTitle>
          </DialogHeader>
          {historyLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
            </div>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nenhum registro de chave para este funcionário.
            </p>
          ) : (
            <div className="space-y-2">
              {history.map((h) => (
                <div key={h.id} className="rounded-lg border border-border/60 p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(h.created_at), 'dd/MM/yyyy HH:mm')}
                    </p>
                    <Badge variant={h.confirmation ? 'secondary' : 'warning'}>
                      {h.confirmation ? 'Confirmou' : 'Alterou'}
                    </Badge>
                  </div>
                  <p className="font-mono text-sm break-all">{h.pix_key}</p>
                  {h.pix_key_owner_name && (
                    <p className="text-xs text-muted-foreground">Titular: {h.pix_key_owner_name}</p>
                  )}
                  {h.previous_pix_key && (
                    <p className="text-xs text-muted-foreground break-all">
                      Antes: <span className="font-mono line-through">{h.previous_pix_key}</span>
                    </p>
                  )}
                  <p className="text-xs flex items-center gap-1.5">
                    {h.changed_by_self ? (
                      <>
                        <ShieldCheck className="h-3.5 w-3.5 text-success" />
                        <span className="text-success">Pelo próprio funcionário</span>
                      </>
                    ) : (
                      <>
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground">Pela empresa</span>
                      </>
                    )}
                  </p>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ----- Regras da empresa ----- */}
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Regras de vale / adiantamento</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
              <div className="pr-3">
                <p className="font-medium text-sm">Permitir pedidos pelo app</p>
                <p className="text-xs text-muted-foreground">
                  Desligado, o funcionário não vê o botão de pedir.
                </p>
              </div>
              <Switch
                checked={cfgForm.enabled}
                onCheckedChange={(v) => setCfgForm({ ...cfgForm, enabled: v })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                <Label className="text-sm">Vale</Label>
                <Switch
                  checked={cfgForm.allow_vale}
                  onCheckedChange={(v) => setCfgForm({ ...cfgForm, allow_vale: v })}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                <Label className="text-sm">Adiantamento</Label>
                <Switch
                  checked={cfgForm.allow_adiantamento}
                  onCheckedChange={(v) => setCfgForm({ ...cfgForm, allow_adiantamento: v })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Teto por pedido (R$)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cfgForm.max_amount ?? ''}
                  onChange={(e) =>
                    setCfgForm({ ...cfgForm, max_amount: e.target.value ? Number(e.target.value) : null })
                  }
                  placeholder="Sem limite"
                />
              </div>
              <div className="space-y-2">
                <Label>Teto no mês (R$)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cfgForm.max_total_per_month ?? ''}
                  onChange={(e) =>
                    setCfgForm({ ...cfgForm, max_total_per_month: e.target.value ? Number(e.target.value) : null })
                  }
                  placeholder="Sem limite"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Pedidos por mês</Label>
                <Input
                  type="number"
                  min="0"
                  value={cfgForm.max_requests_per_month}
                  onChange={(e) =>
                    setCfgForm({ ...cfgForm, max_requests_per_month: parseInt(e.target.value || '0', 10) })
                  }
                />
                <p className="text-xs text-muted-foreground">0 = sem limite</p>
              </div>
              <div className="space-y-2">
                <Label>Dias entre pedidos</Label>
                <Input
                  type="number"
                  min="0"
                  value={cfgForm.min_days_between}
                  onChange={(e) =>
                    setCfgForm({ ...cfgForm, min_days_between: parseInt(e.target.value || '0', 10) })
                  }
                />
                <p className="text-xs text-muted-foreground">0 = sem carência</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Aceitar pedidos só entre os dias</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="1"
                  max="31"
                  className="w-20"
                  value={cfgForm.window_day_from ?? ''}
                  onChange={(e) =>
                    setCfgForm({ ...cfgForm, window_day_from: e.target.value ? Number(e.target.value) : null })
                  }
                  placeholder="—"
                />
                <span className="text-sm text-muted-foreground">até</span>
                <Input
                  type="number"
                  min="1"
                  max="31"
                  className="w-20"
                  value={cfgForm.window_day_to ?? ''}
                  onChange={(e) =>
                    setCfgForm({ ...cfgForm, window_day_to: e.target.value ? Number(e.target.value) : null })
                  }
                  placeholder="—"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Deixe os dois vazios para aceitar qualquer dia. Se o primeiro for maior que o
                segundo, a janela atravessa o mês (ex.: do dia 25 ao dia 5).
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Máximo de parcelas</Label>
                <Input
                  type="number"
                  min="1"
                  value={cfgForm.max_installments}
                  onChange={(e) =>
                    setCfgForm({ ...cfgForm, max_installments: Math.max(1, parseInt(e.target.value || '1', 10)) })
                  }
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                <Label className="text-sm">Exigir motivo</Label>
                <Switch
                  checked={cfgForm.require_reason}
                  onCheckedChange={(v) => setCfgForm({ ...cfgForm, require_reason: v })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>WhatsApp que recebe os pedidos</Label>
              <Input
                value={cfgForm.notify_whatsapp ?? ''}
                onChange={(e) => setCfgForm({ ...cfgForm, notify_whatsapp: e.target.value })}
                placeholder="5521999999999"
              />
              <p className="text-xs text-muted-foreground">
                Se vazio, usa o telefone da empresa em Minha Empresa.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Aviso para o funcionário (opcional)</Label>
              <Textarea
                rows={3}
                value={cfgForm.rules_text ?? ''}
                onChange={(e) => setCfgForm({ ...cfgForm, rules_text: e.target.value })}
                placeholder="Ex: o vale é descontado no pagamento do dia 5"
              />
            </div>

            <Button className="w-full" onClick={handleSaveConfig} disabled={configSaving}>
              {configSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
              Salvar regras
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
