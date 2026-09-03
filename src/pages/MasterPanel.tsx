import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  Building2, 
  Users, 
  Plus, 
  Edit, 
  Eye,
  Shield,
  Calendar,
  CreditCard,
  Loader2,
  Search,
  CheckCircle,
  XCircle,
  Clock,
  Ban,
  Mail,
  Phone,
  LogIn,
  Trash2,
  MessageSquare,
  Settings,
  Save,
  KeyRound
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useAuth } from '@/contexts/AuthContext';
import { MainLayout } from '@/components/layout/MainLayout';

interface Company {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  status: 'active' | 'inactive' | 'pending' | 'cancelled';
  payment_status: 'paid' | 'pending' | 'overdue';
  subscription_start_date?: string;
  subscription_end_date?: string;
  is_blocked: boolean;
  admin_user_id?: string;
  created_at: string;
  plan: 'essencial' | 'profissional' | 'empresarial';
  max_employees: number;
  max_locations: number;
}

const PLAN_CONFIG = {
  essencial: { label: 'Essencial', maxEmployees: 10, maxLocations: 5 },
  profissional: { label: 'Profissional', maxEmployees: 20, maxLocations: 10 },
  empresarial: { label: 'Empresarial', maxEmployees: 40, maxLocations: 20 },
};

interface MasterUser {
  id: string;
  user_id: string;
  created_at: string;
}

interface ZAPIConfig {
  id?: string;
  instance_id: string;
  token: string;
  client_token: string;
  is_active: boolean;
}

const STATUS_CONFIG = {
  active: { label: 'Ativa', color: 'bg-success/10 text-success', icon: CheckCircle },
  inactive: { label: 'Inativa', color: 'bg-muted text-muted-foreground', icon: XCircle },
  pending: { label: 'Pendente', color: 'bg-warning/10 text-warning', icon: Clock },
  cancelled: { label: 'Cancelada', color: 'bg-destructive/10 text-destructive', icon: Ban },
};

const PAYMENT_STATUS_CONFIG = {
  paid: { label: 'Pago', color: 'bg-success/10 text-success' },
  pending: { label: 'Pendente', color: 'bg-warning/10 text-warning' },
  overdue: { label: 'Vencido', color: 'bg-destructive/10 text-destructive' },
};

