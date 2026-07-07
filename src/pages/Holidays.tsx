import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getImpersonatedCompanyId } from '@/components/ImpersonationBar';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Plus, CalendarDays, Trash2, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';

interface Holiday {
  id: string;
  date: string;
  name: string;
}

export default function Holidays() {
  const { companyStatus } = useAuth();
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ date: '', name: '' });

  const resolveCompanyId = async (): Promise<string | null> => {
    const imp = getImpersonatedCompanyId();
    if (imp) return imp;
    if (companyStatus?.id) return companyStatus.id;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: emp } = await supabase.from('employees').select('company_id').eq('user_id', user.id).maybeSingle();
    if (emp?.company_id) return emp.company_id;
    const { data: comp } = await supabase.from('companies').select('id').eq('admin_user_id', user.id).maybeSingle();
    return comp?.id ?? null;
  };

  const fetchHolidays = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('holidays')
        .select('id, date, name')
        .order('date', { ascending: true });
      if (error) throw error;
      setHolidays((data as Holiday[]) || []);
    } catch (e) {
      console.error('Erro ao carregar feriados:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchHolidays(); }, []);

  const handleAdd = async () => {
    if (!form.date || !form.name.trim()) {
      toast.error('Preencha data e nome');
      return;
    }
    setSaving(true);
    try {
      const companyId = await resolveCompanyId();
      const { error } = await supabase.from('holidays').insert({
        company_id: companyId,
        date: form.date,
        name: form.name.trim(),
      });
      if (error) {
        if (error.code === '23505') {
          toast.error('Já existe um feriado nesta data');
        } else {
          throw error;
        }
      } else {
        toast.success('Feriado adicionado');
        setDialogOpen(false);
        setForm({ date: '', name: '' });
        fetchHolidays();
      }
    } catch (e: any) {
      console.error('Erro ao adicionar feriado:', e);
      toast.error(`Erro: ${e?.message || 'desconhecido'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remover este feriado?')) return;
    const { error } = await supabase.from('holidays').delete().eq('id', id);
    if (error) {
      toast.error('Erro ao remover');
    } else {
      toast.success('Feriado removido');
      fetchHolidays();
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          icon={<CalendarDays className="h-6 w-6" />}
          title="Feriados"
          description="Cadastre feriados para o cálculo correto de jornada e horas extras"
          actions={
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="glow">
                  <Plus className="h-4 w-4 mr-2" />
                  Novo Feriado
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Adicionar Feriado</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Data</Label>
                  <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input placeholder="Ex: Natal" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                  <Button className="w-full" onClick={handleAdd} disabled={saving}>
                    {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Adicionar
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          }
        />

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        ) : holidays.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <CalendarDays className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nenhum feriado cadastrado</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {holidays.map((h) => (
              <Card key={h.id} className="card-modern">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <CalendarDays className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{h.name}</p>
                      <p className="text-sm text-muted-foreground capitalize">
                        {format(new Date(h.date + 'T12:00:00'), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(h.id)} className="text-destructive hover:text-destructive hover:bg-destructive/10">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
