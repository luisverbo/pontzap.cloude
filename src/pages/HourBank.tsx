import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { AvatarInitial } from '@/components/ui/avatar-initial';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getImpersonatedCompanyId } from '@/components/ImpersonationBar';
import { format } from 'date-fns';
import { Clock, Plus, ChevronDown, Loader2, Scale, Trash2, Calculator } from 'lucide-react';

interface Entry {
  id: string;
  employee_id: string;
  entry_date: string;
  minutes: number;
  description: string | null;
  kind: string;
}

interface Emp {
  id: string;
  name: string;
  balance: number;
  entries: Entry[];
}

const fmt = (min: number): string => {
  const sign = min < 0 ? '-' : '+';
  const a = Math.abs(min);
  const h = Math.floor(a / 60);
  const m = a % 60;
  return `${sign}${h}h${String(m).padStart(2, '0')}`;
};

export default function HourBank() {
  const { companyStatus } = useAuth();
  const [loading, setLoading] = useState(true);
  const [emps, setEmps] = useState<Emp[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  const [addFor, setAddFor] = useState<Emp | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ direction: 'credit', hours: '', minutes: '', description: '', date: format(new Date(), 'yyyy-MM-dd') });

  // Cálculo automático
  const [cfg, setCfg] = useState<{ enabled: boolean; tolerance_minutes: number; credit_holidays: boolean; last_calculated_at: string | null }>({
    enabled: false, tolerance_minutes: 10, credit_holidays: true, last_calculated_at: null,
  });
  const [savingCfg, setSavingCfg] = useState(false);
  const [autoOpen, setAutoOpen] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [range, setRange] = useState(() => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: format(first, 'yyyy-MM-dd'), end: format(now, 'yyyy-MM-dd') };
  });

  const loadConfig = async () => {
    const companyId = await resolveCompanyId();
    if (!companyId) return;
    const { data } = await supabase
      .from('hour_bank_config')
      .select('enabled, tolerance_minutes, credit_holidays, last_calculated_at')
      .eq('company_id', companyId)
      .maybeSingle();
    if (data) setCfg(data as any);
  };

  const saveConfig = async (patch: Partial<typeof cfg>) => {
    const companyId = await resolveCompanyId();
    if (!companyId) { toast.error('Empresa não encontrada'); return; }
    const next = { ...cfg, ...patch };
    setCfg(next);
    setSavingCfg(true);
    try {
      const { error } = await supabase.from('hour_bank_config').upsert({
        company_id: companyId,
        enabled: next.enabled,
        tolerance_minutes: next.tolerance_minutes,
        credit_holidays: next.credit_holidays,
        updated_at: new Date().toISOString(),
      } as any, { onConflict: 'company_id' });
      if (error) throw error;
    } catch (e: any) {
      setCfg(cfg); // revert
      toast.error(`Erro ao salvar: ${e?.message || 'desconhecido'}`);
    } finally {
      setSavingCfg(false);
    }
  };

  const runCalculation = async () => {
    const companyId = await resolveCompanyId();
    if (!companyId) { toast.error('Empresa não encontrada'); return; }
    setCalculating(true);
    try {
      const { data, error } = await supabase.functions.invoke('hour-bank-calc', {
        body: { companyId, startDate: range.start, endDate: range.end },
      });
      if (error) {
        let info: any = {};
        try { info = await (error as any).context?.json?.(); } catch { /* ignore */ }
        throw new Error(info?.error || error.message);
      }
      if ((data as any)?.error) throw new Error((data as any).error);
      const count = (data as any)?.results?.[0]?.entries ?? 0;
      toast.success(count > 0
        ? `${count} lançamento${count !== 1 ? 's' : ''} automático${count !== 1 ? 's' : ''} gerado${count !== 1 ? 's' : ''}.`
        : 'Nenhuma diferença encontrada no período.');
      setAutoOpen(false);
      loadConfig();
      load();
    } catch (e: any) {
      console.error('Erro no cálculo:', e);
      toast.error(`Erro ao calcular: ${e?.message || 'desconhecido'}`);
    } finally {
      setCalculating(false);
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

  const load = async () => {
    setLoading(true);
    try {
      const companyId = await resolveCompanyId();
      let empQuery = supabase.from('employees').select('id, user_id').eq('is_active', true);
      if (companyId) empQuery = empQuery.eq('company_id', companyId);
      const { data: employees } = await empQuery;
      const ids = (employees || []).map((e: any) => e.id);
      const userIds = (employees || []).map((e: any) => e.user_id);

      const { data: profs } = await supabase.from('profiles').select('id, name').in('id', userIds.length ? userIds : ['']);
      const nameByUser: Record<string, string> = {};
      (profs || []).forEach((p: any) => { nameByUser[p.id] = p.name; });

      const { data: entries } = await supabase
        .from('hour_bank_entries')
        .select('id, employee_id, entry_date, minutes, description, kind')
        .in('employee_id', ids.length ? ids : [''])
        .order('entry_date', { ascending: false });

      const byEmp: Record<string, Entry[]> = {};
      (entries || []).forEach((e: any) => {
        (byEmp[e.employee_id] = byEmp[e.employee_id] || []).push(e);
      });

      const list: Emp[] = (employees || []).map((e: any) => {
        const es = byEmp[e.id] || [];
        return {
          id: e.id,
          name: nameByUser[e.user_id] || 'Funcionário',
          balance: es.reduce((s, x) => s + x.minutes, 0),
          entries: es,
        };
      }).sort((a, b) => a.name.localeCompare(b.name));

      setEmps(list);
    } catch (e) {
      console.error('Erro ao carregar banco de horas:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); loadConfig(); /* eslint-disable-next-line */ }, []);

  const openAdd = (emp: Emp) => {
    setAddFor(emp);
    setForm({ direction: 'credit', hours: '', minutes: '', description: '', date: format(new Date(), 'yyyy-MM-dd') });
  };

  const handleAdd = async () => {
    if (!addFor) return;
    const h = parseInt(form.hours || '0', 10);
    const m = parseInt(form.minutes || '0', 10);
    let total = h * 60 + m;
    if (total <= 0) { toast.error('Informe horas/minutos'); return; }
    if (form.direction === 'debit') total = -total;
    setSaving(true);
    try {
      const companyId = await resolveCompanyId();
      const { error } = await supabase.from('hour_bank_entries').insert({
        employee_id: addFor.id,
        company_id: companyId,
        entry_date: form.date,
        minutes: total,
        description: form.description || null,
        kind: 'manual',
      });
      if (error) throw error;
      toast.success('Lançamento registrado');
      setAddFor(null);
      load();
    } catch (e: any) {
      console.error(e);
      toast.error(`Erro: ${e?.message || 'desconhecido'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSettle = async (emp: Emp) => {
    if (emp.balance === 0) { toast.info('Saldo já está zerado'); return; }
    if (!confirm(`Fechar o saldo de ${emp.name} (${fmt(emp.balance)})? Um lançamento de acerto será criado zerando o saldo.`)) return;
    try {
      const companyId = await resolveCompanyId();
      const { error } = await supabase.from('hour_bank_entries').insert({
        employee_id: emp.id,
        company_id: companyId,
        entry_date: format(new Date(), 'yyyy-MM-dd'),
        minutes: -emp.balance,
        description: `Fechamento de saldo (${fmt(emp.balance)})`,
        kind: 'settlement',
      });
      if (error) throw error;
      toast.success('Saldo fechado');
      load();
    } catch (e: any) {
      toast.error(`Erro ao fechar: ${e?.message || 'desconhecido'}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remover este lançamento?')) return;
    const { error } = await supabase.from('hour_bank_entries').delete().eq('id', id);
    if (error) { toast.error('Erro ao remover'); return; }
    toast.success('Lançamento removido');
    load();
  };

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          icon={<Clock className="h-6 w-6" />}
          title="Banco de Horas"
          description="Saldo de horas extras e débitos por funcionário"
          actions={
            <Button variant="outline" onClick={() => setAutoOpen(true)}>
              <Calculator className="h-4 w-4 mr-2" />
              Cálculo automático
            </Button>
          }
        />

        <Card className="card-modern">
          <CardContent className="p-4 flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <p className="font-medium text-sm flex items-center gap-2">
                <Calculator className="h-4 w-4 text-primary" />
                Cálculo automático diário
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 max-w-lg">
                Compara os pontos batidos com a jornada prevista e lança a diferença sozinho,
                todo dia de madrugada. Só conta dias com entrada e saída registradas.
                {cfg.last_calculated_at && (
                  <> Último cálculo: {format(new Date(cfg.last_calculated_at), 'dd/MM/yyyy HH:mm')}.</>
                )}
              </p>
            </div>
            <Switch
              checked={cfg.enabled}
              disabled={savingCfg}
              onCheckedChange={(v) => saveConfig({ enabled: v })}
            />
          </CardContent>
        </Card>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        ) : emps.length === 0 ? (
          <Card><CardContent className="p-12 text-center text-muted-foreground">Nenhum funcionário</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {emps.map((emp) => (
              <Card key={emp.id} className="card-modern overflow-hidden">
                <Collapsible open={openId === emp.id} onOpenChange={(o) => setOpenId(o ? emp.id : null)}>
                  <CardContent className="p-0">
                    <div className="flex items-center justify-between p-4">
                      <CollapsibleTrigger className="flex items-center gap-3 flex-1 text-left">
                        <AvatarInitial name={emp.name} size="md" />
                        <div>
                          <p className="font-medium">{emp.name}</p>
                          <p className="text-xs text-muted-foreground">{emp.entries.length} lançamento{emp.entries.length !== 1 ? 's' : ''}</p>
                        </div>
                      </CollapsibleTrigger>
                      <div className="flex items-center gap-3">
                        <span className={`font-bold tabular-nums ${emp.balance > 0 ? 'text-success' : emp.balance < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                          {emp.balance === 0 ? '0h00' : fmt(emp.balance)}
                        </span>
                        <Button variant="outline" size="icon" onClick={() => openAdd(emp)} title="Adicionar lançamento">
                          <Plus className="h-4 w-4" />
                        </Button>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <ChevronDown className={`h-4 w-4 transition-transform ${openId === emp.id ? 'rotate-180' : ''}`} />
                          </Button>
                        </CollapsibleTrigger>
                      </div>
                    </div>
                    <CollapsibleContent>
                      <div className="px-4 pb-4 space-y-1.5 border-t border-border/50 pt-3">
                        {emp.entries.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-2">Sem lançamentos</p>
                        ) : (
                          emp.entries.map((e) => (
                            <div key={e.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border/30 last:border-0">
                              <div>
                                <span className="text-muted-foreground">{format(new Date(e.entry_date + 'T12:00:00'), 'dd/MM/yyyy')}</span>
                                {e.description && <span className="text-foreground/80"> — {e.description}</span>}
                                {e.kind === 'settlement' && <span className="text-[10px] uppercase ml-2 text-muted-foreground">acerto</span>}
                                {e.kind === 'auto' && <span className="text-[10px] uppercase ml-2 text-primary">auto</span>}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`font-medium tabular-nums ${e.minutes >= 0 ? 'text-success' : 'text-destructive'}`}>{fmt(e.minutes)}</span>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(e.id)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          ))
                        )}
                        {emp.balance !== 0 && (
                          <div className="pt-2">
                            <Button variant="outline" size="sm" className="w-full" onClick={() => handleSettle(emp)}>
                              <Scale className="h-4 w-4 mr-2" />
                              Fechar saldo ({fmt(emp.balance)})
                            </Button>
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </CardContent>
                </Collapsible>
              </Card>
            ))}
          </div>
        )}

        {/* Add entry dialog */}
        <Dialog open={!!addFor} onOpenChange={(o) => { if (!o) setAddFor(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Lançamento — {addFor?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={form.direction} onValueChange={(v) => setForm({ ...form, direction: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="credit">Crédito (horas extras)</SelectItem>
                    <SelectItem value="debit">Débito (falta/desconto)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Horas</Label>
                  <Input type="number" min="0" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} placeholder="0" />
                </div>
                <div className="space-y-2">
                  <Label>Minutos</Label>
                  <Input type="number" min="0" max="59" value={form.minutes} onChange={(e) => setForm({ ...form, minutes: e.target.value })} placeholder="0" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Data</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Descrição (opcional)</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ex: hora extra sábado" />
              </div>
              <Button className="w-full" onClick={handleAdd} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Lançar
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Cálculo automático */}
        <Dialog open={autoOpen} onOpenChange={setAutoOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5 text-primary" />
                Calcular banco de horas
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Compara os pontos batidos com a jornada prevista e lança a diferença.
                Pode rodar quantas vezes quiser: os lançamentos automáticos do período
                são refeitos, e os manuais nunca são alterados.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>De</Label>
                  <Input type="date" value={range.start} onChange={(e) => setRange({ ...range, start: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Até</Label>
                  <Input type="date" value={range.end} onChange={(e) => setRange({ ...range, end: e.target.value })} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Tolerância diária (minutos)</Label>
                <Input
                  type="number"
                  min="0"
                  max="120"
                  value={cfg.tolerance_minutes}
                  onChange={(e) => setCfg({ ...cfg, tolerance_minutes: parseInt(e.target.value || '0', 10) })}
                  onBlur={() => saveConfig({ tolerance_minutes: cfg.tolerance_minutes })}
                />
                <p className="text-xs text-muted-foreground">
                  Diferenças menores que isso no dia são ignoradas.
                </p>
              </div>

              <div className="flex items-start justify-between gap-3 rounded-lg border border-border/60 p-3">
                <div className="min-w-0">
                  <p className="font-medium text-sm">Feriado trabalhado vira crédito</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Todo o tempo trabalhado em feriado entra como hora extra.
                  </p>
                </div>
                <Switch
                  checked={cfg.credit_holidays}
                  onCheckedChange={(v) => saveConfig({ credit_holidays: v })}
                />
              </div>

              <Button className="w-full" onClick={runCalculation} disabled={calculating}>
                {calculating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Calculator className="h-4 w-4 mr-2" />}
                Calcular período
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