export default function MasterPanel() {
  const { user } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [masterUsers, setMasterUsers] = useState<MasterUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMaster, setIsMaster] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [masterDialogOpen, setMasterDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [companyForm, setCompanyForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    status: 'pending' as Company['status'],
    payment_status: 'pending' as Company['payment_status'],
    subscription_start_date: '',
    subscription_end_date: '',
    plan: 'essencial' as Company['plan'],
  });

  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // Reset-password dialog for a company's admin
  const [resetPwCompany, setResetPwCompany] = useState<Company | null>(null);
  const [resetPwValue, setResetPwValue] = useState('');
  const [resetPwSaving, setResetPwSaving] = useState(false);

  const handleResetCompanyPassword = async () => {
    if (!resetPwCompany) return;
    if (!resetPwCompany.email) {
      toast.error('Esta empresa não tem email de administrador cadastrado');
      return;
    }
    if (!resetPwValue || resetPwValue.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres');
      return;
    }
    setResetPwSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-company-admin', {
        body: {
          companyId: resetPwCompany.id,
          companyName: resetPwCompany.name,
          email: resetPwCompany.email,
          password: resetPwValue,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('Nova senha definida! Repasse ao cliente.');
      setResetPwCompany(null);
      setResetPwValue('');
    } catch (e: any) {
      console.error('Error resetting password:', e);
      toast.error(`Erro ao redefinir senha: ${e?.message || 'desconhecido'}`);
    } finally {
      setResetPwSaving(false);
    }
  };

  const [masterForm, setMasterForm] = useState({
    email: '',
  });

  const [zapiConfig, setZapiConfig] = useState<ZAPIConfig>({
    instance_id: '',
    token: '',
    client_token: '',
    is_active: true,
  });
  const [zapiSaving, setZapiSaving] = useState(false);

  const [evolutionConfig, setEvolutionConfig] = useState<{ id?: string; provider: 'evolution' | 'webhook'; base_url: string; api_key: string; instance: string; is_active: boolean }>({
    provider: 'evolution',
    base_url: '',
    api_key: '',
    instance: '',
    is_active: true,
  });
  const [evolutionSaving, setEvolutionSaving] = useState(false);

  // Conexão do número no agente da VPS (QR direto no painel)
  const [agentStatus, setAgentStatus] = useState<{ connected: boolean; qr?: string | null } | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);

  const checkAgent = async (silent = false) => {
    if (!silent) { setAgentBusy(true); setAgentError(null); }
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-agent', { body: { action: 'status' } });
      if (error) {
        let info: any = {};
        try { info = await (error as any).context?.json?.(); } catch { /* ignore */ }
        throw new Error(info?.error || error.message);
      }
      if ((data as any)?.error) throw new Error((data as any).error);
      setAgentStatus(data as any);
      setAgentError(null);
    } catch (e: any) {
      if (!silent) setAgentError(e?.message || 'Falha ao consultar o agente');
    } finally {
      if (!silent) setAgentBusy(false);
    }
  };

  const handleAgentLogout = async () => {
    if (!confirm('Desconectar o número atual? Os alertas param até você conectar o novo.')) return;
    setAgentBusy(true);
    setAgentError(null);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-agent', { body: { action: 'logout' } });
      if (error) {
        let info: any = {};
        try { info = await (error as any).context?.json?.(); } catch { /* ignore */ }
        throw new Error(info?.error || error.message);
      }
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success('Número desconectado. Aguarde o QR Code aparecer.');
      setAgentStatus({ connected: false, qr: null });
      setTimeout(() => checkAgent(true), 3000);
    } catch (e: any) {
      setAgentError(e?.message || 'Falha ao desconectar');
    } finally {
      setAgentBusy(false);
    }
  };

  // Enquanto houver QR na tela, atualiza sozinho (o código expira em ~20s)
  useEffect(() => {
    if (evolutionConfig.provider !== 'webhook') return;
    if (agentStatus?.connected !== false) return;
    const t = setInterval(() => checkAgent(true), 8000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentStatus?.connected, evolutionConfig.provider]);

  const loadEvolutionConfig = async () => {
    const { data } = await supabase.from('evolution_config').select('*').limit(1).maybeSingle();
    if (data) {
      setEvolutionConfig({
        id: data.id,
        provider: (data as any).provider === 'webhook' ? 'webhook' : 'evolution',
        base_url: data.base_url || '',
        api_key: data.api_key || '',
        instance: data.instance || '',
        is_active: data.is_active ?? true,
      });
    }
  };

  const handleSaveEvolution = async () => {
    if (!evolutionConfig.base_url || !evolutionConfig.api_key ||
        (evolutionConfig.provider === 'evolution' && !evolutionConfig.instance)) {
      toast.error('Preencha URL, API Key e Instância');
      return;
    }
    setEvolutionSaving(true);
    try {
      const payload = {
        provider: evolutionConfig.provider,
        base_url: evolutionConfig.base_url.trim(),
        api_key: evolutionConfig.api_key.trim(),
        instance: evolutionConfig.instance.trim(),
        is_active: evolutionConfig.is_active,
        updated_at: new Date().toISOString(),
      };
      if (evolutionConfig.id) {
        const { error } = await supabase.from('evolution_config').update(payload).eq('id', evolutionConfig.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('evolution_config').insert(payload).select('id').single();
        if (error) throw error;
        setEvolutionConfig((c) => ({ ...c, id: data.id }));
      }
      toast.success('Conexão de WhatsApp salva com sucesso!');
    } catch (e: any) {
      console.error('Error saving evolution config:', e);
      toast.error(`Erro ao salvar: ${e?.message || 'desconhecido'}`);
    } finally {
      setEvolutionSaving(false);
    }
  };

  useEffect(() => {
    checkMasterStatus();
  }, [user]);

  const checkMasterStatus = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('master_users')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      
      setIsMaster(!!data);
      
      if (data) {
        fetchData();
      }
    } catch (error) {
      console.error('Error checking master status:', error);
      setLoading(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [companiesRes, mastersRes, zapiRes] = await Promise.all([
        supabase.from('companies').select('*').order('name'),
        supabase.from('master_users').select('*'),
        supabase.from('zapi_config').select('*').limit(1).maybeSingle(),
      ]);

      if (companiesRes.error) throw companiesRes.error;
      if (mastersRes.error) throw mastersRes.error;

      setCompanies((companiesRes.data || []) as Company[]);
      setMasterUsers(mastersRes.data || []);
      
      if (zapiRes.data) {
        setZapiConfig({
          id: zapiRes.data.id,
          instance_id: zapiRes.data.instance_id || '',
          token: zapiRes.data.token || '',
          client_token: zapiRes.data.client_token || '',
          is_active: zapiRes.data.is_active ?? true,
        });
      }

      await loadEvolutionConfig();
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCompany = async () => {
    if (!companyForm.name) {
      toast.error('Nome da empresa é obrigatório');
      return;
    }

    const planConfig = PLAN_CONFIG[companyForm.plan];

    setSaving(true);
    try {
      // Insert company first
      const { data: companyData, error } = await supabase
        .from('companies')
        .insert({
          name: companyForm.name,
          email: companyForm.email || null,
          phone: companyForm.phone || null,
          status: companyForm.status,
          payment_status: companyForm.payment_status,
          subscription_start_date: companyForm.subscription_start_date || null,
          subscription_end_date: companyForm.subscription_end_date || null,
          plan: companyForm.plan,
          max_employees: planConfig.maxEmployees,
          max_locations: planConfig.maxLocations,
        })
        .select()
        .single();

      if (error) throw error;

      // Create admin user and send welcome email with password if email is provided
      if (companyForm.email && companyData) {
        try {
          const { data: adminResult, error: adminError } = await supabase.functions.invoke('create-company-admin', {
            body: {
              companyId: companyData.id,
              companyName: companyForm.name,
              email: companyForm.email,
              phone: companyForm.phone || undefined,
              password: companyForm.password || undefined,
            }
          });
          
          if (adminError) throw adminError;
          
          toast.success('Empresa criada e email com credenciais enviado!');
        } catch (emailError) {
          console.error('Error creating company admin:', emailError);
          toast.success('Empresa criada com sucesso (erro ao criar administrador)');
        }
      } else {
        toast.success('Empresa criada com sucesso');
      }

      setDialogOpen(false);
      setCompanyForm({
        name: '',
        email: '',
        phone: '',
        password: '',
        status: 'pending',
        payment_status: 'pending',
        subscription_start_date: '',
        subscription_end_date: '',
        plan: 'essencial',
      });
      fetchData();
    } catch (error) {
      console.error('Error saving company:', error);
      toast.error('Erro ao salvar empresa');
    } finally {
      setSaving(false);
    }
  };

  const handleEditCompany = (company: Company) => {
    setEditingCompany(company);
    setCompanyForm({
      name: company.name,
      email: company.email || '',
      phone: company.phone || '',
      status: company.status,
      payment_status: company.payment_status,
      subscription_start_date: company.subscription_start_date || '',
      subscription_end_date: company.subscription_end_date || '',
      plan: company.plan || 'essencial',
    });
    setEditDialogOpen(true);
  };

  const handleUpdateCompany = async () => {
    if (!editingCompany || !companyForm.name) {
      toast.error('Nome da empresa é obrigatório');
      return;
    }

    const planConfig = PLAN_CONFIG[companyForm.plan];

    setSaving(true);
    try {
      const { error } = await supabase
        .from('companies')
        .update({
          name: companyForm.name,
          email: companyForm.email || null,
          phone: companyForm.phone || null,
          status: companyForm.status,
          payment_status: companyForm.payment_status,
          subscription_start_date: companyForm.subscription_start_date || null,
          subscription_end_date: companyForm.subscription_end_date || null,
          plan: companyForm.plan,
          max_employees: planConfig.maxEmployees,
          max_locations: planConfig.maxLocations,
        })
        .eq('id', editingCompany.id);

      if (error) throw error;

      toast.success('Empresa atualizada com sucesso');
      setEditDialogOpen(false);
      setEditingCompany(null);
      setCompanyForm({
        name: '',
        email: '',
        phone: '',
        password: '',
        status: 'pending',
        payment_status: 'pending',
        subscription_start_date: '',
        subscription_end_date: '',
        plan: 'essencial',
      });
      fetchData();
    } catch (error) {
      console.error('Error updating company:', error);
      toast.error('Erro ao atualizar empresa');
    } finally {
      setSaving(false);
    }
  };

  const handleAccessCompany = async (company: Company) => {
    if (!company.email) {
      toast.error('Empresa não possui email cadastrado. Adicione um email para poder acessar.');
      return;
    }

    // Store impersonation state in localStorage
    localStorage.setItem('impersonating_company', JSON.stringify({
      id: company.id,
      name: company.name,
      email: company.email,
    }));
    
    toast.success(`Você está acessando a conta da empresa "${company.name}". Navegue normalmente pelo sistema.`);
    
    // Redirect to dashboard to view the company's data
    window.location.href = '/dashboard';
  };

  const handleUpdateStatus = async (companyId: string, status: Company['status']) => {
    try {
      const { error } = await supabase
        .from('companies')
        .update({ status, is_blocked: status !== 'active' })
        .eq('id', companyId);

      if (error) throw error;
      toast.success('Status atualizado');
      fetchData();
    } catch (error) {
      toast.error('Erro ao atualizar status');
    }
  };

  const handleAddMasterUser = async () => {
    if (!masterForm.email) {
      toast.error('Email é obrigatório');
      return;
    }

    setSaving(true);
    try {
      // Note: Adding master users requires direct database access
      toast.info('Para adicionar usuário master, insira o user_id diretamente na tabela master_users');
      setMasterDialogOpen(false);
    } catch (error: any) {
      console.error('Error adding master user:', error);
      toast.error(error.message || 'Erro ao adicionar usuário master');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCompany = async (companyId: string) => {
    try {
      // First delete related data
      // Get employees of this company with their user_ids
      const { data: employees, error: empFetchError } = await supabase
        .from('employees')
        .select('id, user_id')
        .eq('company_id', companyId);
      
      if (empFetchError) {
        console.error('Error fetching employees:', empFetchError);
        throw empFetchError;
      }
      
      if (employees && employees.length > 0) {
        const employeeIds = employees.map(e => e.id);
        const userIds = employees.map(e => e.user_id);
        
        // Delete anotacoes_folguista first (references employees)
        const { error: anotacoesError } = await supabase
          .from('anotacoes_folguista')
          .delete()
          .in('folguista_id', employeeIds);
        if (anotacoesError) console.error('Error deleting anotacoes_folguista:', anotacoesError);
        
        // Delete anotacoes_periodo (references employees)
        const { error: periodoError } = await supabase
          .from('anotacoes_periodo')
          .delete()
          .in('folguista_id', employeeIds);
        if (periodoError) console.error('Error deleting anotacoes_periodo:', periodoError);
        
        // Delete employee locations
        const { error: locError } = await supabase
          .from('employee_locations')
          .delete()
          .in('employee_id', employeeIds);
        if (locError) console.error('Error deleting employee_locations:', locError);
        
        // Delete fixed schedules
        const { error: fixedError } = await supabase
          .from('fixed_schedules')
          .delete()
          .in('employee_id', employeeIds);
        if (fixedError) console.error('Error deleting fixed_schedules:', fixedError);
        
        // Delete punctual schedules
        const { error: punctualError } = await supabase
          .from('punctual_schedules')
          .delete()
          .in('employee_id', employeeIds);
        if (punctualError) console.error('Error deleting punctual_schedules:', punctualError);
        
        // Delete clock records
        const { error: clockError } = await supabase
          .from('clock_records')
          .delete()
          .in('employee_id', employeeIds);
        if (clockError) console.error('Error deleting clock_records:', clockError);
        
        // Delete shift swaps (both as requester and target)
        const { error: swapsError1 } = await supabase
          .from('shift_swaps')
          .delete()
          .in('requester_employee_id', employeeIds);
        if (swapsError1) console.error('Error deleting shift_swaps (requester):', swapsError1);
        
        const { error: swapsError2 } = await supabase
          .from('shift_swaps')
          .delete()
          .in('target_employee_id', employeeIds);
        if (swapsError2) console.error('Error deleting shift_swaps (target):', swapsError2);
        
        // Delete lateness alerts
        const { error: latenessError } = await supabase
          .from('lateness_alerts')
          .delete()
          .in('employee_id', employeeIds);
        if (latenessError) console.error('Error deleting lateness_alerts:', latenessError);
        
        // Delete user_roles for these users
        const { error: rolesError } = await supabase
          .from('user_roles')
          .delete()
          .in('user_id', userIds);
        if (rolesError) console.error('Error deleting user_roles:', rolesError);
        
        // Delete employees
        const { error: empDelError } = await supabase
          .from('employees')
          .delete()
          .eq('company_id', companyId);
        
        if (empDelError) {
          console.error('Error deleting employees:', empDelError);
          throw empDelError;
        }
      }
      
      // Delete locations
      const { error: locationsError } = await supabase
        .from('locations')
        .delete()
        .eq('company_id', companyId);
      if (locationsError) console.error('Error deleting locations:', locationsError);
      
      // Delete notification recipients
      const { error: recipientsError } = await supabase
        .from('notification_recipients')
        .delete()
        .eq('company_id', companyId);
      if (recipientsError) console.error('Error deleting notification_recipients:', recipientsError);
      
      // Delete financial entries
      const { error: financialError } = await supabase
        .from('financial_entries')
        .delete()
        .eq('company_id', companyId);
      if (financialError) console.error('Error deleting financial_entries:', financialError);
      
      // Delete anotacoes by company_id (in case there are orphans)
      await supabase
        .from('anotacoes_folguista')
        .delete()
        .eq('company_id', companyId);
      
      await supabase
        .from('anotacoes_periodo')
        .delete()
        .eq('company_id', companyId);
      
      // Delete shift_swaps by company_id
      await supabase
        .from('shift_swaps')
        .delete()
        .eq('company_id', companyId);
      
      // Finally delete the company
      const { error } = await supabase
        .from('companies')
        .delete()
        .eq('id', companyId);

      if (error) throw error;
      
      toast.success('Empresa excluída com sucesso');
      fetchData();
    } catch (error: any) {
      console.error('Error deleting company:', error);
      toast.error('Erro ao excluir empresa: ' + error.message);
    }
  };

  const handleSaveZAPIConfig = async () => {
    if (!zapiConfig.instance_id || !zapiConfig.token) {
      toast.error('Instance ID e Token são obrigatórios');
      return;
    }

    setZapiSaving(true);
    try {
      if (zapiConfig.id) {
        // Update existing config
        const { error } = await supabase
          .from('zapi_config')
          .update({
            instance_id: zapiConfig.instance_id,
            token: zapiConfig.token,
            client_token: zapiConfig.client_token || null,
            is_active: zapiConfig.is_active,
          })
          .eq('id', zapiConfig.id);

        if (error) throw error;
      } else {
        // Insert new config
        const { data, error } = await supabase
          .from('zapi_config')
          .insert({
            instance_id: zapiConfig.instance_id,
            token: zapiConfig.token,
            client_token: zapiConfig.client_token || null,
            is_active: zapiConfig.is_active,
          })
          .select()
          .single();

        if (error) throw error;
        if (data) {
          setZapiConfig(prev => ({ ...prev, id: data.id }));
        }
      }

      toast.success('Configurações da Z-API salvas com sucesso!');
    } catch (error) {
      console.error('Error saving Z-API config:', error);
      toast.error('Erro ao salvar configurações');
    } finally {
      setZapiSaving(false);
    }
  };

  const filteredCompanies = companies.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isMaster) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <Card className="max-w-md w-full">
            <CardContent className="p-8 text-center">
              <Shield className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">Acesso Restrito</h2>
              <p className="text-muted-foreground">
                Este painel é exclusivo para usuários master.
              </p>
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    );
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-72" />
          </div>
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
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
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary" />
              Painel Master
            </h1>
            <p className="text-muted-foreground">
              Gerenciamento de empresas e usuários master
            </p>
          </div>
          <div className="flex gap-2">
            <Dialog open={masterDialogOpen} onOpenChange={setMasterDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Users className="h-4 w-4 mr-2" />
                  Novo Master
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Adicionar Usuário Master</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Email do Usuário</Label>
                    <Input
                      type="email"
                      value={masterForm.email}
                      onChange={(e) => setMasterForm({ email: e.target.value })}
                      placeholder="email@exemplo.com"
                    />
                  </div>
                  <Button onClick={handleAddMasterUser} disabled={saving} className="w-full">
                    {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Adicionar
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="glow">
                  <Plus className="h-4 w-4 mr-2" />
                  Nova Empresa
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Nova Empresa</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto">
                  <div className="space-y-2">
                    <Label>Nome da Empresa *</Label>
                    <Input
                      value={companyForm.name}
                      onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}
                      placeholder="Nome da empresa"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={companyForm.email}
                      onChange={(e) => setCompanyForm({ ...companyForm, email: e.target.value })}
                      placeholder="contato@empresa.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Telefone</Label>
                    <Input
                      value={companyForm.phone}
                      onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })}
                      placeholder="(11) 99999-9999"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Senha do Administrador</Label>
                    <Input
                      type="text"
                      value={companyForm.password}
                      onChange={(e) => setCompanyForm({ ...companyForm, password: e.target.value })}
                      placeholder="Deixe em branco para gerar automaticamente"
                    />
                    <p className="text-xs text-muted-foreground">
                      Senha de acesso do cliente. Mínimo 6 caracteres. Se vazio, o sistema gera uma.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Plano</Label>
                    <Select
                      value={companyForm.plan}
                      onValueChange={(value: Company['plan']) => setCompanyForm({ ...companyForm, plan: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="essencial">Essencial (10 func. / 5 locais)</SelectItem>
                        <SelectItem value="profissional">Profissional (20 func. / 10 locais)</SelectItem>
                        <SelectItem value="empresarial">Empresarial (40 func. / 20 locais)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select
                        value={companyForm.status}
                        onValueChange={(value: Company['status']) => setCompanyForm({ ...companyForm, status: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pendente</SelectItem>
                          <SelectItem value="active">Ativa</SelectItem>
                          <SelectItem value="inactive">Inativa</SelectItem>
                          <SelectItem value="cancelled">Cancelada</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Pagamento</Label>
                      <Select
                        value={companyForm.payment_status}
                        onValueChange={(value: Company['payment_status']) => setCompanyForm({ ...companyForm, payment_status: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pendente</SelectItem>
                          <SelectItem value="paid">Pago</SelectItem>
                          <SelectItem value="overdue">Vencido</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Início da Assinatura</Label>
                      <Input
                        type="date"
                        value={companyForm.subscription_start_date}
                        onChange={(e) => setCompanyForm({ ...companyForm, subscription_start_date: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Fim da Assinatura</Label>
                      <Input
                        type="date"
                        value={companyForm.subscription_end_date}
                        onChange={(e) => setCompanyForm({ ...companyForm, subscription_end_date: e.target.value })}
                      />
                    </div>
                  </div>
                  <Button onClick={handleSaveCompany} disabled={saving} className="w-full" variant="glow">
                    {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Criar Empresa
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Edit Company Dialog */}
            <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Editar Empresa</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto">
                  <div className="space-y-2">
                    <Label>Nome da Empresa *</Label>
                    <Input
                      value={companyForm.name}
                      onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}
                      placeholder="Nome da empresa"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={companyForm.email}
                      onChange={(e) => setCompanyForm({ ...companyForm, email: e.target.value })}
                      placeholder="contato@empresa.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Telefone</Label>
                    <Input
                      value={companyForm.phone}
                      onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })}
                      placeholder="(11) 99999-9999"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Plano</Label>
                    <Select
                      value={companyForm.plan}
                      onValueChange={(value: Company['plan']) => setCompanyForm({ ...companyForm, plan: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="essencial">Essencial (10 func. / 5 locais)</SelectItem>
                        <SelectItem value="profissional">Profissional (20 func. / 10 locais)</SelectItem>
                        <SelectItem value="empresarial">Empresarial (40 func. / 20 locais)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select
                        value={companyForm.status}
                        onValueChange={(value: Company['status']) => setCompanyForm({ ...companyForm, status: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pendente</SelectItem>
                          <SelectItem value="active">Ativa</SelectItem>
                          <SelectItem value="inactive">Inativa</SelectItem>
                          <SelectItem value="cancelled">Cancelada</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Pagamento</Label>
                      <Select
                        value={companyForm.payment_status}
                        onValueChange={(value: Company['payment_status']) => setCompanyForm({ ...companyForm, payment_status: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pendente</SelectItem>
                          <SelectItem value="paid">Pago</SelectItem>
                          <SelectItem value="overdue">Vencido</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Início da Assinatura</Label>
                      <Input
                        type="date"
                        value={companyForm.subscription_start_date}
                        onChange={(e) => setCompanyForm({ ...companyForm, subscription_start_date: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Fim da Assinatura</Label>
                      <Input
                        type="date"
                        value={companyForm.subscription_end_date}
                        onChange={(e) => setCompanyForm({ ...companyForm, subscription_end_date: e.target.value })}
                      />
                    </div>
                  </div>
                  <Button onClick={handleUpdateCompany} disabled={saving} className="w-full" variant="glow">
                    {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Salvar Alterações
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Tabs for different sections */}
        <Tabs defaultValue="companies" className="space-y-6">
          <TabsList>
            <TabsTrigger value="companies" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Empresas
            </TabsTrigger>
            <TabsTrigger value="zapi" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Z-API (WhatsApp)
            </TabsTrigger>
          </TabsList>

          <TabsContent value="companies" className="space-y-6">
            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card variant="glass">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <Building2 className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Empresas</p>
                      <p className="text-2xl font-bold font-mono tabular-nums">{companies.length}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card variant="glass">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-success/10 flex items-center justify-center">
                      <CheckCircle className="h-6 w-6 text-success" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Ativas</p>
                      <p className="text-2xl font-bold font-mono tabular-nums">{companies.filter(c => c.status === 'active').length}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card variant="glass">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-warning/10 flex items-center justify-center">
                      <CreditCard className="h-6 w-6 text-warning" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Pagamento Pendente</p>
                      <p className="text-2xl font-bold font-mono tabular-nums">{companies.filter(c => c.payment_status === 'pending').length}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card variant="glass">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-accent/10 flex items-center justify-center">
                      <Shield className="h-6 w-6 text-accent" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Usuários Master</p>
                      <p className="text-2xl font-bold font-mono tabular-nums">{masterUsers.length}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Search */}
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar empresas..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Companies List */}
            <div className="grid gap-4">
          {filteredCompanies.map((company) => {
            const statusConfig = STATUS_CONFIG[company.status];
            const paymentConfig = PAYMENT_STATUS_CONFIG[company.payment_status];
            const StatusIcon = statusConfig.icon;

            return (
              <Card key={company.id} variant="interactive">
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Building2 className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg">{company.name}</h3>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <Badge className={statusConfig.color}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {statusConfig.label}
                          </Badge>
                          <Badge className={paymentConfig.color}>
                            <CreditCard className="h-3 w-3 mr-1" />
                            {paymentConfig.label}
                          </Badge>
                          {company.is_blocked && (
                            <Badge variant="destructive">
                              <Ban className="h-3 w-3 mr-1" />
                              Bloqueada
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
                          {company.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {company.email}
                            </span>
                          )}
                          {company.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {company.phone}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-4 mt-1 text-sm text-muted-foreground">
                          {company.subscription_start_date && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Início: {format(parseISO(company.subscription_start_date), 'dd/MM/yyyy')}
                            </span>
                          )}
                          {company.subscription_end_date && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Vencimento: {format(parseISO(company.subscription_end_date), 'dd/MM/yyyy')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Select
                        value={company.status}
                        onValueChange={(value: Company['status']) => handleUpdateStatus(company.id, value)}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pendente</SelectItem>
                          <SelectItem value="active">Ativa</SelectItem>
                          <SelectItem value="inactive">Inativa</SelectItem>
                          <SelectItem value="cancelled">Cancelada</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button 
                        variant="outline" 
                        size="icon"
                        onClick={() => handleEditCompany(company)}
                        title="Editar empresa"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleAccessCompany(company)}
                        title="Acessar conta"
                      >
                        <LogIn className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => { setResetPwCompany(company); setResetPwValue(''); }}
                        title="Gerar nova senha para o cliente"
                      >
                        <KeyRound className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button 
                            variant="outline" 
                            size="icon"
                            className="text-destructive hover:bg-destructive/10"
                            title="Excluir empresa"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir empresa?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta ação não pode ser desfeita. Todos os dados da empresa <strong>{company.name}</strong> serão permanentemente excluídos, incluindo funcionários, escalas, registros de ponto e configurações.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteCompany(company.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

              {filteredCompanies.length === 0 && (
                <Card>
                  <CardContent className="p-12 text-center">
                    <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium">Nenhuma empresa encontrada</h3>
                    <p className="text-muted-foreground">
                      Crie uma nova empresa para começar.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="zapi" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Conexão de WhatsApp
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-muted/50 p-4 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    De onde saem as mensagens (notificações de ponto, alertas de atraso
                    e resumo diário). Trocar de provedor aqui vale na hora — nenhuma
                    função precisa ser reimplantada.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Provedor</Label>
                  <Select
                    value={evolutionConfig.provider}
                    onValueChange={(v: 'evolution' | 'webhook') =>
                      setEvolutionConfig({ ...evolutionConfig, provider: v })
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="evolution">Evolution API</SelectItem>
                      <SelectItem value="webhook">Meu agente (VPS)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{evolutionConfig.provider === 'webhook' ? 'URL do endpoint de envio' : 'URL da API'}</Label>
                  <Input
                    placeholder={evolutionConfig.provider === 'webhook' ? 'https://sua-vps.com:3001/send' : 'http://SEU_IP:8080'}
                    value={evolutionConfig.base_url}
                    onChange={(e) => setEvolutionConfig({ ...evolutionConfig, base_url: e.target.value })}
                  />
                  {evolutionConfig.provider === 'webhook' && (
                    <p className="text-xs text-muted-foreground">
                      URL completa. Recebe POST com <code>{'{ phone, message }'}</code> e deve responder 2xx quando enviar.
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>{evolutionConfig.provider === 'webhook' ? 'Token de acesso' : 'API Key'}</Label>
                  <Input
                    placeholder={evolutionConfig.provider === 'webhook' ? 'Token secreto do seu agente' : 'Sua chave global da Evolution'}
                    value={evolutionConfig.api_key}
                    onChange={(e) => setEvolutionConfig({ ...evolutionConfig, api_key: e.target.value })}
                  />
                  {evolutionConfig.provider === 'webhook' && (
                    <p className="text-xs text-muted-foreground">
                      Enviado no header <code>Authorization: Bearer …</code>
                    </p>
                  )}
                </div>
                {evolutionConfig.provider === 'evolution' && (
                  <div className="space-y-2">
                    <Label>Instância</Label>
                    <Input
                      placeholder="Nome da instância (ex: PontaZap)"
                      value={evolutionConfig.instance}
                      onChange={(e) => setEvolutionConfig({ ...evolutionConfig, instance: e.target.value })}
                    />
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="evolution-active"
                    checked={evolutionConfig.is_active}
                    onCheckedChange={(checked) => setEvolutionConfig({ ...evolutionConfig, is_active: checked as boolean })}
                  />
                  <Label htmlFor="evolution-active">Ativa</Label>
                </div>
                <Button onClick={handleSaveEvolution} disabled={evolutionSaving} className="w-full">
                  {evolutionSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Salvar conexão
                </Button>
              </CardContent>
            </Card>

            {/* Número conectado no agente da VPS — ler QR sem abrir o terminal */}
            {evolutionConfig.provider === 'webhook' && evolutionConfig.id && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Phone className="h-5 w-5" />
                    Número do WhatsApp
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      {agentStatus === null ? (
                        <span className="text-sm text-muted-foreground">Status desconhecido</span>
                      ) : agentStatus.connected ? (
                        <Badge className="bg-success/10 text-success">Conectado</Badge>
                      ) : (
                        <Badge className="bg-warning/10 text-warning">Desconectado</Badge>
                      )}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => checkAgent()} disabled={agentBusy}>
                      {agentBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                      Verificar
                    </Button>
                  </div>

                  {agentError && (
                    <p className="text-sm text-destructive">{agentError}</p>
                  )}

                  {agentStatus && !agentStatus.connected && agentStatus.qr && (
                    <div className="text-center space-y-2">
                      <p className="text-sm text-muted-foreground">
                        No celular: WhatsApp → Dispositivos conectados → Conectar dispositivo,
                        e aponte para o código abaixo.
                      </p>
                      <img
                        src={agentStatus.qr}
                        alt="QR Code para conectar o WhatsApp"
                        className="mx-auto w-56 h-56 rounded-lg border border-border bg-white p-2"
                      />
                      <p className="text-xs text-muted-foreground">
                        O código muda a cada ~20s — esta tela atualiza sozinha.
                      </p>
                    </div>
                  )}

                  {agentStatus?.connected && (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={handleAgentLogout}
                      disabled={agentBusy}
                    >
                      {agentBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                      Conectar outro número
                    </Button>
                  )}

                  <p className="text-xs text-muted-foreground">
                    Trocar o número desconecta o atual na hora. Os alertas voltam a sair assim
                    que o novo for conectado.
                  </p>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Configurações da Z-API (WhatsApp) — legado
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="bg-muted/50 p-4 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    Configure as credenciais da Z-API para envio de notificações via WhatsApp. 
                    Acesse <a href="https://z-api.io" target="_blank" rel="noopener noreferrer" className="text-primary underline">z-api.io</a> para obter suas credenciais.
                  </p>
                </div>

                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label>Instance ID *</Label>
                    <Input
                      value={zapiConfig.instance_id}
                      onChange={(e) => setZapiConfig({ ...zapiConfig, instance_id: e.target.value })}
                      placeholder="Seu Instance ID da Z-API"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Token *</Label>
                    <Input
                      type="password"
                      value={zapiConfig.token}
                      onChange={(e) => setZapiConfig({ ...zapiConfig, token: e.target.value })}
                      placeholder="Seu Token da Z-API"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Client Token (Token de Segurança)</Label>
                    <Input
                      type="password"
                      value={zapiConfig.client_token}
                      onChange={(e) => setZapiConfig({ ...zapiConfig, client_token: e.target.value })}
                      placeholder="Token de segurança da conta (opcional)"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="zapi-active"
                      checked={zapiConfig.is_active}
                      onChange={(e) => setZapiConfig({ ...zapiConfig, is_active: e.target.checked })}
                      className="rounded border-input"
                    />
                    <Label htmlFor="zapi-active" className="cursor-pointer">
                      Ativar envio de notificações WhatsApp
                    </Label>
                  </div>
                </div>

                <Button 
                  onClick={handleSaveZAPIConfig} 
                  disabled={zapiSaving}
                  variant="glow"
                >
                  {zapiSaving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Salvar Configurações
                </Button>

                {zapiConfig.id && (
                  <div className="flex items-center gap-2 text-sm">
                    <Badge className={zapiConfig.is_active ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}>
                      {zapiConfig.is_active ? (
                        <>
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Configurado e Ativo
                        </>
                      ) : (
                        <>
                          <XCircle className="h-3 w-3 mr-1" />
                          Desativado
                        </>
                      )}
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Reset admin password dialog */}
        <Dialog open={!!resetPwCompany} onOpenChange={(open) => { if (!open) { setResetPwCompany(null); setResetPwValue(''); } }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5" />
                Nova senha do cliente
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                Defina uma nova senha para <strong>{resetPwCompany?.name}</strong>
                {resetPwCompany?.email ? ` (${resetPwCompany.email})` : ''}. Repasse ao cliente.
              </p>
              <div className="space-y-2">
                <Label>Nova Senha</Label>
                <Input
                  type="text"
                  value={resetPwValue}
                  onChange={(e) => setResetPwValue(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
              <Button className="w-full" onClick={handleResetCompanyPassword} disabled={resetPwSaving}>
                {resetPwSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Definir Nova Senha
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
