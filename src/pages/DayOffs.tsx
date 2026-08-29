import { useState, useEffect, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/layout/PageHeader';
import { AvatarInitial } from '@/components/ui/avatar-initial';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getImpersonatedCompanyId } from '@/components/ImpersonationBar';
import { toast } from 'sonner';
import { format, addMonths, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarOff, Plus, Trash2, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { DAY_OFF_KINDS, type DayOff, type DayOffKind } from '@/hooks/useDayOffs';
import { DAYS_OF_WEEK } from '@/types';

interface Emp {
  id: string;
  name: string;
  weeklyOff: number[];
}

export default function DayOffs() {
  const { companyStatus } = useAuth();
  const [loading, setLoading] = useState(true);
  const [emps, setEmps] = useState<Emp[]>([]);
  const [dayOffs, setDayOffs] = useState<DayOff[]>([]);
  const [month, setMonth] = useState(() => startOfMonth(new Date()));

  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    employee_id: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    kind: 'sunday' as DayOffKind,
    notes: '',
    discountHours: '',
  });

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

      let empQuery = supabase.from('employees').select('id, user_id, type').eq('is_active', true);
      if (companyId) empQuery = empQuery.eq('company_id', companyId);
      const { data: employees } = await empQuery;

      const staff = (employees || []).filter((e: any) => e.type !== 'substitute');
      const userIds = staff.map((e: any) => e.user_id);
      const ids = staff.map((e: any) => e.id);

      const { data: profs } = await supabase
        .from('profiles').select('id, name').in('id', userIds.length ? userIds : ['']);
      const nameByUser: Record<string, string> = {};
      (profs || []).forEach((p: any) => { nameByUser[p.id] = p.name; });

      // Folga semanal fixa de cada um (works = false na escala fixa)
      const { data: schedules } = await supabase
        .from('fixed_schedules')
        .select('employee_id, day_of_week, works')
        .in('employee_id', ids.length ? ids : ['']);
      const weeklyByEmp: Record<string, number[]> = {};
      (schedules || []).forEach((s: any) => {
        if (s.works === false) (weeklyByEmp[s.employee_id] = weeklyByEmp[s.employee_id] || []).push(s.day_of_week);
      });

      setEmps(staff.map((e: any) => ({
        id: e.id,
        name: nameByUser[e.user_id] || 'Funcionário',
        weeklyOff: weeklyByEmp[e.id] || [],
      })).sort((a, b) => a.name.localeCompare(b.name)));

      const { data: offs } = await supabase
        .from('day_offs')
        .select('*')
        .gte('date', format(startOfMonth(month), 'yyyy-MM-dd'))
        .lte('date', format(endOfMonth(month), 'yyyy-MM-dd'))
        .order('date');
      setDayOffs((offs || []) as unknown as DayOff[]);
    } catch (e) {
      console.error('Erro ao carregar folgas:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [month]);

  const byEmployee = useMemo(() => {
    const map: Record<string, DayOff[]> = {};
    dayOffs.forEach((d) => { (map[d.employee_id] = map[d.employee_id] || []).push(d); });
    return map;
  }, [dayOffs]);

  const openAdd = (employeeId?: string) => {
    setForm({
      employee_id: employeeId || '',
      date: format(month, 'yyyy-MM-dd'),
      kind: 'sunday',
      notes: '',
      discountHours: '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.employee_id) { toast.error('Escolha o funcionário.'); return; }
    if (!form.date) { toast.error('Escolha a data.'); return; }

    setSaving(true);
    try {
      const companyId = await resolveCompanyId();
      let hourBankEntryId: string | null = null;

      // Folga do banco de horas: lança o débito junto, para o saldo bater
      if (form.kind === 'hour_bank' && form.discountHours) {
        const hours = parseFloat(form.discountHours.replace(',', '.'));
        if (!Number.isNaN(hours) && hours > 0) {
          const { data: entry, error: entryErr } = await supabase
            .from('hour_bank_entries')
            .insert({
              employee_id: form.employee_id,
              company_id: companyId,
              entry_date: form.date,
              minutes: -Math.round(hours * 60),
              description: `Folga compensada em ${format(new Date(`${form.date}T12:00:00`), 'dd/MM/yyyy')}`,
              kind: 'manual',
            } as any)
            .select('id')
            .single();
          if (entryErr) throw entryErr;
          hourBankEntryId = entry.id;
        }
      }

      const { error } = await supabase.from('day_offs').insert({
        employee_id: form.employee_id,
        company_id: companyId,
        date: form.date,
        kind: form.kind,
        notes: form.notes.trim() || null,
        hour_bank_entry_id: hourBankEntryId,
      } as any);
      if (error) throw error;

      toast.success('Folga escalada!');
      setDialogOpen(false);
      load();
    } catch (e: any) {
      console.error('Erro ao salvar folga:', e);
      const msg = String(e?.message || '');
      toast.error(
        msg.includes('duplicate') || msg.includes('unique')
          ? 'Este funcionário já tem folga escalada nesta data.'
          : `Erro ao salvar: ${e?.message || 'desconhecido'}`
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (off: DayOff) => {
    if (!confirm('Remover esta folga?')) return;
    try {
      // Desfaz também o débito de banco de horas criado junto
      if (off.hour_bank_entry_id) {
        await supabase.from('hour_bank_entries').delete().eq('id', off.hour_bank_entry_id);
      }
      const { error } = await supabase.from('day_offs').delete().eq('id', off.id);
      if (error) throw error;
      toast.success('Folga removida.');
      load();
    } catch (e: any) {
      toast.error(`Erro ao remover: ${e?.message || 'desconhecido'}`);
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          icon={<CalendarOff className="h-6 w-6" />}
          title="Escala de Folgas"
          description="Domingos de folga, folgas extras e compensação de banco de horas"
          actions={
            <Button onClick={() => openAdd()}>
              <Plus className="h-4 w-4 mr-2" />
              Escalar folga
            </Button>
          }
        />

        {/* Navegação de mês */}
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="icon" onClick={() => setMonth(addMonths(month, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-medium capitalize min-w-44 text-center">
            {format(month, "MMMM 'de' yyyy", { locale: ptBR })}
          </span>
          <Button variant="outline" size="icon" onClick={() => setMonth(addMonths(month, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
          </div>
        ) : emps.length === 0 ? (
          <Card><CardContent className="p-12 text-center text-muted-foreground">Nenhum funcionário fixo cadastrado</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {emps.map((emp) => {
              const offs = byEmployee[emp.id] || [];
              return (
                <Card key={emp.id} className="card-modern">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <AvatarInitial name={emp.name} size="md" />
                        <div className="min-w-0">
                          <p className="font-medium truncate">{emp.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {emp.weeklyOff.length > 0
                              ? `Folga fixa: ${emp.weeklyOff.map((d) => DAYS_OF_WEEK[d].label).join(', ')}`
                              : 'Sem folga fixa na escala'}
                          </p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => openAdd(emp.id)}>
                        <Plus className="h-4 w-4 mr-1.5" />
                        Folga
                      </Button>
                    </div>

                    {offs.length === 0 ? (
                      <p className="text-xs text-muted-foreground border-t border-border/60 pt-3">
                        Nenhuma folga escalada neste mês.
                      </p>
                    ) : (
                      <div className="border-t border-border/60 pt-3 space-y-2">
                        {offs.map((off) => {
                          const k = DAY_OFF_KINDS[off.kind];
                          return (
                            <div key={off.id} className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className="font-mono tabular-nums text-sm">
                                  {format(new Date(`${off.date}T12:00:00`), 'dd/MM')}
                                </span>
                                <span className="text-xs text-muted-foreground capitalize">
                                  {format(new Date(`${off.date}T12:00:00`), 'EEEE', { locale: ptBR })}
                                </span>
                                <Badge variant={k.variant}>{k.short}</Badge>
                                {off.notes && (
                                  <span className="text-xs text-muted-foreground truncate">{off.notes}</span>
                                )}
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive shrink-0"
                                onClick={() => handleDelete(off)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Escalar folga */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Escalar folga</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Funcionário *</Label>
              <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {emps.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Data *</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              {form.date && (
                <p className="text-xs text-muted-foreground capitalize">
                  {format(new Date(`${form.date}T12:00:00`), "EEEE, dd 'de' MMMM", { locale: ptBR })}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as DayOffKind })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(DAY_OFF_KINDS) as DayOffKind[]).map((k) => (
                    <SelectItem key={k} value={k}>{DAY_OFF_KINDS[k].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {form.kind === 'hour_bank' && (
              <div className="space-y-2">
                <Label>Horas a descontar do banco</Label>
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  value={form.discountHours}
                  onChange={(e) => setForm({ ...form, discountHours: e.target.value })}
                  placeholder="Ex: 8"
                />
                <p className="text-xs text-muted-foreground">
                  Lança o débito no banco de horas junto com a folga. Deixe vazio para não descontar.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label>Observação (opcional)</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Ex: trocou com o Lucas"
              />
            </div>

            <Button className="w-full" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CalendarOff className="h-4 w-4 mr-2" />}
              Escalar folga
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
