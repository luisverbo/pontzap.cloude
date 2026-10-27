import { useState, useEffect, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/layout/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Wallet, Plus, KeyRound, Loader2, AlertTriangle, Check, X, ShieldCheck } from 'lucide-react';
import {
  useAdvanceConfig,
  useAdvanceRequests,
  notifyAdvance,
  formatMoney,
  ADVANCE_KIND_LABELS,
  ADVANCE_STATUS,
  PIX_KEY_TYPE_LABELS,
  type AdvanceKind,
  type PixKeyType,
} from '@/hooks/useAdvances';

interface MyPix {
  employeeId: string;
  pix_key: string | null;
  pix_key_type: PixKeyType | null;
  pix_key_owner_name: string | null;
  pix_key_confirmed_at: string | null;
  pix_key_updated_at: string | null;
}

export default function MyAdvances() {
  const { user } = useAuth();
  const { config, loading: configLoading } = useAdvanceConfig();
  const { requests, loading: requestsLoading, refetch } = useAdvanceRequests();

  const [pix, setPix] = useState<MyPix | null>(null);
  const [pixLoading, setPixLoading] = useState(true);

  const [pixDialogOpen, setPixDialogOpen] = useState(false);
  const [pixSaving, setPixSaving] = useState(false);
  const [pixForm, setPixForm] = useState({ key: '', type: 'cpf' as PixKeyType, owner: '' });

  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    kind: 'vale' as AdvanceKind,
    amount: '',
    installments: 1,
    reason: '',
    pixConfirmed: false,
  });

  const loadPix = async () => {
    if (!user) return;
    setPixLoading(true);
    try {
      const { data } = await supabase
        .from('employees')
        .select('id, pix_key, pix_key_type, pix_key_owner_name, pix_key_confirmed_at, pix_key_updated_at')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data) {
        setPix({
          employeeId: (data as any).id,
          pix_key: (data as any).pix_key ?? null,
          pix_key_type: (data as any).pix_key_type ?? null,
          pix_key_owner_name: (data as any).pix_key_owner_name ?? null,
          pix_key_confirmed_at: (data as any).pix_key_confirmed_at ?? null,
          pix_key_updated_at: (data as any).pix_key_updated_at ?? null,
        });
      }
    } catch (e) {
      console.error('Erro ao carregar chave PIX:', e);
    } finally {
      setPixLoading(false);
    }
  };

  useEffect(() => { loadPix(); /* eslint-disable-next-line */ }, [user]);

  const allowedKinds = useMemo<AdvanceKind[]>(() => {
    const kinds: AdvanceKind[] = [];
    if (config?.allow_vale) kinds.push('vale');
    if (config?.allow_adiantamento) kinds.push('adiantamento');
    return kinds;
  }, [config]);

  const openRequestDialog = () => {
    setForm({
      kind: allowedKinds[0] || 'vale',
      amount: '',
      installments: 1,
      reason: '',
      pixConfirmed: false,
    });
    setRequestDialogOpen(true);
  };

  const openPixDialog = () => {
    setPixForm({
      key: pix?.pix_key || '',
      type: pix?.pix_key_type || 'cpf',
      owner: pix?.pix_key_owner_name || '',
    });
    setPixDialogOpen(true);
  };

  const handleSavePix = async () => {
    if (!pixForm.key.trim()) { toast.error('Informe a chave PIX.'); return; }
    setPixSaving(true);
    try {
      const { error } = await supabase.rpc('set_my_pix_key' as any, {
        p_key: pixForm.key.trim(),
        p_type: pixForm.type,
        p_owner_name: pixForm.owner.trim() || null,
      });
      if (error) throw error;
      toast.success('Chave PIX salva. A empresa vai pagar nesta chave.');
      setPixDialogOpen(false);
      loadPix();
    } catch (e: any) {
      toast.error(`Erro ao salvar: ${e?.message || 'desconhecido'}`);
    } finally {
      setPixSaving(false);
    }
  };

  const handleSubmitRequest = async () => {
    const amount = Number(String(form.amount).replace(',', '.'));
    if (!amount || amount <= 0) { toast.error('Informe o valor.'); return; }
    if (config?.require_reason && !form.reason.trim()) { toast.error('Descreva o motivo.'); return; }
    if (!pix?.employeeId) { toast.error('Funcionário não identificado.'); return; }
    if (!pix.pix_key) { toast.error('Cadastre sua chave PIX antes de pedir.'); return; }
    if (!form.pixConfirmed) { toast.error('Confirme que a chave PIX é sua e está ativa.'); return; }

    setSaving(true);
    try {
      // Registra a confirmação ANTES do pedido: fica provado que, nesta data,
      // o próprio funcionário disse que a chave era essa.
      const { error: confirmError } = await supabase.rpc('confirm_my_pix_key' as any, {});
      if (confirmError) throw confirmError;

      const { data, error } = await supabase
        .from('advance_requests' as any)
        .insert({
          employee_id: pix.employeeId,
          kind: form.kind,
          amount,
          installments: form.installments,
          reason: form.reason.trim() || null,
        } as any)
        .select('id')
        .single();
      if (error) throw error;

      const { sent, reason } = await notifyAdvance((data as any).id, 'requested');
      toast.success(
        sent
          ? 'Pedido enviado! A empresa já recebeu no WhatsApp.'
          : `Pedido registrado.${reason ? ` (Aviso no WhatsApp não saiu: ${reason})` : ''}`,
      );

      setRequestDialogOpen(false);
      refetch();
      loadPix();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao enviar o pedido.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Cancelar este pedido?')) return;
    try {
      const { error } = await supabase
        .from('advance_requests' as any)
        .update({ status: 'cancelled' } as any)
        .eq('id', id);
      if (error) throw error;
      toast.success('Pedido cancelado.');
      refetch();
    } catch (e: any) {
      toast.error(`Erro ao cancelar: ${e?.message || 'desconhecido'}`);
    }
  };

  const loading = configLoading || pixLoading;
  const enabled = !!config?.enabled && allowedKinds.length > 0;
  const hasPendingOrApproved = requests.some((r) => r.status === 'pending' || r.status === 'approved');

  const limitsText = useMemo(() => {
    if (!config) return [];
    const parts: string[] = [];
    if (config.max_amount != null) parts.push(`Até ${formatMoney(config.max_amount)} por pedido`);
    if (config.max_total_per_month != null) parts.push(`Até ${formatMoney(config.max_total_per_month)} no mês`);
    if (config.max_requests_per_month > 0) {
      parts.push(`${config.max_requests_per_month} pedido(s) por mês`);
    }
    if (config.min_days_between > 0) parts.push(`${config.min_days_between} dia(s) entre pedidos`);
    if (config.window_day_from != null && config.window_day_to != null) {
      parts.push(`Do dia ${config.window_day_from} ao dia ${config.window_day_to}`);
    }
    if (config.max_installments > 1) parts.push(`Até ${config.max_installments}x`);
    return parts;
  }, [config]);

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto space-y-5 animate-fade-in pb-6">
        <PageHeader
          icon={<Wallet className="h-6 w-6" />}
          title="Vale / Adiantamento"
          description="Peça um vale e acompanhe a resposta da empresa"
          actions={
            enabled ? (
              <Button onClick={openRequestDialog} disabled={!pix?.pix_key}>
                <Plus className="h-4 w-4 mr-2" />
                Pedir
              </Button>
            ) : undefined
          }
        />

        {/* ----- Chave PIX ----- */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-primary" />
                <p className="font-semibold text-sm">Minha chave PIX</p>
              </div>
              <Button variant="outline" size="sm" onClick={openPixDialog}>
                {pix?.pix_key ? 'Alterar' : 'Cadastrar'}
              </Button>
            </div>

            {pixLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : pix?.pix_key ? (
              <>
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">
                    {pix.pix_key_type ? PIX_KEY_TYPE_LABELS[pix.pix_key_type] : 'Chave'}
                  </p>
                  <p className="font-mono text-sm break-all">{pix.pix_key}</p>
                  {pix.pix_key_owner_name && (
                    <p className="text-xs text-muted-foreground mt-1">Titular: {pix.pix_key_owner_name}</p>
                  )}
                </div>
                {pix.pix_key_confirmed_at ? (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-success" />
                    Você confirmou esta chave em{' '}
                    {format(new Date(pix.pix_key_confirmed_at), 'dd/MM/yyyy')}
                  </p>
                ) : (
                  <p className="text-xs text-warning flex items-start gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    Esta chave foi cadastrada pela empresa e você ainda não confirmou.
                  </p>
                )}
                <p className="text-xs text-muted-foreground border-t border-border/60 pt-2">
                  É nesta chave que a empresa vai depositar.{' '}
                  <strong>Trocou de banco ou de chave? Atualize aqui antes de pedir</strong> — toda
                  alteração fica registrada com data.
                </p>
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-4 text-center">
                <p className="text-sm font-medium">Nenhuma chave cadastrada</p>
                <p className="text-xs text-muted-foreground mt-1 mb-3">
                  Cadastre sua chave PIX para poder pedir vale ou adiantamento.
                </p>
                <Button size="sm" onClick={openPixDialog}>
                  <KeyRound className="h-4 w-4 mr-2" />
                  Cadastrar chave PIX
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ----- Regras da empresa ----- */}
        {loading ? null : !enabled ? (
          <Card>
            <CardContent className="py-8 text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-muted flex items-center justify-center">
                <Wallet className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="font-medium">Pedidos não liberados</p>
              <p className="text-sm text-muted-foreground mt-1">
                Sua empresa ainda não liberou pedidos de vale/adiantamento pelo app.
              </p>
            </CardContent>
          </Card>
        ) : (
          (limitsText.length > 0 || config?.rules_text) && (
            <Card>
              <CardContent className="p-4 space-y-2">
                <p className="font-semibold text-sm">Regras da empresa</p>
                {limitsText.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {limitsText.map((t) => (
                      <span key={t} className="inline-flex px-2 py-0.5 rounded text-xs bg-primary/10 text-primary">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                {config?.rules_text && (
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap">{config.rules_text}</p>
                )}
              </CardContent>
            </Card>
          )
        )}

        {/* ----- Meus pedidos ----- */}
        {requestsLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
          </div>
        ) : requests.length === 0 ? (
          enabled && (
            <Card>
              <CardContent className="py-10 text-center">
                <p className="font-medium">Nenhum pedido ainda</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Seus pedidos e as respostas da empresa aparecem aqui.
                </p>
              </CardContent>
            </Card>
          )
        ) : (
          <div className="space-y-3">
            {requests.map((r) => {
              const st = ADVANCE_STATUS[r.status];
              return (
                <Card key={r.id}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold">
                          {ADVANCE_KIND_LABELS[r.kind]} de{' '}
                          <span className="font-mono tabular-nums">{formatMoney(r.amount)}</span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Pedido em {format(new Date(r.created_at), 'dd/MM/yyyy HH:mm')}
                          {r.installments > 1 ? ` · ${r.installments}x` : ''}
                        </p>
                      </div>
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </div>

                    {r.reason && (
                      <p className="text-sm text-foreground/90 whitespace-pre-wrap">{r.reason}</p>
                    )}

                    {r.status !== 'pending' && r.approved_amount != null
                      && Number(r.approved_amount) !== Number(r.amount) && (
                      <p className="text-sm">
                        Valor liberado:{' '}
                        <strong className="font-mono tabular-nums">{formatMoney(r.approved_amount)}</strong>
                      </p>
                    )}

                    {r.review_note && (
                      <p className="text-xs text-muted-foreground border-t border-border/60 pt-2">
                        {r.status === 'rejected' ? 'Motivo da recusa: ' : 'Observação: '}
                        {r.review_note}
                      </p>
                    )}

                    {r.status === 'paid' && r.paid_at && (
                      <p className="text-xs text-success border-t border-border/60 pt-2">
                        Pago em {format(new Date(r.paid_at), 'dd/MM/yyyy')}
                        {r.pix_key ? ` na chave ${r.pix_key}` : ''}
                      </p>
                    )}

                    {r.status === 'pending' && (
                      <div className="border-t border-border/60 pt-3">
                        <Button variant="outline" size="sm" onClick={() => handleCancel(r.id)}>
                          <X className="h-4 w-4 mr-1.5" />
                          Cancelar pedido
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

      {/* ----- Dialog: chave PIX ----- */}
      <Dialog open={pixDialogOpen} onOpenChange={setPixDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{pix?.pix_key ? 'Alterar chave PIX' : 'Cadastrar chave PIX'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo de chave *</Label>
              <Select
                value={pixForm.type}
                onValueChange={(v) => setPixForm({ ...pixForm, type: v as PixKeyType })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(PIX_KEY_TYPE_LABELS) as PixKeyType[]).map((t) => (
                    <SelectItem key={t} value={t}>{PIX_KEY_TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Chave *</Label>
              <Input
                value={pixForm.key}
                onChange={(e) => setPixForm({ ...pixForm, key: e.target.value })}
                placeholder={pixForm.type === 'cpf' ? '000.000.000-00' : 'Sua chave PIX'}
              />
            </div>
            <div className="space-y-2">
              <Label>Nome do titular (se não for você)</Label>
              <Input
                value={pixForm.owner}
                onChange={(e) => setPixForm({ ...pixForm, owner: e.target.value })}
                placeholder="Deixe vazio se a conta é sua"
              />
            </div>
            <p className="text-xs text-muted-foreground rounded-lg bg-muted/50 p-3">
              A empresa paga exatamente na chave que estiver aqui. Toda alteração é registrada com
              data e autor — se você trocar de conta, avise atualizando aqui.
            </p>
            <Button className="w-full" onClick={handleSavePix} disabled={pixSaving}>
              {pixSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
              Salvar chave
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ----- Dialog: novo pedido ----- */}
      <Dialog open={requestDialogOpen} onOpenChange={setRequestDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pedir vale / adiantamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {allowedKinds.length > 1 && (
              <div className="space-y-2">
                <Label>Tipo *</Label>
                <Select
                  value={form.kind}
                  onValueChange={(v) => setForm({ ...form, kind: v as AdvanceKind })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {allowedKinds.map((k) => (
                      <SelectItem key={k} value={k}>{ADVANCE_KIND_LABELS[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Valor (R$) *</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="0,00"
              />
              {config?.max_amount != null && (
                <p className="text-xs text-muted-foreground">
                  Limite por pedido: {formatMoney(config.max_amount)}
                </p>
              )}
            </div>

            {(config?.max_installments ?? 1) > 1 && (
              <div className="space-y-2">
                <Label>Descontar em quantas parcelas</Label>
                <Select
                  value={String(form.installments)}
                  onValueChange={(v) => setForm({ ...form, installments: Number(v) })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: config!.max_installments }, (_, i) => i + 1).map((n) => (
                      <SelectItem key={n} value={String(n)}>{n}x</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Motivo {config?.require_reason ? '*' : '(opcional)'}</Label>
              <Textarea
                rows={3}
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="Ex: imprevisto com remédio"
              />
            </div>

            {/* Confirmação da chave — o coração do registro */}
            <div className="rounded-lg border border-border/60 p-3 space-y-2">
              <p className="text-xs text-muted-foreground">O pagamento vai para:</p>
              <p className="font-mono text-sm break-all">{pix?.pix_key || '—'}</p>
              {pix?.pix_key_owner_name && (
                <p className="text-xs text-muted-foreground">Titular: {pix.pix_key_owner_name}</p>
              )}
              <div className="flex items-start space-x-2 pt-1">
                <Checkbox
                  id="pix-confirm"
                  checked={form.pixConfirmed}
                  onCheckedChange={(c) => setForm({ ...form, pixConfirmed: c as boolean })}
                />
                <Label htmlFor="pix-confirm" className="font-normal cursor-pointer text-xs leading-snug">
                  Confirmo que esta chave PIX é minha, está ativa e é onde quero receber.
                </Label>
              </div>
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                onClick={() => { setRequestDialogOpen(false); openPixDialog(); }}
              >
                Não é essa chave — quero alterar
              </Button>
            </div>

            {hasPendingOrApproved && (
              <p className="text-xs text-warning flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                Você já tem pedido em aberto neste mês. Dependendo das regras da empresa, este pode
                ser recusado automaticamente.
              </p>
            )}

            <Button className="w-full" onClick={handleSubmitRequest} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wallet className="h-4 w-4 mr-2" />}
              Enviar pedido
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
