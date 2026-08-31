import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/layout/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ScrollText, User } from 'lucide-react';

interface LogRow {
  id: string;
  user_id: string | null;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  table_name: string;
  details: any;
  created_at: string;
}

const TABLE_LABELS: Record<string, string> = {
  clock_records: 'Ponto',
  hour_bank_entries: 'Banco de Horas',
  day_offs: 'Folgas',
};

const ACTION_LABELS: Record<string, { label: string; variant: 'success' | 'warning' | 'destructive' }> = {
  INSERT: { label: 'Criou', variant: 'success' },
  UPDATE: { label: 'Alterou', variant: 'warning' },
  DELETE: { label: 'Excluiu', variant: 'destructive' },
};

/** Human summary of what changed, from the before/after snapshots. */
function summarize(row: LogRow, employeeNames: Record<string, string>): string {
  const d = row.details || {};
  const snap = d.depois || d.antes || {};
  const parts: string[] = [];
  const emp = snap.employee_id && employeeNames[snap.employee_id];
  if (emp) parts.push(emp);

  if (row.table_name === 'clock_records') {
    const tipos: Record<string, string> = { entry: 'Entrada', exit: 'Saída', lunch_out: 'Saída almoço', lunch_in: 'Volta almoço' };
    if (snap.type) parts.push(tipos[snap.type] || snap.type);
    if (snap.timestamp) parts.push(format(new Date(snap.timestamp), 'dd/MM HH:mm'));
    if (snap.is_manual) parts.push('(manual)');
  } else if (row.table_name === 'hour_bank_entries') {
    if (typeof snap.minutes === 'number') {
      const a = Math.abs(snap.minutes);
      parts.push(`${snap.minutes < 0 ? '−' : '+'}${Math.floor(a / 60)}h${String(a % 60).padStart(2, '0')}`);
    }
    if (snap.description) parts.push(snap.description);
  } else if (row.table_name === 'day_offs') {
    if (snap.date) parts.push(format(new Date(`${snap.date}T12:00:00`), 'dd/MM/yyyy'));
    const kinds: Record<string, string> = { sunday: 'Domingo de folga', extra: 'Folga extra', hour_bank: 'Folga banco de horas' };
    if (snap.kind) parts.push(kinds[snap.kind] || snap.kind);
  }
  return parts.join(' · ') || '—';
}

export default function AuditLog() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [employeeNames, setEmployeeNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [tableFilter, setTableFilter] = useState('all');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        let q = supabase
          .from('admin_audit_log')
          .select('id, user_id, action, table_name, details, created_at')
          .order('created_at', { ascending: false })
          .limit(200);
        if (tableFilter !== 'all') q = q.eq('table_name', tableFilter);
        const { data, error } = await q;
        if (error) throw error;
        const list = (data || []) as LogRow[];
        setRows(list);

        // Resolve actor names + employee names referenced in snapshots
        const userIds = [...new Set(list.map((r) => r.user_id).filter(Boolean))] as string[];
        const empIds = [...new Set(list.map((r) => {
          const s = r.details?.depois || r.details?.antes || {};
          return s.employee_id as string | undefined;
        }).filter(Boolean))] as string[];

        const [profRes, empRes] = await Promise.all([
          userIds.length ? supabase.from('profiles').select('id, name').in('id', userIds) : Promise.resolve({ data: [] as any[] }),
          empIds.length ? supabase.from('employees').select('id, user_id').in('id', empIds) : Promise.resolve({ data: [] as any[] }),
        ]);
        const profMap = Object.fromEntries((profRes.data || []).map((p: any) => [p.id, p.name]));
        setNames(profMap);

        const empUserIds = [...new Set((empRes.data || []).map((e: any) => e.user_id).filter(Boolean))];
        const { data: empProfs } = empUserIds.length
          ? await supabase.from('profiles').select('id, name').in('id', empUserIds)
          : { data: [] as any[] };
        const empProfMap = Object.fromEntries((empProfs || []).map((p: any) => [p.id, p.name]));
        setEmployeeNames(Object.fromEntries(
          (empRes.data || []).map((e: any) => [e.id, empProfMap[e.user_id] || 'Funcionário'])
        ));
      } catch (e) {
        console.error('Erro ao carregar trilha de auditoria:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [tableFilter]);

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto space-y-5 animate-fade-in pb-6">
        <PageHeader
          icon={<ScrollText className="h-6 w-6" />}
          title="Trilha de Auditoria"
          description="Quem alterou ponto, banco de horas e folgas — registrado direto no banco"
        />

        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground shrink-0">Filtrar:</Label>
          <Select value={tableFilter} onValueChange={setTableFilter}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tudo</SelectItem>
              <SelectItem value="clock_records">Ponto</SelectItem>
              <SelectItem value="hour_bank_entries">Banco de Horas</SelectItem>
              <SelectItem value="day_offs">Folgas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
          </div>
        ) : rows.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-muted flex items-center justify-center">
                <ScrollText className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="font-medium">Nenhum registro ainda</p>
              <p className="text-sm text-muted-foreground mt-1">
                A trilha começa a gravar a partir de agora, a cada alteração manual.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="card-modern">
            <CardContent className="p-0 divide-y divide-border/60">
              {rows.map((r) => {
                const act = ACTION_LABELS[r.action];
                return (
                  <div key={r.id} className="px-4 py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={act.variant}>{act.label}</Badge>
                        <span className="text-sm font-medium">{TABLE_LABELS[r.table_name] || r.table_name}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 truncate">
                        {summarize(r, employeeNames)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                        <User className="h-3 w-3" />
                        {r.user_id ? (names[r.user_id] || 'Usuário') : 'Sistema'}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground font-mono tabular-nums shrink-0">
                      {format(new Date(r.created_at), 'dd/MM/yy HH:mm')}
                    </span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}
