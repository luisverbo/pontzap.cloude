import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { getImpersonatedCompanyId } from '@/components/ImpersonationBar';
import { ptBR } from 'date-fns/locale';
import { 
  Plus, 
  Calendar, 
  DollarSign, 
  CheckCircle2, 
  Clock, 
  User, 
  MapPin,
  Filter,
  FileText,
  Loader2,
  CreditCard,
  Banknote,
  Pencil,
  Trash2,
  ChevronDown,
  FolderPlus
} from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

interface Folguista {
  id: string;
  name: string;
}

interface Location {
  id: string;
  name: string;
}

interface Periodo {
  id: string;
  folguista_id: string;
  periodo_mes: number;
  periodo_ano: number;
  observacao: string | null;
  status: string;
  financeiro_despesa_id: string | null;
  created_at: string;
}

interface Anotacao {
  id: string;
  folguista_id: string;
  periodo_id: string | null;
  data_trabalho: string;
  local_id: string | null;
  valor: number;
  status: string;
  observacao: string | null;
  financeiro_despesa_id: string | null;
  data_pagamento: string | null;
  forma_pagamento: string | null;
  created_at: string;
  folguista?: { name: string };
  location?: { name: string };
}

interface PeriodoSummary {
  id: string;
  mes: number;
  ano: number;
  observacao: string | null;
  status: string;
  financeiro_despesa_id: string | null;
  totalDias: number;
  totalAcumulado: number;
  totalPago: number;
  totalAPagar: number;
  anotacoes: Anotacao[];
}

interface FolguistaSummary {
  id: string;
  name: string;
  totalDias: number;
  totalAcumulado: number;
  totalPago: number;
  totalAPagar: number;
  periodos: PeriodoSummary[];
  anotacoesSemPeriodo: Anotacao[];
}

