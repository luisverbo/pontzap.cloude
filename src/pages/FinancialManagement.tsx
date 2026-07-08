import { useState, useEffect, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getImpersonatedCompanyId } from '@/components/ImpersonationBar';
import { toast } from 'sonner';
import { format, startOfMonth, endOfMonth, parseISO, subMonths, isWithinInterval, startOfYear, endOfYear } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Calendar,
  Plus,
  Edit,
  Trash2,
  Check,
  Clock,
  FileText,
  Loader2,
  Filter,
  BarChart3,
  Download
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface FinancialEntry {
  id: string;
  description: string;
  category: string;
  amount: number;
  entry_type: 'income' | 'expense';
  is_recurring: boolean;
  recurrence_type?: string;
  recurrence_day?: number;
  due_date?: string;
  paid_date?: string;
  status: 'pending' | 'paid' | 'overdue';
  client_name?: string;
  notes?: string;
  notification_days?: number;
  notification_sent?: boolean;
  created_at: string;
}

const INCOME_CATEGORIES = [
  'Contrato Mensal',
  'Serviço Avulso',
  'Taxa Extra',
  'Multa',
  'Outros'
];

const EXPENSE_CATEGORIES = [
  'Salários',
  'Hora Extra',
  'Benefícios',
  'Equipamentos',
  'Manutenção',
  'Transporte',
  'Material',
  'Impostos',
  'Outros'
];

// Distinct colors for income (greens/blues)
const INCOME_CHART_COLORS = ['hsl(142, 76%, 36%)', 'hsl(160, 84%, 39%)', 'hsl(173, 80%, 40%)', 'hsl(199, 89%, 48%)', 'hsl(221, 83%, 53%)', 'hsl(250, 76%, 60%)'];
// Distinct colors for expenses (reds/oranges)
const EXPENSE_CHART_COLORS = ['hsl(0, 84%, 60%)', 'hsl(15, 90%, 55%)', 'hsl(25, 95%, 53%)', 'hsl(38, 92%, 50%)', 'hsl(45, 93%, 47%)', 'hsl(316, 72%, 51%)'];

type FilterPeriod = 'month' | 'quarter' | 'year' | 'all' | 'custom' | 'future';

