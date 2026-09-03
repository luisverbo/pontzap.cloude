import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getImpersonatedCompanyId } from '@/components/ImpersonationBar';
import { Switch } from '@/components/ui/switch';
import { Building2, Loader2, Save, MessageCircle, Camera } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';

export default function CompanyProfile() {
  const { companyStatus } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '', cnpj: '', email: '', phone: '',
    address: '', cep: '', city: '', state: '',
  });

  // Daily WhatsApp summary — opt-in, per-company
  const [summarySaving, setSummarySaving] = useState(false);
  const [summaryConfigId, setSummaryConfigId] = useState<string | null>(null);
  const [summary, setSummary] = useState({ enabled: false, send_time: '18:00', whatsapp: '' });

  // Selfie/photo on clock-in — opt-in, per-company (anti-fraud)
  const [requirePhoto, setRequirePhoto] = useState(false);
  const [cooldownMinutes, setCooldownMinutes] = useState(15);
  const [cooldownSaving, setCooldownSaving] = useState(false);
  const [photoSaving, setPhotoSaving] = useState(false);

  const handleSaveCooldown = async () => {
    if (!companyId) { toast.error('Empresa não encontrada'); return; }
    setCooldownSaving(true);
    try {
      const { error } = await supabase
        .from('companies')
        .update({ punch_cooldown_minutes: Math.max(0, Math.min(120, cooldownMinutes)) } as any)
        .eq('id', companyId);
      if (error) throw error;
      toast.success('Intervalo entre batidas salvo.');
    } catch (e: any) {
      toast.error(`Erro ao salvar: ${e?.message || 'desconhecido'}`);
    } finally {
      setCooldownSaving(false);
    }
  };

  const handleTogglePhoto = async (value: boolean) => {
    if (!companyId) { toast.error('Empresa não encontrada'); return; }
    setRequirePhoto(value);
    setPhotoSaving(true);
    try {
      const { error } = await supabase
        .from('companies')
        .update({ require_clock_photo: value })
        .eq('id', companyId);
      if (error) throw error;
      toast.success(value ? 'Foto no ponto ativada' : 'Foto no ponto desativada');
    } catch (e: any) {
      setRequirePhoto(!value); // revert on failure
      console.error('Erro ao salvar config de foto:', e);
      toast.error(`Erro ao salvar: ${e?.message || 'desconhecido'}`);
    } finally {
      setPhotoSaving(false);
    }
  };

  const loadSummaryConfig = async (id: string) => {
    const { data } = await supabase
      .from('daily_summary_config')
      .select('id, enabled, send_time, whatsapp')
      .eq('company_id', id)
      .maybeSingle();
    if (data) {
      setSummaryConfigId((data as any).id);
      setSummary({
        enabled: (data as any).enabled ?? false,
        send_time: String((data as any).send_time || '18:00').slice(0, 5),
        whatsapp: (data as any).whatsapp || '',
      });
    }
  };

  const handleSaveSummary = async () => {
    if (!companyId) return;
    setSummarySaving(true);
    try {
      const payload = {
        company_id: companyId,
        enabled: summary.enabled,
        send_time: summary.send_time,
        whatsapp: summary.whatsapp.trim() || null,
        updated_at: new Date().toISOString(),
      };
      if (summaryConfigId) {
        const { error } = await supabase.from('daily_summary_config').update(payload).eq('id', summaryConfigId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('daily_summary_config').insert(payload).select('id').single();
        if (error) throw error;
        setSummaryConfigId(data.id);
      }
      toast.success(summary.enabled ? 'Resumo diário ativado!' : 'Configuração salva');
    } catch (e: any) {
      console.error('Erro ao salvar resumo diário:', e);
      toast.error(`Erro ao salvar: ${e?.message || 'desconhecido'}`);
    } finally {
      setSummarySaving(false);
    }
  };

  const resolveCompanyId = async (): Promise<string | null> => {
    const imp = getImpersonatedCompanyId();
    if (imp) return imp;
    if (companyStatus?.id) return companyStatus.id;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: emp } = await supabase.from('employees').select('company_id').eq('user_id', user.id).maybeSingle();
    if (emp?.company_id) return emp.company_id;
    const { data: owned } = await supabase.from('companies').select('id').eq('admin_user_id', user.id).maybeSingle();
    return owned?.id ?? null;
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const id = await resolveCompanyId();
        if (!id) { setLoading(false); return; }
        setCompanyId(id);
        const { data } = await supabase
          .from('companies')
          .select('name, cnpj, email, phone, address, cep, city, state, require_clock_photo, punch_cooldown_minutes')
          .eq('id', id)
          .maybeSingle();
        if (data) {
          setForm({
            name: (data as any).name || '',
            cnpj: (data as any).cnpj || '',
            email: (data as any).email || '',
            phone: (data as any).phone || '',
            address: (data as any).address || '',
            cep: (data as any).cep || '',
            city: (data as any).city || '',
            state: (data as any).state || '',
          });
          setRequirePhoto(!!(data as any).require_clock_photo);
          setCooldownMinutes(Number((data as any).punch_cooldown_minutes ?? 15));
        }
        await loadSummaryConfig(id);
      } catch (e) {
        console.error('Erro ao carregar empresa:', e);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    if (!companyId) { toast.error('Empresa não encontrada'); return; }
    if (!form.name.trim()) { toast.error('Nome da empresa é obrigatório'); return; }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('companies')
        .update({
          name: form.name.trim(),
          cnpj: form.cnpj.trim() || null,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          address: form.address.trim() || null,
          cep: form.cep.trim() || null,
          city: form.city.trim() || null,
          state: form.state.trim() || null,
        })
        .eq('id', companyId);
      if (error) throw error;
      toast.success('Dados da empresa salvos!');
    } catch (e: any) {
      console.error('Erro ao salvar empresa:', e);
      toast.error(`Erro ao salvar: ${e?.message || 'desconhecido'}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
        <PageHeader
          icon={<Building2 className="h-6 w-6" />}
          title="Minha Empresa"
          description="Estes dados aparecem como empregador no espelho de ponto"
        />

        <Card className="card-modern">
          <CardHeader>
            <CardTitle>Dados da Empresa</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Razão Social / Nome *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome da empresa" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>CNPJ</Label>
                <Input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} placeholder="00.000.000/0000-00" />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(11) 99999-9999" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="contato@empresa.com" />
            </div>
            <div className="space-y-2">
              <Label>Endereço</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Rua, número, bairro" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>CEP</Label>
                <Input value={form.cep} onChange={(e) => setForm({ ...form, cep: e.target.value })} placeholder="00000-000" />
              </div>
              <div className="space-y-2">
                <Label>Cidade</Label>
                <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Cidade" />
              </div>
              <div className="space-y-2">
                <Label>UF</Label>
                <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} placeholder="SP" maxLength={2} />
              </div>
            </div>
            <Button className="w-full" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Salvar
            </Button>
          </CardContent>
        </Card>

        <Card className="card-modern">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5 text-primary" />
              Registro de Ponto
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
              <div className="pr-3">
                <p className="font-medium text-sm">Exigir foto (selfie) ao bater ponto</p>
                <p className="text-xs text-muted-foreground">
                  Pede uma selfie de confirmação em toda batida (entrada, saída e almoço). Deixe desativado se não quiser usar câmera.
                </p>
              </div>
              <Switch
                checked={requirePhoto}
                disabled={photoSaving}
                onCheckedChange={handleTogglePhoto}
              />
            </div>

            <div className="space-y-2 rounded-lg border border-border/60 p-3">
              <Label>Intervalo mínimo entre batidas (minutos)</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min="0"
                  max="120"
                  value={cooldownMinutes}
                  onChange={(e) => setCooldownMinutes(parseInt(e.target.value || '0', 10))}
                  className="max-w-32"
                />
                <Button variant="outline" onClick={handleSaveCooldown} disabled={cooldownSaving}>
                  {cooldownSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Salvar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Depois de bater o ponto, os botões ficam travados por esse tempo — evita
                que o funcionário aperte Saída sem querer logo após a Entrada. Use 0 para desligar.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="card-modern">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-primary" />
              Resumo Diário no WhatsApp
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
              <div>
                <p className="font-medium text-sm">Receber resumo diário</p>
                <p className="text-xs text-muted-foreground">
                  Quantos bateram ponto, atrasos, horas extras e custo de folguistas do dia
                </p>
              </div>
              <Switch
                checked={summary.enabled}
                onCheckedChange={(v) => setSummary({ ...summary, enabled: v })}
              />
            </div>

            {summary.enabled && (
              <>
                <div className="space-y-2">
                  <Label>Horário de envio</Label>
                  <Input
                    type="time"
                    value={summary.send_time}
                    onChange={(e) => setSummary({ ...summary, send_time: e.target.value })}
                    className="max-w-[160px]"
                  />
                  <p className="text-xs text-muted-foreground">Horário de São Paulo</p>
                </div>
                <div className="space-y-2">
                  <Label>Enviar para (opcional)</Label>
                  <Input
                    value={summary.whatsapp}
                    onChange={(e) => setSummary({ ...summary, whatsapp: e.target.value })}
                    placeholder="5511999999999"
                  />
                  <p className="text-xs text-muted-foreground">
                    Se vazio, usa o telefone da empresa cadastrado acima
                  </p>
                </div>
              </>
            )}

            <Button className="w-full" onClick={handleSaveSummary} disabled={summarySaving}>
              {summarySaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Salvar Preferência
            </Button>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