const MESES = [
  { value: 1, label: 'Janeiro' },
  { value: 2, label: 'Fevereiro' },
  { value: 3, label: 'Março' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Maio' },
  { value: 6, label: 'Junho' },
  { value: 7, label: 'Julho' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Setembro' },
  { value: 10, label: 'Outubro' },
  { value: 11, label: 'Novembro' },
  { value: 12, label: 'Dezembro' }
];

export default function Anotacoes() {
  const [folguistas, setFolguistas] = useState<Folguista[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [anotacoes, setAnotacoes] = useState<Anotacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddPeriodoModal, setShowAddPeriodoModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showFinanceModal, setShowFinanceModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDeletePeriodoDialog, setShowDeletePeriodoDialog] = useState(false);
  const [editingAnotacao, setEditingAnotacao] = useState<Anotacao | null>(null);
  const [deletingPeriodo, setDeletingPeriodo] = useState<{ id: string; mes: number; ano: number; totalDias: number } | null>(null);
  const [deletingAnotacao, setDeletingAnotacao] = useState<Anotacao | null>(null);
  
  // Form state for workday
  const [selectedFolguista, setSelectedFolguista] = useState<string>('');
  const [selectedPeriodo, setSelectedPeriodo] = useState<string>('');
  const [dataTrabalho, setDataTrabalho] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [selectedLocal, setSelectedLocal] = useState<string>('');
  const [valor, setValor] = useState<string>('');
  const [observacao, setObservacao] = useState<string>('');
  
  // Form state for periodo
  const [periodoFolguista, setPeriodoFolguista] = useState<string>('');
  const [periodoMes, setPeriodoMes] = useState<string>('');
  const [periodoAno, setPeriodoAno] = useState<string>(String(new Date().getFullYear()));
  const [periodoObs, setPeriodoObs] = useState<string>('');
  
  // Payment state
  const [selectedAnotacoes, setSelectedAnotacoes] = useState<string[]>([]);
  const [paymentPeriodo, setPaymentPeriodo] = useState<PeriodoSummary | null>(null);
  const [paymentFolguistaName, setPaymentFolguistaName] = useState<string>('');
  const [dataPagamento, setDataPagamento] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [formaPagamento, setFormaPagamento] = useState<string>('pix');
  
  // Finance generation state
  const [financeStatus, setFinanceStatus] = useState<'a_pagar' | 'pago'>('a_pagar');
  
  // Filter state
  const [filterFolguista, setFilterFolguista] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  
  // Expanded accordion state
  const [expandedFolguistas, setExpandedFolguistas] = useState<Set<string>>(new Set());
  const [expandedPeriodos, setExpandedPeriodos] = useState<Set<string>>(new Set());

  const toggleFolguistaExpanded = (folguistaId: string) => {
    setExpandedFolguistas(prev => {
      const newSet = new Set(prev);
      if (newSet.has(folguistaId)) {
        newSet.delete(folguistaId);
      } else {
        newSet.add(folguistaId);
      }
      return newSet;
    });
  };

  const togglePeriodoExpanded = (periodoId: string) => {
    setExpandedPeriodos(prev => {
      const newSet = new Set(prev);
      if (newSet.has(periodoId)) {
        newSet.delete(periodoId);
      } else {
        newSet.add(periodoId);
      }
      return newSet;
    });
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const impersonatedCompanyId = getImpersonatedCompanyId();
      
      // Fetch folguistas (employees of type 'substitute')
      let employeesQuery = supabase
        .from('employees')
        .select('id, user_id')
        .eq('type', 'substitute')
        .eq('is_active', true);
      
      if (impersonatedCompanyId) {
        employeesQuery = employeesQuery.or(`company_id.eq.${impersonatedCompanyId},company_id.is.null`);
      }

      const { data: employeesData, error: employeesError } = await employeesQuery;
      
      if (employeesError) {
        console.error('Error fetching employees:', employeesError);
        throw employeesError;
      }

      // Fetch profiles for the employees
      const userIds = (employeesData || []).map(e => e.user_id);
      let profilesData: { id: string; name: string }[] = [];
      
      if (userIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, name')
          .in('id', userIds);
        
        if (profilesError) {
          console.error('Error fetching profiles:', profilesError);
        } else {
          profilesData = profiles || [];
        }
      }

      const folguistasFormatted = (employeesData || []).map(e => ({
        id: e.id,
        name: profilesData.find(p => p.id === e.user_id)?.name || 'Sem nome'
      }));
      setFolguistas(folguistasFormatted);

      // Fetch locations
      let locationsQuery = supabase.from('locations').select('id, name');
      if (impersonatedCompanyId) {
        locationsQuery = locationsQuery.eq('company_id', impersonatedCompanyId);
      }
      
      const { data: locationsData, error: locationsError } = await locationsQuery;
      
      if (locationsError) {
        console.error('Error fetching locations:', locationsError);
        throw locationsError;
      }
      setLocations(locationsData || []);

      // Fetch periodos
      await fetchPeriodos();
      
      // Fetch anotacoes
      await fetchAnotacoes();
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  const fetchPeriodos = async () => {
    try {
      const impersonatedCompanyId = getImpersonatedCompanyId();
      
      let query = supabase
        .from('anotacoes_periodo')
        .select('*')
        .order('periodo_ano', { ascending: false })
        .order('periodo_mes', { ascending: false });
      
      if (impersonatedCompanyId) {
        query = query.eq('company_id', impersonatedCompanyId);
      }

      const { data, error } = await query;
      if (error) throw error;
      setPeriodos(data || []);
    } catch (error) {
      console.error('Error fetching periodos:', error);
    }
  };

  const fetchAnotacoes = async () => {
    try {
      const impersonatedCompanyId = getImpersonatedCompanyId();
      
      let query = supabase
        .from('anotacoes_folguista')
        .select('*')
        .order('data_trabalho', { ascending: false });
      
      if (impersonatedCompanyId) {
        query = query.eq('company_id', impersonatedCompanyId);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Fetch related employee names and locations separately
      const folguistaIds = [...new Set((data || []).map(a => a.folguista_id))];
      const localIds = [...new Set((data || []).filter(a => a.local_id).map(a => a.local_id!))];

      let employeeProfiles: { employee_id: string; name: string }[] = [];
      if (folguistaIds.length > 0) {
        const { data: employees } = await supabase
          .from('employees')
          .select('id, user_id')
          .in('id', folguistaIds);
        
        if (employees && employees.length > 0) {
          const userIds = employees.map(e => e.user_id);
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, name')
            .in('id', userIds);
          
          employeeProfiles = employees.map(e => ({
            employee_id: e.id,
            name: profiles?.find(p => p.id === e.user_id)?.name || 'Sem nome'
          }));
        }
      }

      let locationNames: { id: string; name: string }[] = [];
      if (localIds.length > 0) {
        const { data: locs } = await supabase
          .from('locations')
          .select('id, name')
          .in('id', localIds);
        locationNames = locs || [];
      }

      const formattedAnotacoes = (data || []).map(a => ({
        ...a,
        folguista: { name: employeeProfiles.find(ep => ep.employee_id === a.folguista_id)?.name || 'Sem nome' },
        location: a.local_id ? { name: locationNames.find(l => l.id === a.local_id)?.name || '' } : undefined
      }));

      setAnotacoes(formattedAnotacoes);
    } catch (error) {
      console.error('Error fetching anotacoes:', error);
    }
  };

  const handleAddPeriodo = async () => {
    if (!periodoFolguista || !periodoMes || !periodoAno) {
      toast.error('Preencha os campos obrigatórios');
      return;
    }

    setSaving(true);
    try {
      const impersonatedCompanyId = getImpersonatedCompanyId();
      
      const { error } = await supabase
        .from('anotacoes_periodo')
        .insert({
          folguista_id: periodoFolguista,
          periodo_mes: parseInt(periodoMes),
          periodo_ano: parseInt(periodoAno),
          observacao: periodoObs || null,
          company_id: impersonatedCompanyId || null
        });

      if (error) {
        if (error.code === '23505') {
          toast.error('Já existe um período para este folguista neste mês/ano');
          return;
        }
        throw error;
      }

      toast.success('Período criado com sucesso!');
      setShowAddPeriodoModal(false);
      resetPeriodoForm();
      fetchPeriodos();
    } catch (error) {
      console.error('Error adding periodo:', error);
      toast.error('Erro ao criar período');
    } finally {
      setSaving(false);
    }
  };

  const resetPeriodoForm = () => {
    setPeriodoFolguista('');
    setPeriodoMes('');
    setPeriodoAno(String(new Date().getFullYear()));
    setPeriodoObs('');
  };

  const handleAddAnotacao = async () => {
    if (!selectedFolguista || !selectedPeriodo || !dataTrabalho || !valor) {
      toast.error('Preencha os campos obrigatórios');
      return;
    }

    // Validate that date is within the selected period
    const periodo = periodos.find(p => p.id === selectedPeriodo);
    if (periodo) {
      const date = new Date(dataTrabalho + 'T12:00:00');
      const month = date.getMonth() + 1;
      const year = date.getFullYear();
      if (month !== periodo.periodo_mes || year !== periodo.periodo_ano) {
        toast.error(`A data deve ser de ${MESES.find(m => m.value === periodo.periodo_mes)?.label}/${periodo.periodo_ano}`);
        return;
      }
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('anotacoes_folguista')
        .insert({
          folguista_id: selectedFolguista,
          periodo_id: selectedPeriodo,
          data_trabalho: dataTrabalho,
          local_id: selectedLocal || null,
          valor: parseFloat(valor),
          observacao: observacao || null,
          status: 'a_pagar'
        });

      if (error) throw error;

      toast.success('Dia trabalhado registrado com sucesso!');
      setShowAddModal(false);
      resetForm();
      fetchAnotacoes();
    } catch (error) {
      console.error('Error adding anotacao:', error);
      toast.error('Erro ao registrar dia trabalhado');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setSelectedFolguista('');
    setSelectedPeriodo('');
    setDataTrabalho(format(new Date(), 'yyyy-MM-dd'));
    setSelectedLocal('');
    setValor('');
    setObservacao('');
  };

  const openEditModal = (anotacao: Anotacao) => {
    setEditingAnotacao(anotacao);
    setSelectedFolguista(anotacao.folguista_id);
    setSelectedPeriodo(anotacao.periodo_id || '');
    setDataTrabalho(anotacao.data_trabalho);
    setSelectedLocal(anotacao.local_id || '');
    setValor(String(anotacao.valor));
    setObservacao(anotacao.observacao || '');
    setShowEditModal(true);
  };

  const handleEditAnotacao = async () => {
    if (!editingAnotacao || !selectedFolguista || !dataTrabalho || !valor) {
      toast.error('Preencha os campos obrigatórios');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('anotacoes_folguista')
        .update({
          folguista_id: selectedFolguista,
          periodo_id: selectedPeriodo || null,
          data_trabalho: dataTrabalho,
          local_id: selectedLocal || null,
          valor: parseFloat(valor),
          observacao: observacao || null
        })
        .eq('id', editingAnotacao.id);

      if (error) throw error;

      toast.success('Anotação atualizada com sucesso!');
      setShowEditModal(false);
      setEditingAnotacao(null);
      resetForm();
      fetchAnotacoes();
    } catch (error) {
      console.error('Error updating anotacao:', error);
      toast.error('Erro ao atualizar anotação');
    } finally {
      setSaving(false);
    }
  };

  const openDeleteDialog = (anotacao: Anotacao) => {
    setDeletingAnotacao(anotacao);
    setShowDeleteDialog(true);
  };

  const handleDeleteAnotacao = async () => {
    if (!deletingAnotacao) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('anotacoes_folguista')
        .delete()
        .eq('id', deletingAnotacao.id);

      if (error) throw error;

      toast.success('Anotação excluída com sucesso!');
      setShowDeleteDialog(false);
      setDeletingAnotacao(null);
      fetchAnotacoes();
    } catch (error) {
      console.error('Error deleting anotacao:', error);
      toast.error('Erro ao excluir anotação');
    } finally {
      setSaving(false);
    }
  };

  const openDeletePeriodoDialog = (periodo: PeriodoSummary) => {
    setDeletingPeriodo({ id: periodo.id, mes: periodo.mes, ano: periodo.ano, totalDias: periodo.totalDias });
    setShowDeletePeriodoDialog(true);
  };

  const handleDeletePeriodo = async () => {
    if (!deletingPeriodo) return;

    setSaving(true);
    try {
      // First, unlink any anotacoes from this period
      await supabase
        .from('anotacoes_folguista')
        .update({ periodo_id: null })
        .eq('periodo_id', deletingPeriodo.id);

      // Then delete the period
      const { error } = await supabase
        .from('anotacoes_periodo')
        .delete()
        .eq('id', deletingPeriodo.id);

      if (error) throw error;

      toast.success('Período excluído com sucesso!');
      setShowDeletePeriodoDialog(false);
      setDeletingPeriodo(null);
      fetchPeriodos();
      fetchAnotacoes();
    } catch (error) {
      console.error('Error deleting periodo:', error);
      toast.error('Erro ao excluir período');
    } finally {
      setSaving(false);
    }
  };

  const handleMarkSingleAsPaid = async (anotacaoId: string) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('anotacoes_folguista')
        .update({
          status: 'pago',
          data_pagamento: format(new Date(), 'yyyy-MM-dd'),
          forma_pagamento: 'pix'
        })
        .eq('id', anotacaoId);

      if (error) throw error;

      toast.success('Dia marcado como pago!');
      fetchAnotacoes();
    } catch (error) {
      console.error('Error marking as paid:', error);
      toast.error('Erro ao marcar como pago');
    } finally {
      setSaving(false);
    }
  };

  const getSummaryByFolguista = (): FolguistaSummary[] => {
    const summaryMap = new Map<string, FolguistaSummary>();

    // Filter anotacoes
    let filteredAnotacoes = [...anotacoes];
    
    if (filterFolguista !== 'all') {
      filteredAnotacoes = filteredAnotacoes.filter(a => a.folguista_id === filterFolguista);
    }
    if (filterStatus !== 'all') {
      filteredAnotacoes = filteredAnotacoes.filter(a => a.status === filterStatus);
    }

    // Group by folguista first
    filteredAnotacoes.forEach(anotacao => {
      const folguistaName = anotacao.folguista?.name || 'Sem nome';
      
      if (!summaryMap.has(anotacao.folguista_id)) {
        summaryMap.set(anotacao.folguista_id, {
          id: anotacao.folguista_id,
          name: folguistaName,
          totalDias: 0,
          totalAcumulado: 0,
          totalPago: 0,
          totalAPagar: 0,
          periodos: [],
          anotacoesSemPeriodo: []
        });
      }

      const summary = summaryMap.get(anotacao.folguista_id)!;
      summary.totalDias += 1;
      summary.totalAcumulado += Number(anotacao.valor);
      if (anotacao.status === 'pago') {
        summary.totalPago += Number(anotacao.valor);
      } else {
        summary.totalAPagar += Number(anotacao.valor);
      }

      if (anotacao.periodo_id) {
        // Find or create periodo summary
        let periodoSummary = summary.periodos.find(p => p.id === anotacao.periodo_id);
        if (!periodoSummary) {
          const periodo = periodos.find(p => p.id === anotacao.periodo_id);
          if (periodo) {
            periodoSummary = {
              id: periodo.id,
              mes: periodo.periodo_mes,
              ano: periodo.periodo_ano,
              observacao: periodo.observacao,
              status: periodo.status,
              financeiro_despesa_id: periodo.financeiro_despesa_id,
              totalDias: 0,
              totalAcumulado: 0,
              totalPago: 0,
              totalAPagar: 0,
              anotacoes: []
            };
            summary.periodos.push(periodoSummary);
          }
        }
        if (periodoSummary) {
          periodoSummary.totalDias += 1;
          periodoSummary.totalAcumulado += Number(anotacao.valor);
          if (anotacao.status === 'pago') {
            periodoSummary.totalPago += Number(anotacao.valor);
          } else {
            periodoSummary.totalAPagar += Number(anotacao.valor);
          }
          periodoSummary.anotacoes.push(anotacao);
        }
      } else {
        summary.anotacoesSemPeriodo.push(anotacao);
      }
    });

    // Add empty periodos (periodos without anotacoes)
    periodos.forEach(periodo => {
      let folguistaSummary = summaryMap.get(periodo.folguista_id);
      if (!folguistaSummary) {
        const folguista = folguistas.find(f => f.id === periodo.folguista_id);
        if (filterFolguista !== 'all' && periodo.folguista_id !== filterFolguista) {
          return;
        }
        folguistaSummary = {
          id: periodo.folguista_id,
          name: folguista?.name || 'Sem nome',
          totalDias: 0,
          totalAcumulado: 0,
          totalPago: 0,
          totalAPagar: 0,
          periodos: [],
          anotacoesSemPeriodo: []
        };
        summaryMap.set(periodo.folguista_id, folguistaSummary);
      }
      
      if (!folguistaSummary.periodos.find(p => p.id === periodo.id)) {
        folguistaSummary.periodos.push({
          id: periodo.id,
          mes: periodo.periodo_mes,
          ano: periodo.periodo_ano,
          observacao: periodo.observacao,
          status: periodo.status,
          financeiro_despesa_id: periodo.financeiro_despesa_id,
          totalDias: 0,
          totalAcumulado: 0,
          totalPago: 0,
          totalAPagar: 0,
          anotacoes: []
        });
      }
    });

    // Sort periodos by date descending
    summaryMap.forEach(summary => {
      summary.periodos.sort((a, b) => {
        if (a.ano !== b.ano) return b.ano - a.ano;
        return b.mes - a.mes;
      });
    });

    return Array.from(summaryMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  };

  const openPaymentModal = (periodoSummary: PeriodoSummary, folguistaName: string) => {
    setPaymentPeriodo(periodoSummary);
    setPaymentFolguistaName(folguistaName);
    setSelectedAnotacoes(periodoSummary.anotacoes.filter(a => a.status === 'a_pagar').map(a => a.id));
    setShowPaymentModal(true);
  };

  const handleMarkAsPaid = async () => {
    if (selectedAnotacoes.length === 0) {
      toast.error('Selecione ao menos um dia para marcar como pago');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('anotacoes_folguista')
        .update({
          status: 'pago',
          data_pagamento: dataPagamento,
          forma_pagamento: formaPagamento
        })
        .in('id', selectedAnotacoes);

      if (error) throw error;

      toast.success('Pagamentos registrados com sucesso!');
      setShowPaymentModal(false);
      setPaymentPeriodo(null);
      setSelectedAnotacoes([]);
      fetchAnotacoes();
    } catch (error) {
      console.error('Error marking as paid:', error);
      toast.error('Erro ao registrar pagamentos');
    } finally {
      setSaving(false);
    }
  };

  const openFinanceModal = (periodoSummary: PeriodoSummary, folguistaName: string) => {
    setPaymentPeriodo(periodoSummary);
    setPaymentFolguistaName(folguistaName);
    setSelectedAnotacoes(
      periodoSummary.anotacoes
        .filter(a => !a.financeiro_despesa_id)
        .map(a => a.id)
    );
    setShowFinanceModal(true);
  };

  const handleGenerateFinancialEntry = async () => {
    if (selectedAnotacoes.length === 0 || !paymentPeriodo) {
      toast.error('Selecione ao menos um dia para gerar despesa');
      return;
    }

    setSaving(true);
    try {
      const selectedItems = paymentPeriodo.anotacoes.filter(a => selectedAnotacoes.includes(a.id));
      const totalValue = selectedItems.reduce((sum, a) => sum + Number(a.valor), 0);
      const mesLabel = MESES.find(m => m.value === paymentPeriodo.mes)?.label || '';

      // Create financial entry
      const { data: financialEntry, error: finError } = await supabase
        .from('financial_entries')
        .insert({
          entry_type: 'expense',
          category: 'Folguistas',
          description: `Pagamento Folguista ${paymentFolguistaName} — ${mesLabel}/${paymentPeriodo.ano}`,
          amount: totalValue,
          due_date: financeStatus === 'a_pagar' ? format(new Date(), 'yyyy-MM-dd') : null,
          paid_date: financeStatus === 'pago' ? format(new Date(), 'yyyy-MM-dd') : null,
          status: financeStatus === 'pago' ? 'paid' : 'pending',
          is_recurring: false
        })
        .select()
        .single();

      if (finError) throw finError;

      // Link anotacoes to financial entry and update status if paid
      const updateData: any = { financeiro_despesa_id: financialEntry.id };
      if (financeStatus === 'pago') {
        updateData.status = 'pago';
        updateData.data_pagamento = format(new Date(), 'yyyy-MM-dd');
      }

      const { error: updateError } = await supabase
        .from('anotacoes_folguista')
        .update(updateData)
        .in('id', selectedAnotacoes);

      if (updateError) throw updateError;

      toast.success('Despesa gerada no Financeiro com sucesso!');
      setShowFinanceModal(false);
      setPaymentPeriodo(null);
      setSelectedAnotacoes([]);
      fetchAnotacoes();
    } catch (error) {
      console.error('Error generating financial entry:', error);
      toast.error('Erro ao gerar despesa no Financeiro');
    } finally {
      setSaving(false);
    }
  };

  const getAvailablePeriodosForFolguista = (folguistaId: string) => {
    return periodos.filter(p => p.folguista_id === folguistaId);
  };

  const summaries = getSummaryByFolguista();
  const totalGeral = summaries.reduce((sum, s) => sum + s.totalAcumulado, 0);
  const totalAPagarGeral = summaries.reduce((sum, s) => sum + s.totalAPagar, 0);
  const totalPagoGeral = summaries.reduce((sum, s) => sum + s.totalPago, 0);

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Anotações de Folguistas</h1>
            <p className="text-muted-foreground">Organize dias trabalhados por período (mês/ano)</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Add Period Button */}
            <Dialog open={showAddPeriodoModal} onOpenChange={setShowAddPeriodoModal}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <FolderPlus className="h-4 w-4" />
                  Novo Período
                </Button>
              </DialogTrigger>
              <DialogContent className="flex max-h-[85vh] flex-col">
                <DialogHeader>
                  <DialogTitle>Criar Novo Período</DialogTitle>
                </DialogHeader>
                <div className="flex-1 space-y-4 overflow-y-auto py-4 pr-1">
                  <div className="space-y-2">
                    <Label>Folguista *</Label>
                    {folguistas.length === 0 ? (
                      <p className="text-sm text-muted-foreground p-3 bg-muted rounded-md">
                        Nenhum funcionário folguista cadastrado.
                      </p>
                    ) : (
                      <Select value={periodoFolguista} onValueChange={setPeriodoFolguista}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o folguista" />
                        </SelectTrigger>
                        <SelectContent>
                          {folguistas.map(f => (
                            <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Mês *</Label>
                      <Select value={periodoMes} onValueChange={setPeriodoMes}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {MESES.map(m => (
                            <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Ano *</Label>
                      <Input
                        type="number"
                        min="2020"
                        max="2099"
                        value={periodoAno}
                        onChange={e => setPeriodoAno(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Observação (opcional)</Label>
                    <Textarea
                      placeholder="Adicione uma observação..."
                      value={periodoObs}
                      onChange={e => setPeriodoObs(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter className="border-t border-border pt-4">
                  <Button variant="outline" onClick={() => setShowAddPeriodoModal(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleAddPeriodo} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Criar Período
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Add Workday Button */}
            <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Adicionar Dia
                </Button>
              </DialogTrigger>
              <DialogContent className="flex max-h-[85vh] flex-col">
                <DialogHeader>
                  <DialogTitle>Registrar Dia Trabalhado</DialogTitle>
                </DialogHeader>
                <div className="flex-1 space-y-4 overflow-y-auto py-4 pr-1">
                  <div className="space-y-2">
                    <Label>Folguista *</Label>
                    {folguistas.length === 0 ? (
                      <p className="text-sm text-muted-foreground p-3 bg-muted rounded-md">
                        Nenhum funcionário folguista cadastrado.
                      </p>
                    ) : (
                      <Select value={selectedFolguista} onValueChange={(v) => {
                        setSelectedFolguista(v);
                        setSelectedPeriodo('');
                      }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o folguista" />
                        </SelectTrigger>
                        <SelectContent>
                          {folguistas.map(f => (
                            <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Período (Mês/Ano) *</Label>
                    {selectedFolguista ? (
                      getAvailablePeriodosForFolguista(selectedFolguista).length === 0 ? (
                        <p className="text-sm text-muted-foreground p-3 bg-muted rounded-md">
                          Nenhum período criado para este folguista. Crie um período primeiro.
                        </p>
                      ) : (
                        <Select value={selectedPeriodo} onValueChange={setSelectedPeriodo}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o período" />
                          </SelectTrigger>
                          <SelectContent>
                            {getAvailablePeriodosForFolguista(selectedFolguista).map(p => (
                              <SelectItem key={p.id} value={p.id}>
                                {MESES.find(m => m.value === p.periodo_mes)?.label}/{p.periodo_ano}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )
                    ) : (
                      <p className="text-sm text-muted-foreground p-3 bg-muted rounded-md">
                        Selecione um folguista primeiro.
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Data do Trabalho *</Label>
                    <Input
                      type="date"
                      value={dataTrabalho}
                      onChange={e => setDataTrabalho(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Local de Trabalho (opcional)</Label>
                    <Select value={selectedLocal || "none"} onValueChange={(v) => setSelectedLocal(v === "none" ? "" : v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o local" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum</SelectItem>
                        {locations.map(l => (
                          <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Valor do Dia (R$) *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Ex: 150.00"
                      value={valor}
                      onChange={e => setValor(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Observação (opcional)</Label>
                    <Textarea
                      placeholder="Adicione uma observação..."
                      value={observacao}
                      onChange={e => setObservacao(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter className="border-t border-border pt-4">
                  <Button variant="outline" onClick={() => setShowAddModal(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleAddAnotacao} disabled={saving || !selectedPeriodo}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Salvar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-l-4 border-l-primary">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <DollarSign className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Acumulado</p>
                  <p className="text-2xl font-bold">R$ {totalGeral.toFixed(2)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-warning">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-warning/10">
                  <Clock className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">A Pagar</p>
                  <p className="text-2xl font-bold text-warning">R$ {totalAPagarGeral.toFixed(2)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-success">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-success/10">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Pago</p>
                  <p className="text-2xl font-bold text-success">R$ {totalPagoGeral.toFixed(2)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filtros
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs">Folguista</Label>
                <Select value={filterFolguista} onValueChange={setFilterFolguista}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {folguistas.map(f => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Status</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="a_pagar">A Pagar</SelectItem>
                    <SelectItem value="pago">Pago</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Folguistas List - Hierarchical */}
        <div className="space-y-4">
          {summaries.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <User className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Nenhuma anotação encontrada</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Crie um período e adicione dias trabalhados
                </p>
              </CardContent>
            </Card>
          ) : (
            summaries.map(summary => (
              <Collapsible
                key={summary.id}
                open={expandedFolguistas.has(summary.id)}
                onOpenChange={() => toggleFolguistaExpanded(summary.id)}
              >
                <Card className="overflow-hidden">
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-full bg-primary/10">
                            <User className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <CardTitle className="text-lg flex items-center gap-2">
                              {summary.name}
                              <span className="text-sm font-normal text-muted-foreground">
                                (Folguista)
                              </span>
                            </CardTitle>
                            <CardDescription className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3.5 w-3.5" />
                                {summary.periodos.length} período(s)
                              </span>
                              <span className="flex items-center gap-1">
                                <DollarSign className="h-3.5 w-3.5" />
                                Total: R$ {summary.totalAcumulado.toFixed(2)}
                              </span>
                              {summary.totalAPagar > 0 && (
                                <span className="flex items-center gap-1 text-warning">
                                  <Clock className="h-3.5 w-3.5" />
                                  A pagar: R$ {summary.totalAPagar.toFixed(2)}
                                </span>
                              )}
                              {summary.totalPago > 0 && (
                                <span className="flex items-center gap-1 text-success">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Pago: R$ {summary.totalPago.toFixed(2)}
                                </span>
                              )}
                            </CardDescription>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <ChevronDown 
                            className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${
                              expandedFolguistas.has(summary.id) ? 'rotate-180' : ''
                            }`}
                          />
                        </div>
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent>
                    <CardContent className="pt-0 border-t">
                      {/* Periodos List */}
                      <div className="space-y-3 mt-4">
                        {summary.periodos.length === 0 && summary.anotacoesSemPeriodo.length === 0 ? (
                          <div className="text-center py-6 text-muted-foreground">
                            <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p>Nenhum período criado</p>
                            <Button 
                              variant="link" 
                              size="sm"
                              onClick={() => {
                                setPeriodoFolguista(summary.id);
                                setShowAddPeriodoModal(true);
                              }}
                            >
                              Criar primeiro período
                            </Button>
                          </div>
                        ) : (
                          <>
                            {/* Periodos */}
                            {summary.periodos.map(periodo => (
                              <Collapsible
                                key={periodo.id}
                                open={expandedPeriodos.has(periodo.id)}
                                onOpenChange={() => togglePeriodoExpanded(periodo.id)}
                              >
                                <div className="border rounded-lg overflow-hidden">
                                  <CollapsibleTrigger asChild>
                                    <div className="flex items-center justify-between p-3 bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors">
                                      <div className="flex items-center gap-3">
                                        <ChevronDown 
                                          className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                                            expandedPeriodos.has(periodo.id) ? 'rotate-180' : ''
                                          }`}
                                        />
                                        <div>
                                          <p className="font-medium">
                                            {MESES.find(m => m.value === periodo.mes)?.label}/{periodo.ano}
                                          </p>
                                          <p className="text-sm text-muted-foreground">
                                            {periodo.totalDias} dia(s) • R$ {periodo.totalAcumulado.toFixed(2)}
                                            {periodo.totalAPagar > 0 && (
                                              <span className="text-warning ml-2">
                                                (A pagar: R$ {periodo.totalAPagar.toFixed(2)})
                                              </span>
                                            )}
                                          </p>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                        {periodo.totalAPagar > 0 && (
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="gap-1 h-8"
                                            onClick={() => openPaymentModal(periodo, summary.name)}
                                          >
                                            <Banknote className="h-3.5 w-3.5" />
                                            Pagar
                                          </Button>
                                        )}
                                        {periodo.anotacoes.some(a => !a.financeiro_despesa_id) && (
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="gap-1 h-8"
                                            onClick={() => openFinanceModal(periodo, summary.name)}
                                          >
                                            <FileText className="h-3.5 w-3.5" />
                                            Financeiro
                                          </Button>
                                        )}
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8 text-destructive hover:text-destructive"
                                          title="Excluir período"
                                          onClick={() => openDeletePeriodoDialog(periodo)}
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    </div>
                                  </CollapsibleTrigger>
                                  
                                  <CollapsibleContent>
                                    <div className="p-3 border-t">
                                      {periodo.anotacoes.length === 0 ? (
                                        <p className="text-sm text-muted-foreground text-center py-4">
                                          Nenhum dia registrado neste período
                                        </p>
                                      ) : (
                                        <Table>
                                          <TableHeader>
                                            <TableRow>
                                              <TableHead>Data</TableHead>
                                              <TableHead>Local</TableHead>
                                              <TableHead>Valor</TableHead>
                                              <TableHead>Status</TableHead>
                                              <TableHead>Obs</TableHead>
                                              <TableHead className="text-right">Ações</TableHead>
                                            </TableRow>
                                          </TableHeader>
                                          <TableBody>
                                            {periodo.anotacoes.map(anotacao => (
                                              <TableRow key={anotacao.id}>
                                                <TableCell>
                                                  {format(new Date(anotacao.data_trabalho + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR })}
                                                </TableCell>
                                                <TableCell>
                                                  {anotacao.location?.name || '-'}
                                                </TableCell>
                                                <TableCell className="font-medium">
                                                  R$ {Number(anotacao.valor).toFixed(2)}
                                                </TableCell>
                                                <TableCell>
                                                  {anotacao.status === 'pago' ? (
                                                    <Badge className="bg-success/10 text-success border-success/20">
                                                      Pago
                                                    </Badge>
                                                  ) : (
                                                    <Badge variant="secondary" className="bg-warning/10 text-warning border-warning/20">
                                                      A Pagar
                                                    </Badge>
                                                  )}
                                                </TableCell>
                                                <TableCell className="text-muted-foreground text-sm max-w-[150px] truncate">
                                                  {anotacao.observacao || '-'}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                  <div className="flex items-center justify-end gap-1">
                                                    {anotacao.status === 'a_pagar' && (
                                                      <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-success hover:text-success"
                                                        title="Marcar como pago"
                                                        onClick={() => handleMarkSingleAsPaid(anotacao.id)}
                                                      >
                                                        <CheckCircle2 className="h-4 w-4" />
                                                      </Button>
                                                    )}
                                                    <Button
                                                      variant="ghost"
                                                      size="icon"
                                                      className="h-8 w-8"
                                                      onClick={() => openEditModal(anotacao)}
                                                    >
                                                      <Pencil className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                      variant="ghost"
                                                      size="icon"
                                                      className="h-8 w-8 text-destructive hover:text-destructive"
                                                      onClick={() => openDeleteDialog(anotacao)}
                                                    >
                                                      <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                  </div>
                                                </TableCell>
                                              </TableRow>
                                            ))}
                                          </TableBody>
                                        </Table>
                                      )}
                                    </div>
                                  </CollapsibleContent>
                                </div>
                              </Collapsible>
                            ))}

                            {/* Anotações sem período (legado) */}
                            {summary.anotacoesSemPeriodo.length > 0 && (
                              <div className="border rounded-lg overflow-hidden border-dashed">
                                <div className="p-3 bg-muted/20">
                                  <p className="text-sm text-muted-foreground">
                                    ⚠️ Dias sem período definido ({summary.anotacoesSemPeriodo.length} registros)
                                  </p>
                                </div>
                                <div className="p-3">
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>Data</TableHead>
                                        <TableHead>Local</TableHead>
                                        <TableHead>Valor</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Ações</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {summary.anotacoesSemPeriodo.map(anotacao => (
                                        <TableRow key={anotacao.id}>
                                          <TableCell>
                                            {format(new Date(anotacao.data_trabalho + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR })}
                                          </TableCell>
                                          <TableCell>
                                            {anotacao.location?.name || '-'}
                                          </TableCell>
                                          <TableCell className="font-medium">
                                            R$ {Number(anotacao.valor).toFixed(2)}
                                          </TableCell>
                                          <TableCell>
                                            {anotacao.status === 'pago' ? (
                                              <Badge className="bg-success/10 text-success border-success/20">
                                                Pago
                                              </Badge>
                                            ) : (
                                              <Badge variant="secondary" className="bg-warning/10 text-warning border-warning/20">
                                                A Pagar
                                              </Badge>
                                            )}
                                          </TableCell>
                                          <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-1">
                                              <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8"
                                                onClick={() => openEditModal(anotacao)}
                                              >
                                                <Pencil className="h-4 w-4" />
                                              </Button>
                                              <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-destructive hover:text-destructive"
                                                onClick={() => openDeleteDialog(anotacao)}
                                              >
                                                <Trash2 className="h-4 w-4" />
                                              </Button>
                                            </div>
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            ))
          )}
        </div>
      </div>

      {/* Payment Modal */}
      <Dialog open={showPaymentModal} onOpenChange={setShowPaymentModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Marcar Pagamento - {paymentFolguistaName}
              {paymentPeriodo && (
                <span className="block text-sm font-normal text-muted-foreground mt-1">
                  {MESES.find(m => m.value === paymentPeriodo.mes)?.label}/{paymentPeriodo.ano}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Selecione os dias a marcar como pago</Label>
              <div className="max-h-[200px] overflow-y-auto border rounded-lg p-2 space-y-2">
                {paymentPeriodo?.anotacoes
                  .filter(a => a.status === 'a_pagar')
                  .map(anotacao => (
                    <div key={anotacao.id} className="flex items-center gap-2">
                      <Checkbox
                        id={anotacao.id}
                        checked={selectedAnotacoes.includes(anotacao.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedAnotacoes([...selectedAnotacoes, anotacao.id]);
                          } else {
                            setSelectedAnotacoes(selectedAnotacoes.filter(id => id !== anotacao.id));
                          }
                        }}
                      />
                      <label htmlFor={anotacao.id} className="text-sm flex-1 cursor-pointer">
                        {format(new Date(anotacao.data_trabalho + 'T12:00:00'), 'dd/MM/yyyy')} - R$ {Number(anotacao.valor).toFixed(2)}
                      </label>
                    </div>
                  ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Data do Pagamento</Label>
              <Input
                type="date"
                value={dataPagamento}
                onChange={e => setDataPagamento(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Forma de Pagamento</Label>
              <Select value={formaPagamento} onValueChange={setFormaPagamento}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="transferencia">Transferência</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Total selecionado:</p>
              <p className="text-xl font-bold">
                R$ {paymentPeriodo?.anotacoes
                  .filter(a => selectedAnotacoes.includes(a.id))
                  .reduce((sum, a) => sum + Number(a.valor), 0)
                  .toFixed(2)}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleMarkAsPaid} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirmar Pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Finance Generation Modal */}
      <Dialog open={showFinanceModal} onOpenChange={setShowFinanceModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Gerar Despesa no Financeiro - {paymentFolguistaName}
              {paymentPeriodo && (
                <span className="block text-sm font-normal text-muted-foreground mt-1">
                  {MESES.find(m => m.value === paymentPeriodo.mes)?.label}/{paymentPeriodo.ano}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Selecione os dias para incluir na despesa</Label>
              <div className="max-h-[200px] overflow-y-auto border rounded-lg p-2 space-y-2">
                {paymentPeriodo?.anotacoes
                  .filter(a => !a.financeiro_despesa_id)
                  .map(anotacao => (
                    <div key={anotacao.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`fin-${anotacao.id}`}
                        checked={selectedAnotacoes.includes(anotacao.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedAnotacoes([...selectedAnotacoes, anotacao.id]);
                          } else {
                            setSelectedAnotacoes(selectedAnotacoes.filter(id => id !== anotacao.id));
                          }
                        }}
                      />
                      <label htmlFor={`fin-${anotacao.id}`} className="text-sm flex-1 cursor-pointer">
                        {format(new Date(anotacao.data_trabalho + 'T12:00:00'), 'dd/MM/yyyy')} - R$ {Number(anotacao.valor).toFixed(2)}
                        {anotacao.status === 'pago' && (
                          <Badge className="ml-2 text-xs" variant="secondary">Pago</Badge>
                        )}
                      </label>
                    </div>
                  ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Status da Despesa</Label>
              <Select value={financeStatus} onValueChange={(v: 'a_pagar' | 'pago') => setFinanceStatus(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="a_pagar">A Pagar (Pendente)</SelectItem>
                  <SelectItem value="pago">Pago</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="p-3 bg-muted rounded-lg space-y-1">
              <p className="text-sm text-muted-foreground">Valor da despesa:</p>
              <p className="text-xl font-bold">
                R$ {paymentPeriodo?.anotacoes
                  .filter(a => selectedAnotacoes.includes(a.id))
                  .reduce((sum, a) => sum + Number(a.valor), 0)
                  .toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground">
                Categoria: Folguistas
              </p>
            </div>

            <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
              <p className="text-sm text-primary">
                <strong>Anti-duplicação:</strong> Os dias selecionados serão vinculados à despesa gerada e não poderão ser incluídos em outra despesa.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFinanceModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleGenerateFinancialEntry} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Gerar Despesa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <Dialog open={showEditModal} onOpenChange={(open) => {
        setShowEditModal(open);
        if (!open) {
          setEditingAnotacao(null);
          resetForm();
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Dia Trabalhado</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Folguista *</Label>
              <Select value={selectedFolguista} onValueChange={(v) => {
                setSelectedFolguista(v);
                setSelectedPeriodo('');
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o folguista" />
                </SelectTrigger>
                <SelectContent>
                  {folguistas.map(f => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Período (Mês/Ano)</Label>
              {selectedFolguista && getAvailablePeriodosForFolguista(selectedFolguista).length > 0 ? (
                <Select value={selectedPeriodo || "none"} onValueChange={(v) => setSelectedPeriodo(v === "none" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o período" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem período</SelectItem>
                    {getAvailablePeriodosForFolguista(selectedFolguista).map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {MESES.find(m => m.value === p.periodo_mes)?.label}/{p.periodo_ano}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground p-3 bg-muted rounded-md">
                  Nenhum período disponível
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Data do Trabalho *</Label>
              <Input
                type="date"
                value={dataTrabalho}
                onChange={e => setDataTrabalho(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Local de Trabalho (opcional)</Label>
              <Select value={selectedLocal || "none"} onValueChange={(v) => setSelectedLocal(v === "none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o local" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {locations.map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Valor do Dia (R$) *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="Ex: 150.00"
                value={valor}
                onChange={e => setValor(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Observação (opcional)</Label>
              <Textarea
                placeholder="Adicione uma observação..."
                value={observacao}
                onChange={e => setObservacao(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleEditAnotacao} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este registro de dia trabalhado?
              {deletingAnotacao && (
                <span className="block mt-2 font-medium text-foreground">
                  Data: {format(new Date(deletingAnotacao.data_trabalho + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR })} - 
                  Valor: R$ {Number(deletingAnotacao.valor).toFixed(2)}
                </span>
              )}
              <span className="block mt-2">Esta ação não pode ser desfeita.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAnotacao}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Period Confirmation Dialog */}
      <AlertDialog open={showDeletePeriodoDialog} onOpenChange={setShowDeletePeriodoDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Período</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este período?
              {deletingPeriodo && (
                <span className="block mt-2 font-medium text-foreground">
                  {MESES.find(m => m.value === deletingPeriodo.mes)?.label}/{deletingPeriodo.ano}
                  {deletingPeriodo.totalDias > 0 && (
                    <span className="block text-warning mt-1">
                      ⚠️ {deletingPeriodo.totalDias} dia(s) de trabalho serão desvinculados deste período.
                    </span>
                  )}
                </span>
              )}
              <span className="block mt-2">Esta ação não pode ser desfeita.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePeriodo}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}