export default function FinancialManagement() {
  const { companyStatus } = useAuth();
  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<FinancialEntry | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  
  // Filters
  const [filterPeriod, setFilterPeriod] = useState<FilterPeriod>('month');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterMonth, setFilterMonth] = useState<string>('');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  
  const [form, setForm] = useState({
    description: '',
    category: '',
    amount: '',
    entry_type: 'income' as 'income' | 'expense',
    is_recurring: false,
    recurrence_type: 'monthly',
    recurrence_day: 1,
    due_date: '',
    client_name: '',
    notes: '',
    notification_days: 1,
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

  useEffect(() => {
    fetchEntries();
  }, []);

  const fetchEntries = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('financial_entries')
        .select('*')
        .order('due_date', { ascending: false });

      if (error) throw error;
      setEntries((data || []) as FinancialEntry[]);
    } catch (error) {
      console.error('Error fetching entries:', error);
      toast.error('Erro ao carregar dados financeiros');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!form.description || !form.category || !form.amount) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    setSaving(true);
    try {
      const baseData = {
        description: form.description,
        category: form.category,
        amount: parseFloat(form.amount),
        entry_type: form.entry_type,
        is_recurring: form.is_recurring,
        recurrence_type: form.is_recurring ? form.recurrence_type : null,
        recurrence_day: form.is_recurring ? form.recurrence_day : null,
        due_date: form.due_date || null,
        client_name: form.client_name || null,
        notes: form.notes || null,
        notification_days: form.due_date ? form.notification_days : null,
      };

      if (editingEntry) {
        // When editing, preserve the existing status and paid_date
        // Only update if they were not already set
        const { error } = await supabase
          .from('financial_entries')
          .update(baseData)
          .eq('id', editingEntry.id);
        if (error) throw error;
        toast.success('Entrada atualizada com sucesso');
      } else {
        // When creating new entry, set initial status. Stamp company_id so the
        // RLS company check passes (the trigger also fills it server-side as a fallback).
        const companyId = await resolveCompanyId();
        const { error } = await supabase
          .from('financial_entries')
          .insert({
            ...baseData,
            company_id: companyId,
            notification_sent: false,
            status: 'pending',
          });
        if (error) throw error;
        toast.success('Entrada criada com sucesso');
      }

      setDialogOpen(false);
      resetForm();
      fetchEntries();
    } catch (error: any) {
      console.error('Error saving entry:', error);
      toast.error(error?.message ? `Erro ao salvar: ${error.message}` : 'Erro ao salvar entrada');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir esta entrada?')) return;
    
    try {
      const { error } = await supabase
        .from('financial_entries')
        .delete()
        .eq('id', id);
      if (error) throw error;
      toast.success('Entrada excluída');
      fetchEntries();
    } catch (error) {
      toast.error('Erro ao excluir');
    }
  };

  const handleMarkAsPaid = async (entry: FinancialEntry) => {
    try {
      const { error } = await supabase
        .from('financial_entries')
        .update({ 
          status: 'paid', 
          paid_date: new Date().toISOString().split('T')[0] 
        })
        .eq('id', entry.id);
      if (error) throw error;
      toast.success('Marcado como recebido/pago');
      fetchEntries();
    } catch (error) {
      toast.error('Erro ao atualizar');
    }
  };

  const resetForm = () => {
    setForm({
      description: '',
      category: '',
      amount: '',
      entry_type: 'income',
      is_recurring: false,
      recurrence_type: 'monthly',
      recurrence_day: 1,
      due_date: '',
      client_name: '',
      notes: '',
      notification_days: 1,
    });
    setEditingEntry(null);
  };

  const openEditDialog = (entry: FinancialEntry) => {
    setEditingEntry(entry);
    setForm({
      description: entry.description,
      category: entry.category,
      amount: entry.amount.toString(),
      entry_type: entry.entry_type,
      is_recurring: entry.is_recurring,
      recurrence_type: entry.recurrence_type || 'monthly',
      recurrence_day: entry.recurrence_day || 1,
      due_date: entry.due_date || '',
      client_name: entry.client_name || '',
      notes: entry.notes || '',
      notification_days: entry.notification_days || 1,
    });
    setDialogOpen(true);
  };

  // Filter entries based on selected filters
  const now = new Date();
  
  const getFilterDateRange = () => {
    switch (filterPeriod) {
      case 'month':
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case 'quarter':
        return { start: startOfMonth(subMonths(now, 2)), end: endOfMonth(now) };
      case 'year':
        return { start: startOfYear(now), end: endOfYear(now) };
      case 'custom':
        if (customStartDate && customEndDate) {
          return { start: parseISO(customStartDate), end: parseISO(customEndDate) };
        }
        return null;
      case 'future':
        return { start: now, end: new Date(2099, 11, 31) };
      default:
        return null;
    }
  };
  
  // Get specific month filter
  const getMonthFilter = () => {
    if (filterMonth && filterMonth !== 'all') {
      const [year, month] = filterMonth.split('-').map(Number);
      const monthDate = new Date(year, month - 1, 1);
      return { start: startOfMonth(monthDate), end: endOfMonth(monthDate) };
    }
    return null;
  };

  const filteredEntries = useMemo(() => {
    let filtered = [...entries];
    
    // Filter by specific month first (takes priority)
    const monthRange = getMonthFilter();
    if (monthRange) {
      filtered = filtered.filter(e => {
        const entryDate = e.due_date ? parseISO(e.due_date) : parseISO(e.created_at);
        return isWithinInterval(entryDate, monthRange);
      });
    } else {
      // Filter by period
      const dateRange = getFilterDateRange();
      if (dateRange) {
        filtered = filtered.filter(e => {
          const entryDate = e.due_date ? parseISO(e.due_date) : parseISO(e.created_at);
          return isWithinInterval(entryDate, dateRange);
        });
      }
    }
    
    // Filter by category
    if (filterCategory !== 'all') {
      filtered = filtered.filter(e => e.category === filterCategory);
    }
    
    // Filter by status
    if (filterStatus !== 'all') {
      filtered = filtered.filter(e => e.status === filterStatus);
    }
    
    return filtered;
  }, [entries, filterPeriod, filterCategory, filterStatus, filterMonth, customStartDate, customEndDate]);

  // Calculate totals from filtered entries
  const totalIncome = filteredEntries
    .filter(e => e.entry_type === 'income' && e.status === 'paid')
    .reduce((sum, e) => sum + e.amount, 0);

  const totalExpenses = filteredEntries
    .filter(e => e.entry_type === 'expense' && e.status === 'paid')
    .reduce((sum, e) => sum + e.amount, 0);

  const pendingIncome = filteredEntries
    .filter(e => e.entry_type === 'income' && e.status === 'pending')
    .reduce((sum, e) => sum + e.amount, 0);

  const pendingExpenses = filteredEntries
    .filter(e => e.entry_type === 'expense' && e.status === 'pending')
    .reduce((sum, e) => sum + e.amount, 0);

  const balance = totalIncome - totalExpenses;

  const incomeEntries = filteredEntries.filter(e => e.entry_type === 'income');
  const expenseEntries = filteredEntries.filter(e => e.entry_type === 'expense');

  // Chart data - Category breakdown
  const incomeByCategoryData = useMemo(() => {
    const categoryTotals: Record<string, number> = {};
    incomeEntries.forEach(e => {
      categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount;
    });
    return Object.entries(categoryTotals).map(([name, value]) => ({ name, value }));
  }, [incomeEntries]);

  const expenseByCategoryData = useMemo(() => {
    const categoryTotals: Record<string, number> = {};
    expenseEntries.forEach(e => {
      categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount;
    });
    return Object.entries(categoryTotals).map(([name, value]) => ({ name, value }));
  }, [expenseEntries]);

  // Monthly comparison chart data
  const monthlyComparisonData = useMemo(() => {
    const months: Record<string, { month: string; income: number; expenses: number }> = {};
    
    entries.forEach(e => {
      const date = e.due_date ? parseISO(e.due_date) : parseISO(e.created_at);
      const monthKey = format(date, 'MMM/yy', { locale: ptBR });
      
      if (!months[monthKey]) {
        months[monthKey] = { month: monthKey, income: 0, expenses: 0 };
      }
      
      if (e.entry_type === 'income') {
        months[monthKey].income += e.amount;
      } else {
        months[monthKey].expenses += e.amount;
      }
    });
    
    return Object.values(months).slice(-6); // Last 6 months
  }, [entries]);

  // All categories for filter
  const allCategories = useMemo(() => {
    const cats = new Set<string>();
    entries.forEach(e => cats.add(e.category));
    return Array.from(cats);
  }, [entries]);

  const exportToPDF = async () => {
    setExporting(true);
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      
      // Header
      doc.setFillColor(13, 148, 136);
      doc.rect(0, 0, pageWidth, 35, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.text('PONTZAP', 20, 22);
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text('Relatório Financeiro', pageWidth - 20, 18, { align: 'right' });
      doc.text(`Gerado em ${format(new Date(), 'dd/MM/yyyy')}`, pageWidth - 20, 28, { align: 'right' });

      let yPos = 50;

      // Summary
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('Resumo Financeiro', 20, yPos);
      yPos += 12;

      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      
      const summaryItems = [
        ['Total Recebido:', `R$ ${totalIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
        ['A Receber:', `R$ ${pendingIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
        ['Total Despesas:', `R$ ${totalExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
        ['Despesas Pendentes:', `R$ ${pendingExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
        ['Saldo:', `R$ ${balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
      ];

      summaryItems.forEach(([label, value]) => {
        doc.text(label, 25, yPos);
        doc.setFont('helvetica', 'bold');
        doc.text(value, 100, yPos);
        doc.setFont('helvetica', 'normal');
        yPos += 8;
      });

      yPos += 15;

      // Income section
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Entradas', 20, yPos);
      yPos += 10;

      doc.setFontSize(9);
      doc.setFillColor(240, 240, 240);
      doc.rect(15, yPos - 5, pageWidth - 30, 8, 'F');
      doc.text('Descrição', 20, yPos);
      doc.text('Categoria', 80, yPos);
      doc.text('Valor', 130, yPos);
      doc.text('Status', 165, yPos);
      yPos += 8;

      doc.setFont('helvetica', 'normal');
      incomeEntries.slice(0, 15).forEach((entry, index) => {
        if (index % 2 === 0) {
          doc.setFillColor(248, 248, 248);
          doc.rect(15, yPos - 4, pageWidth - 30, 7, 'F');
        }
        doc.text(entry.description.substring(0, 30), 20, yPos);
        doc.text(entry.category.substring(0, 20), 80, yPos);
        doc.text(`R$ ${entry.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 130, yPos);
        doc.text(entry.status === 'paid' ? 'Recebido' : 'Pendente', 165, yPos);
        yPos += 7;
      });

      yPos += 15;

      // Expense section
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Despesas', 20, yPos);
      yPos += 10;

      doc.setFontSize(9);
      doc.setFillColor(240, 240, 240);
      doc.rect(15, yPos - 5, pageWidth - 30, 8, 'F');
      doc.text('Descrição', 20, yPos);
      doc.text('Categoria', 80, yPos);
      doc.text('Valor', 130, yPos);
      doc.text('Status', 165, yPos);
      yPos += 8;

      doc.setFont('helvetica', 'normal');
      expenseEntries.slice(0, 15).forEach((entry, index) => {
        if (index % 2 === 0) {
          doc.setFillColor(248, 248, 248);
          doc.rect(15, yPos - 4, pageWidth - 30, 7, 'F');
        }
        doc.text(entry.description.substring(0, 30), 20, yPos);
        doc.text(entry.category.substring(0, 20), 80, yPos);
        doc.text(`R$ ${entry.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 130, yPos);
        doc.text(entry.status === 'paid' ? 'Pago' : 'Pendente', 165, yPos);
        yPos += 7;
      });

      // Footer
      doc.setFontSize(8);
      doc.setTextColor(128, 128, 128);
      doc.text(`PONTZAP - Relatório Financeiro - ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, pageWidth / 2, 290, { align: 'center' });

      const fileName = `relatorio-financeiro-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      doc.save(fileName);
      toast.success('Relatório exportado com sucesso!');
    } catch (error) {
      console.error('Error exporting PDF:', error);
      toast.error('Erro ao exportar PDF');
    } finally {
      setExporting(false);
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
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Gestão Financeira</h1>
            <p className="text-muted-foreground">
              Controle de entradas, despesas e hora extra
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportToPDF} disabled={exporting}>
              {exporting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Exportar PDF
            </Button>
            <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button variant="glow">
                  <Plus className="h-4 w-4 mr-2" />
                  Nova Entrada
                </Button>
              </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingEntry ? 'Editar Entrada' : 'Nova Entrada Financeira'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <Button
                    type="button"
                    variant={form.entry_type === 'income' ? 'default' : 'outline'}
                    onClick={() => setForm({ ...form, entry_type: 'income', category: '' })}
                    className="w-full"
                  >
                    <TrendingUp className="h-4 w-4 mr-2" />
                    Entrada
                  </Button>
                  <Button
                    type="button"
                    variant={form.entry_type === 'expense' ? 'default' : 'outline'}
                    onClick={() => setForm({ ...form, entry_type: 'expense', category: '' })}
                    className="w-full"
                  >
                    <TrendingDown className="h-4 w-4 mr-2" />
                    Despesa
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label>Descrição *</Label>
                  <Input
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Ex: Contrato Condomínio X"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Categoria *</Label>
                    <Select
                      value={form.category}
                      onValueChange={(value) => setForm({ ...form, category: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {(form.entry_type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((cat) => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Valor (R$) *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                      placeholder="0,00"
                    />
                  </div>
                </div>

                {form.entry_type === 'income' && (
                  <div className="space-y-2">
                    <Label>Cliente / Contrato</Label>
                    <Input
                      value={form.client_name}
                      onChange={(e) => setForm({ ...form, client_name: e.target.value })}
                      placeholder="Nome do cliente ou contrato"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Data de Vencimento</Label>
                    <Input
                      type="date"
                      value={form.due_date}
                      onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                      min="2020-01-01"
                      max="2099-12-31"
                    />
                  </div>
                  {form.due_date && (
                    <div className="space-y-2">
                      <Label>Notificar (dias antes)</Label>
                      <Select
                        value={form.notification_days.toString()}
                        onValueChange={(value) => setForm({ ...form, notification_days: parseInt(value) })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">No dia</SelectItem>
                          <SelectItem value="1">1 dia antes</SelectItem>
                          <SelectItem value="2">2 dias antes</SelectItem>
                          <SelectItem value="3">3 dias antes</SelectItem>
                          <SelectItem value="5">5 dias antes</SelectItem>
                          <SelectItem value="7">1 semana antes</SelectItem>
                          <SelectItem value="-1">1 dia depois</SelectItem>
                          <SelectItem value="-2">2 dias depois</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="recurring"
                    checked={form.is_recurring}
                    onCheckedChange={(checked) => setForm({ ...form, is_recurring: checked as boolean })}
                  />
                  <Label htmlFor="recurring">Entrada recorrente</Label>
                </div>

                {form.is_recurring && (
                  <div className="grid grid-cols-2 gap-4 pl-6 border-l-2 border-primary/20">
                    <div className="space-y-2">
                      <Label>Tipo de Recorrência</Label>
                      <Select
                        value={form.recurrence_type}
                        onValueChange={(value) => setForm({ ...form, recurrence_type: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="weekly">Semanal</SelectItem>
                          <SelectItem value="monthly">Mensal</SelectItem>
                          <SelectItem value="yearly">Anual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {form.recurrence_type === 'monthly' && (
                      <div className="space-y-2">
                        <Label>Dia do mês</Label>
                        <Input
                          type="number"
                          min={1}
                          max={31}
                          value={form.recurrence_day}
                          onChange={(e) => setForm({ ...form, recurrence_day: parseInt(e.target.value) })}
                        />
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Observações</Label>
                  <Input
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Observações adicionais"
                  />
                </div>

                <Button onClick={handleSave} disabled={saving} className="w-full" variant="glow">
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  {editingEntry ? 'Atualizar' : 'Salvar'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Filtros:</span>
              </div>
              
              <Select value={filterPeriod} onValueChange={(v) => { setFilterPeriod(v as FilterPeriod); if (v !== 'custom') { setCustomStartDate(''); setCustomEndDate(''); } if (v !== 'month') setFilterMonth(''); }}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Período" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Este mês</SelectItem>
                  <SelectItem value="quarter">Trimestre</SelectItem>
                  <SelectItem value="year">Este ano</SelectItem>
                  <SelectItem value="future">Futuras</SelectItem>
                  <SelectItem value="custom">Personalizado</SelectItem>
                  <SelectItem value="all">Todos</SelectItem>
                </SelectContent>
              </Select>
              
              {/* Month filter */}
              <Select value={filterMonth || "all"} onValueChange={(v) => { setFilterMonth(v === "all" ? "" : v); if (v !== "all") setFilterPeriod('all'); }}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Mês específico" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os meses</SelectItem>
                  {Array.from({ length: 12 }, (_, i) => {
                    const date = new Date();
                    date.setMonth(date.getMonth() - i);
                    const value = format(date, 'yyyy-MM');
                    const label = format(date, 'MMMM yyyy', { locale: ptBR });
                    return <SelectItem key={value} value={value}>{label}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
              
              {/* Custom date range */}
              {filterPeriod === 'custom' && (
                <>
                  <Input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="w-[140px]"
                    placeholder="Data início"
                  />
                  <span className="text-muted-foreground">até</span>
                  <Input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="w-[140px]"
                    placeholder="Data fim"
                  />
                </>
              )}
              
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas categorias</SelectItem>
                  {allCategories.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos status</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="paid">Pago/Recebido</SelectItem>
                </SelectContent>
              </Select>
              
              {(filterPeriod !== 'month' || filterCategory !== 'all' || filterStatus !== 'all' || filterMonth) && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => { setFilterPeriod('month'); setFilterCategory('all'); setFilterStatus('all'); setFilterMonth(''); setCustomStartDate(''); setCustomEndDate(''); }}
                >
                  Limpar filtros
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card variant="glass">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Recebido</p>
                  <p className="text-2xl font-bold font-mono tabular-nums text-success">
                    R$ {totalIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="h-12 w-12 rounded-full bg-success/10 flex items-center justify-center">
                  <TrendingUp className="h-6 w-6 text-success" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card variant="glass">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">A Receber</p>
                  <p className="text-2xl font-bold font-mono tabular-nums text-warning">
                    R$ {pendingIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="h-12 w-12 rounded-full bg-warning/10 flex items-center justify-center">
                  <Clock className="h-6 w-6 text-warning" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card variant="glass">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Despesas</p>
                  <p className="text-2xl font-bold font-mono tabular-nums text-destructive">
                    R$ {totalExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
                  <TrendingDown className="h-6 w-6 text-destructive" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card variant="glass">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Saldo</p>
                  <p className={`text-2xl font-bold font-mono tabular-nums ${balance >= 0 ? 'text-success' : 'text-destructive'}`}>
                    R$ {balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <DollarSign className="h-6 w-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Monthly Comparison */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Comparativo Mensal
              </CardTitle>
            </CardHeader>
            <CardContent>
              {monthlyComparisonData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={monthlyComparisonData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                    <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                      formatter={(value: number) => [`R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, '']}
                    />
                    <Legend />
                    <Bar dataKey="income" name="Entradas" fill="hsl(142, 76%, 36%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expenses" name="Despesas" fill="hsl(0, 84%, 60%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                  Sem dados para exibir
                </div>
              )}
            </CardContent>
          </Card>

          {/* Category Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-primary" />
                Distribuição por Categoria
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                {/* Income Pie */}
                <div>
                  <p className="text-sm font-medium text-center mb-2 text-success">Entradas</p>
                  {incomeByCategoryData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={150}>
                      <PieChart>
                        <Pie
                          data={incomeByCategoryData}
                          cx="50%"
                          cy="50%"
                          innerRadius={30}
                          outerRadius={50}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {incomeByCategoryData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={INCOME_CHART_COLORS[index % INCOME_CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(value: number, name: string) => [`R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, name]}
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))', 
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                            fontSize: '12px'
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-[150px] text-muted-foreground text-sm">
                      Sem dados
                    </div>
                  )}
                </div>
                
                {/* Expense Pie */}
                <div>
                  <p className="text-sm font-medium text-center mb-2 text-destructive">Despesas</p>
                  {expenseByCategoryData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={150}>
                      <PieChart>
                        <Pie
                          data={expenseByCategoryData}
                          cx="50%"
                          cy="50%"
                          innerRadius={30}
                          outerRadius={50}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {expenseByCategoryData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={EXPENSE_CHART_COLORS[index % EXPENSE_CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(value: number, name: string) => [`R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, name]}
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))', 
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                            fontSize: '12px'
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-[150px] text-muted-foreground text-sm">
                      Sem dados
                    </div>
                  )}
                </div>
              </div>
              
              {/* Legend */}
              <div className="flex flex-wrap gap-2 justify-center mt-4">
                {incomeByCategoryData.slice(0, 3).map((entry, index) => (
                  <div key={`income-${entry.name}`} className="flex items-center gap-1">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: INCOME_CHART_COLORS[index % INCOME_CHART_COLORS.length] }}
                    />
                    <span className="text-xs text-muted-foreground">{entry.name}</span>
                  </div>
                ))}
                {expenseByCategoryData.slice(0, 3).map((entry, index) => (
                  <div key={`expense-${entry.name}`} className="flex items-center gap-1">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: EXPENSE_CHART_COLORS[index % EXPENSE_CHART_COLORS.length] }}
                    />
                    <span className="text-xs text-muted-foreground">{entry.name}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 max-w-md">
            <TabsTrigger value="overview">Resumo</TabsTrigger>
            <TabsTrigger value="income">Entradas</TabsTrigger>
            <TabsTrigger value="expenses">Despesas</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            <div className="grid gap-4 md:grid-cols-2">
              {/* Recent Income */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-success" />
                    Entradas Recentes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {incomeEntries.slice(0, 5).map((entry) => (
                      <div key={entry.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                        <div>
                          <p className="font-medium text-sm">{entry.description}</p>
                          <p className="text-xs text-muted-foreground">{entry.category}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-success">
                            R$ {entry.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </p>
                          <Badge variant={entry.status === 'paid' ? 'default' : 'secondary'} className="text-xs">
                            {entry.status === 'paid' ? 'Recebido' : 'Pendente'}
                          </Badge>
                        </div>
                      </div>
                    ))}
                    {incomeEntries.length === 0 && (
                      <p className="text-center text-muted-foreground py-4">Nenhuma entrada registrada</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Recent Expenses */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <TrendingDown className="h-5 w-5 text-destructive" />
                    Despesas Recentes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {expenseEntries.slice(0, 5).map((entry) => (
                      <div key={entry.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                        <div>
                          <p className="font-medium text-sm">{entry.description}</p>
                          <p className="text-xs text-muted-foreground">{entry.category}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-destructive">
                            R$ {entry.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </p>
                          <Badge variant={entry.status === 'paid' ? 'default' : 'secondary'} className="text-xs">
                            {entry.status === 'paid' ? 'Pago' : 'Pendente'}
                          </Badge>
                        </div>
                      </div>
                    ))}
                    {expenseEntries.length === 0 && (
                      <p className="text-center text-muted-foreground py-4">Nenhuma despesa registrada</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="income" className="mt-4">
            <Card>
              <CardContent className="p-6">
                <div className="space-y-4">
                  {incomeEntries.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between p-4 rounded-lg border bg-card">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{entry.description}</p>
                          {entry.is_recurring && (
                            <Badge variant="outline" className="text-xs">
                              <Calendar className="h-3 w-3 mr-1" />
                              Recorrente
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {entry.category}
                          {entry.client_name && ` • ${entry.client_name}`}
                        </p>
                        {entry.due_date && (
                          <p className="text-xs text-muted-foreground">
                            Vencimento: {format(parseISO(entry.due_date), 'dd/MM/yyyy')}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="font-semibold text-success text-lg">
                            R$ {entry.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </p>
                          <Badge variant={entry.status === 'paid' ? 'default' : 'secondary'}>
                            {entry.status === 'paid' ? 'Recebido' : 'Pendente'}
                          </Badge>
                        </div>
                        <div className="flex gap-1">
                          {entry.status !== 'paid' && (
                            <Button size="icon" variant="ghost" onClick={() => handleMarkAsPaid(entry)}>
                              <Check className="h-4 w-4 text-success" />
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" onClick={() => openEditDialog(entry)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => handleDelete(entry.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {incomeEntries.length === 0 && (
                    <div className="text-center py-8">
                      <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">Nenhuma entrada registrada</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="expenses" className="mt-4">
            <Card>
              <CardContent className="p-6">
                <div className="space-y-4">
                  {expenseEntries.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between p-4 rounded-lg border bg-card">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{entry.description}</p>
                          {entry.is_recurring && (
                            <Badge variant="outline" className="text-xs">
                              <Calendar className="h-3 w-3 mr-1" />
                              Recorrente
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{entry.category}</p>
                        {entry.due_date && (
                          <p className="text-xs text-muted-foreground">
                            Vencimento: {format(parseISO(entry.due_date), 'dd/MM/yyyy')}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="font-semibold text-destructive text-lg">
                            R$ {entry.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </p>
                          <Badge variant={entry.status === 'paid' ? 'default' : 'secondary'}>
                            {entry.status === 'paid' ? 'Pago' : 'Pendente'}
                          </Badge>
                        </div>
                        <div className="flex gap-1">
                          {entry.status !== 'paid' && (
                            <Button size="icon" variant="ghost" onClick={() => handleMarkAsPaid(entry)}>
                              <Check className="h-4 w-4 text-success" />
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" onClick={() => openEditDialog(entry)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => handleDelete(entry.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {expenseEntries.length === 0 && (
                    <div className="text-center py-8">
                      <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">Nenhuma despesa registrada</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
