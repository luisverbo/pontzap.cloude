import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getImpersonatedCompanyId } from '@/components/ImpersonationBar';
import { format } from 'date-fns';
import { Clock, Plus, ChevronDown, Loader2, Scale, Trash2 } from 'lucide-react';

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

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

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
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-2">
            <Clock className="h-7 w-7 text-primary" />
            Banco de Horas
          </h1>
          <p className="text-muted-foreground mt-1">Saldo de horas extras e débitos por funcionário</p>
        </div>

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
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-semibold text-primary shrink-0">
                          {emp.name.charAt(0).toUpperCase()}
                        </div>
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
      </div>
    </MainLayout>
  );
}
