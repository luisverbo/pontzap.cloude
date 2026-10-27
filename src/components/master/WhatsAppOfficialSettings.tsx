import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Loader2, Copy, RefreshCw, Send, ShieldCheck, Smartphone, FileText, CheckCircle2, Clock, XCircle, AlertTriangle, Eye, EyeOff,
} from 'lucide-react';

interface Props {
  /** id da linha em evolution_config (se já existir). */
  configId?: string;
  onSaved: (id: string) => void;
}

interface PhoneInfo {
  display_phone_number?: string;
  verified_name?: string;
  name_status?: string;
  quality_rating?: string;
  code_verification_status?: string;
  status?: string;
  platform_type?: string;
  messaging_limit_tier?: string;
}

interface TemplateRow {
  name: string;
  purpose: string;
  audience: string;
  body: string;
  buttons: string[];
  status?: string;
  category?: string | null;
  rejected_reason?: string | null;
  last_error?: string | null;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/whatsapp-meta`;

const randomToken = () => {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return `pontzap_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
};

const STATUS_BADGE: Record<string, { label: string; className: string; icon: JSX.Element }> = {
  APPROVED: { label: 'Aprovado', className: 'bg-success/10 text-success', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  PENDING: { label: 'Em análise', className: 'bg-warning/10 text-warning', icon: <Clock className="h-3.5 w-3.5" /> },
  IN_APPEAL: { label: 'Em recurso', className: 'bg-warning/10 text-warning', icon: <Clock className="h-3.5 w-3.5" /> },
  REJECTED: { label: 'Rejeitado', className: 'bg-destructive/10 text-destructive', icon: <XCircle className="h-3.5 w-3.5" /> },
  PAUSED: { label: 'Pausado', className: 'bg-destructive/10 text-destructive', icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  DISABLED: { label: 'Desativado', className: 'bg-destructive/10 text-destructive', icon: <XCircle className="h-3.5 w-3.5" /> },
  NOT_SUBMITTED: { label: 'Não enviado', className: 'bg-muted text-muted-foreground', icon: <FileText className="h-3.5 w-3.5" /> },
};

async function callOfficial(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('whatsapp-official', { body });
  if (error) {
    let info: any = {};
    try { info = await (error as any).context?.json?.(); } catch { /* ignore */ }
    throw new Error(info?.error || error.message);
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as any;
}

/**
 * Configuração da API oficial do WhatsApp (Meta Cloud API) no Painel Master:
 * credenciais, webhook, ativação do número, templates e teste.
 */
export function WhatsAppOfficialSettings({ configId, onSaved }: Props) {
  const [form, setForm] = useState({
    meta_phone_number_id: '',
    meta_waba_id: '',
    meta_access_token: '',
    meta_app_secret: '',
    meta_verify_token: '',
    meta_api_version: 'v21.0',
  });
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const [phone, setPhone] = useState<PhoneInfo | null>(null);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [pin, setPin] = useState('');
  const [registering, setRegistering] = useState(false);

  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [templatesBusy, setTemplatesBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [testPhone, setTestPhone] = useState('');
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('evolution_config' as any).select('*').limit(1).maybeSingle();
      const d = (data || {}) as any;
      setForm({
        meta_phone_number_id: d.meta_phone_number_id || '',
        meta_waba_id: d.meta_waba_id || '',
        meta_access_token: d.meta_access_token || '',
        meta_app_secret: d.meta_app_secret || '',
        meta_verify_token: d.meta_verify_token || randomToken(),
        meta_api_version: d.meta_api_version || 'v21.0',
      });
      setLoaded(true);
    })();
  }, []);

  const isConfigured = !!(form.meta_phone_number_id && form.meta_access_token);

  const loadPhone = useCallback(async () => {
    setPhoneBusy(true);
    try {
      const res = await callOfficial({ action: 'info' });
      setPhone(res.phone);
    } catch (e: any) {
      setPhone(null);
      toast.error(e.message);
    } finally {
      setPhoneBusy(false);
    }
  }, []);

  const loadTemplates = useCallback(async () => {
    setTemplatesBusy(true);
    try {
      const res = await callOfficial({ action: 'templates' });
      setTemplates(res.templates || []);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setTemplatesBusy(false);
    }
  }, []);

  const handleSave = async () => {
    if (!form.meta_phone_number_id.trim() || !form.meta_access_token.trim()) {
      toast.error('Preencha pelo menos o ID do número e o token de acesso.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        provider: 'meta',
        is_active: true,
        meta_phone_number_id: form.meta_phone_number_id.trim(),
        meta_waba_id: form.meta_waba_id.trim() || null,
        meta_access_token: form.meta_access_token.trim(),
        meta_app_secret: form.meta_app_secret.trim() || null,
        meta_verify_token: form.meta_verify_token.trim(),
        meta_api_version: form.meta_api_version.trim() || 'v21.0',
        updated_at: new Date().toISOString(),
      };
      if (configId) {
        const { error } = await supabase.from('evolution_config' as any).update(payload as any).eq('id', configId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('evolution_config' as any).insert(payload as any).select('id').single();
        if (error) throw error;
        onSaved((data as any).id);
      }
      toast.success('API oficial salva. A partir de agora as mensagens saem por ela.');
      loadPhone();
    } catch (e: any) {
      toast.error(`Erro ao salvar: ${e?.message || 'desconhecido'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleRegister = async () => {
    if (!/^\d{6}$/.test(pin)) { toast.error('O PIN deve ter 6 números.'); return; }
    setRegistering(true);
    try {
      await callOfficial({ action: 'register', pin });
      toast.success('Número ativado na API oficial!');
      setPin('');
      loadPhone();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRegistering(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await callOfficial({ action: 'sync' });
      setTemplates(res.templates || []);
      const created = (res.results || []).filter((r: any) => r.created).length;
      const failed = (res.results || []).filter((r: any) => r.error);
      if (failed.length) {
        toast.error(`${failed.length} template(s) com erro — veja a mensagem em cada um.`);
      } else {
        toast.success(created ? `${created} template(s) enviados para aprovação da Meta.` : 'Todos os templates já estão na Meta.');
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      await callOfficial({ action: 'test', phone: testPhone });
      toast.success('Mensagem de teste enviada (template "hello_world", em inglês).');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setTesting(false);
    }
  };

  const copy = (text: string, label: string) => {
    navigator.clipboard?.writeText(text).then(
      () => toast.success(`${label} copiado.`),
      () => toast.error('Não foi possível copiar.'),
    );
  };

  if (!loaded) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;

  const approved = templates.filter((t) => t.status === 'APPROVED').length;
  const recategorized = templates.filter((t) => t.category && t.category !== 'UTILITY');

  return (
    <div className="space-y-6">
      {/* ---------- 1. Credenciais ---------- */}
      <section className="space-y-4">
        <div className="bg-muted/50 p-4 rounded-lg text-sm text-muted-foreground space-y-1">
          <p>
            Pegue estes dados no <strong>WhatsApp Manager</strong> (business.facebook.com → WhatsApp →
            Configuração da API) depois de adicionar e verificar o número.
          </p>
          <p>O token deve ser de um <strong>usuário do sistema</strong> (não expira).</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>ID do número de telefone</Label>
            <Input
              placeholder="Ex: 123456789012345"
              value={form.meta_phone_number_id}
              onChange={(e) => setForm({ ...form, meta_phone_number_id: e.target.value.replace(/\D/g, '') })}
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label>ID da conta do WhatsApp Business (WABA)</Label>
            <Input
              placeholder="Ex: 987654321098765"
              value={form.meta_waba_id}
              onChange={(e) => setForm({ ...form, meta_waba_id: e.target.value.replace(/\D/g, '') })}
              className="font-mono"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Token de acesso permanente</Label>
          <div className="flex gap-2">
            <Input
              type={showToken ? 'text' : 'password'}
              placeholder="EAAG…"
              value={form.meta_access_token}
              onChange={(e) => setForm({ ...form, meta_access_token: e.target.value })}
              className="font-mono"
            />
            <Button variant="ghost" size="icon" onClick={() => setShowToken((s) => !s)} aria-label="Mostrar token">
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Chave secreta do app (opcional, recomendado)</Label>
          <Input
            type="password"
            placeholder="App Secret — Configurações do app → Básico"
            value={form.meta_app_secret}
            onChange={(e) => setForm({ ...form, meta_app_secret: e.target.value })}
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">
            Com ela o PONTZAP confere que cada clique de botão veio mesmo da Meta.
          </p>
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Salvar e usar a API oficial
        </Button>
      </section>

      {/* ---------- 2. Webhook ---------- */}
      <section className="space-y-3 rounded-lg border border-border/60 p-4">
        <p className="font-medium flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Webhook (para os botões funcionarem)
        </p>
        <p className="text-xs text-muted-foreground">
          No painel do app da Meta → WhatsApp → Configuração → Webhook: cole a URL e o token abaixo,
          clique em <em>Verificar e salvar</em> e assine os campos <code>messages</code>,{' '}
          <code>message_template_status_update</code> e <code>template_category_update</code>.
        </p>
        <div className="space-y-2">
          <Label className="text-xs">URL de callback</Label>
          <div className="flex gap-2">
            <Input readOnly value={WEBHOOK_URL} className="font-mono text-xs" />
            <Button variant="outline" size="icon" onClick={() => copy(WEBHOOK_URL, 'URL')} aria-label="Copiar URL">
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Token de verificação</Label>
          <div className="flex gap-2">
            <Input readOnly value={form.meta_verify_token} className="font-mono text-xs" />
            <Button variant="outline" size="icon" onClick={() => copy(form.meta_verify_token, 'Token')} aria-label="Copiar token">
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Salve a configuração acima antes de verificar na Meta.</p>
        </div>
      </section>

      {/* ---------- 3. Número ---------- */}
      <section className="space-y-3 rounded-lg border border-border/60 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-primary" />
            Número oficial
          </p>
          <Button variant="outline" size="sm" onClick={loadPhone} disabled={!isConfigured || phoneBusy}>
            {phoneBusy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
            Verificar
          </Button>
        </div>

        {phone ? (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-muted-foreground">Número:</span> {phone.display_phone_number || '—'}</div>
            <div><span className="text-muted-foreground">Nome exibido:</span> {phone.verified_name || '—'}</div>
            <div><span className="text-muted-foreground">Nome:</span> {phone.name_status || '—'}</div>
            <div><span className="text-muted-foreground">Qualidade:</span> {phone.quality_rating || '—'}</div>
            <div><span className="text-muted-foreground">Status:</span> {phone.status || '—'}</div>
            <div><span className="text-muted-foreground">Limite:</span> {phone.messaging_limit_tier || '—'}</div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Clique em Verificar para ver os dados do número na Meta.</p>
        )}

        <div className="space-y-2 border-t border-border/60 pt-3">
          <Label className="text-xs">Ativar o número na API (só uma vez)</Label>
          <div className="flex gap-2">
            <Input
              inputMode="numeric"
              maxLength={6}
              placeholder="PIN de 6 números"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              className="font-mono tracking-widest max-w-40"
            />
            <Button variant="outline" onClick={handleRegister} disabled={!isConfigured || registering}>
              {registering && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Ativar número
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Se o status aparecer como <em>PENDING</em>, ative aqui. Invente um PIN de 6 números e
            <strong> anote</strong> — ele vira a verificação em duas etapas do número.
          </p>
        </div>

        <div className="space-y-2 border-t border-border/60 pt-3">
          <Label className="text-xs">Mensagem de teste</Label>
          <div className="flex gap-2">
            <Input
              placeholder="5521999999999"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
            />
            <Button variant="outline" onClick={handleTest} disabled={!isConfigured || testing}>
              {testing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
              Testar
            </Button>
          </div>
        </div>
      </section>

      {/* ---------- 4. Templates ---------- */}
      <section className="space-y-3 rounded-lg border border-border/60 p-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="font-medium flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Templates {templates.length > 0 && <span className="text-muted-foreground font-normal">({approved}/{templates.length} aprovados)</span>}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadTemplates} disabled={!isConfigured || templatesBusy}>
              {templatesBusy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
              Atualizar status
            </Button>
            <Button size="sm" onClick={handleSync} disabled={!isConfigured || syncing}>
              {syncing && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Criar templates na Meta
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Todos são pedidos como <strong>Utilidade</strong> (avisos de um evento concreto, sem promoção).
          A aprovação costuma levar de minutos a algumas horas. Enquanto não aprovar, o aviso daquele tipo
          não sai pela API oficial.
        </p>

        {recategorized.length > 0 && (
          <p className="text-xs text-destructive flex items-start gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            A Meta reclassificou {recategorized.map((t) => t.name).join(', ')} como{' '}
            {recategorized[0].category}. Me avise para reescrever o texto.
          </p>
        )}

        {templates.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Clique em <em>Atualizar status</em> para ver a lista, ou em <em>Criar templates na Meta</em> para enviar todos.
          </p>
        ) : (
          <div className="space-y-2">
            {templates.map((t) => {
              const badge = STATUS_BADGE[t.status || 'NOT_SUBMITTED'] || STATUS_BADGE.NOT_SUBMITTED;
              return (
                <details key={t.name} className="rounded-lg border border-border/60 p-3 group">
                  <summary className="flex items-start justify-between gap-2 cursor-pointer list-none">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{t.purpose}</p>
                      <p className="text-xs text-muted-foreground font-mono truncate">{t.name} · {t.audience}</p>
                    </div>
                    <Badge className={`${badge.className} gap-1 shrink-0`}>{badge.icon}{badge.label}</Badge>
                  </summary>
                  <div className="mt-3 space-y-2">
                    <p className="text-xs whitespace-pre-wrap rounded bg-muted/50 p-2">{t.body}</p>
                    {t.buttons.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {t.buttons.map((b) => (
                          <span key={b} className="text-xs rounded-full border border-primary/40 text-primary px-2 py-0.5">{b}</span>
                        ))}
                      </div>
                    )}
                    {t.category && t.category !== 'UTILITY' && (
                      <p className="text-xs text-destructive">Categoria na Meta: {t.category}</p>
                    )}
                    {t.rejected_reason && <p className="text-xs text-destructive">Motivo da rejeição: {t.rejected_reason}</p>}
                    {t.last_error && t.status === 'NOT_SUBMITTED' && (
                      <p className="text-xs text-destructive">Erro ao enviar: {t.last_error}</p>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
