import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Search, User, MoreVertical, Edit, Trash2, MapPin, History, Loader2, Clock, Plus, Users } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useEmployees, EmployeeWithProfile } from '@/hooks/useEmployees';
import { useLocations } from '@/hooks/useLocations';
import { useCompanyLimits } from '@/hooks/useCompanyLimits';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { getImpersonatedCompanyId } from '@/components/ImpersonationBar';

export default function Employees() {
  const navigate = useNavigate();
  const { employees, loading, updateEmployee, assignLocations, deleteEmployee, refetch } = useEmployees();
  const { locations } = useLocations();
  const { limits } = useCompanyLimits();
  const [searchTerm, setSearchTerm] = useState('');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [locationsDialogOpen, setLocationsDialogOpen] = useState(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeWithProfile | null>(null);
  const [saving, setSaving] = useState(false);

  const [createForm, setCreateForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    type: 'fixed' as 'fixed' | 'substitute',
    selectedLocations: [] as string[],
    primaryLocation: '',
    cpf: '',
    pis: '',
    admission_date: '',
    position: '',
    department: '',
    valor_diaria: null as number | null,
  });

  const [editForm, setEditForm] = useState({
    type: 'fixed' as 'fixed' | 'substitute',
    is_active: true,
    valor_diaria: null as number | null,
    cpf: '',
    pis: '',
    admission_date: '',
    position: '',
    department: '',
  });

  const [scheduleForm, setScheduleForm] = useState({
    work_start_time: '08:00',
    work_end_time: '17:00',
    lunch_duration_minutes: 60,
    count_early_entry_as_extra: false,
    overtime_compensation_mode: 'cash' as 'cash' | 'time_off',
    overtime_rate: null as number | null,
  });

  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [primaryLocation, setPrimaryLocation] = useState<string>('');

  const filteredEmployees = employees.filter(
    (emp) =>
      (emp.profile?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (emp.profile?.email || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDelete = async (employee: EmployeeWithProfile) => {
    const name = employee.profile?.name || 'Funcionário';
    if (confirm(`Remover "${name}"?`)) {
      await deleteEmployee(employee.id);
    }
  };

  const openEditDialog = (employee: EmployeeWithProfile) => {
    setSelectedEmployee(employee);
    setEditForm({
      type: employee.type,
      is_active: employee.is_active,
      valor_diaria: (employee as any).valor_diaria ?? null,
      cpf: (employee as any).cpf ?? '',
      pis: (employee as any).pis ?? '',
      admission_date: (employee as any).admission_date ?? '',
      position: (employee as any).position ?? '',
      department: (employee as any).department ?? '',
    });
    setEditDialogOpen(true);
  };

  const openLocationsDialog = (employee: EmployeeWithProfile) => {
    setSelectedEmployee(employee);
    const empLocations = employee.locations || [];
    setSelectedLocations(empLocations.map(l => l.location_id));
    const primary = empLocations.find(l => l.is_primary);
    setPrimaryLocation(primary?.location_id || '');
    setLocationsDialogOpen(true);
  };

  const openScheduleDialog = (employee: EmployeeWithProfile) => {
    setSelectedEmployee(employee);
    setScheduleForm({
      work_start_time: (employee as any).work_start_time?.substring(0, 5) || '08:00',
      work_end_time: (employee as any).work_end_time?.substring(0, 5) || '17:00',
      lunch_duration_minutes: (employee as any).lunch_duration_minutes || 60,
      count_early_entry_as_extra: (employee as any).count_early_entry_as_extra || false,
      overtime_compensation_mode: (employee as any).overtime_compensation_mode || 'cash',
      overtime_rate: (employee as any).overtime_rate || null,
    });
    setScheduleDialogOpen(true);
  };

  const handleSaveSchedule = async () => {
    if (!selectedEmployee) return;
    setSaving(true);
    try {
      await updateEmployee(selectedEmployee.id, {
        work_start_time: scheduleForm.work_start_time + ':00',
        work_end_time: scheduleForm.work_end_time + ':00',
        lunch_duration_minutes: scheduleForm.lunch_duration_minutes,
        count_early_entry_as_extra: scheduleForm.count_early_entry_as_extra,
        overtime_compensation_mode: scheduleForm.overtime_compensation_mode,
        overtime_rate: scheduleForm.overtime_rate,
      });
      setScheduleDialogOpen(false);
      setSelectedEmployee(null);
      toast.success('Jornada atualizada com sucesso');
    } catch (error) {
      toast.error('Erro ao salvar jornada');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!selectedEmployee) return;
    setSaving(true);
    try {
      // Empty strings must become null (admission_date is a DATE column)
      const payload: any = {
        type: editForm.type,
        is_active: editForm.is_active,
        valor_diaria: editForm.valor_diaria,
        cpf: editForm.cpf || null,
        pis: editForm.pis || null,
        admission_date: editForm.admission_date || null,
        position: editForm.position || null,
        department: editForm.department || null,
      };
      await updateEmployee(selectedEmployee.id, payload);
      setEditDialogOpen(false);
      setSelectedEmployee(null);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveLocations = async () => {
    if (!selectedEmployee) return;
    setSaving(true);
    try {
      await assignLocations(selectedEmployee.id, selectedLocations, primaryLocation || undefined);
      setLocationsDialogOpen(false);
      setSelectedEmployee(null);
    } finally {
      setSaving(false);
    }
  };

  const toggleLocation = (locationId: string) => {
    if (selectedLocations.includes(locationId)) {
      setSelectedLocations(selectedLocations.filter(id => id !== locationId));
      if (primaryLocation === locationId) {
        setPrimaryLocation('');
      }
    } else {
      setSelectedLocations([...selectedLocations, locationId]);
    }
  };

  const toggleCreateLocation = (locationId: string) => {
    if (createForm.selectedLocations.includes(locationId)) {
      setCreateForm({
        ...createForm,
        selectedLocations: createForm.selectedLocations.filter(id => id !== locationId),
        primaryLocation: createForm.primaryLocation === locationId ? '' : createForm.primaryLocation,
      });
    } else {
      setCreateForm({
        ...createForm,
        selectedLocations: [...createForm.selectedLocations, locationId],
      });
    }
  };

  const handleCreateEmployee = async () => {
    if (!createForm.name.trim() || !createForm.email.trim()) {
      toast.error('Nome e email são obrigatórios');
      return;
    }

    if (!createForm.password.trim() || createForm.password.length < 6) {
      toast.error('Senha é obrigatória (mínimo 6 caracteres)');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(createForm.email)) {
      toast.error('Email inválido');
      return;
    }

    setSaving(true);
    try {
      const impersonatedCompanyId = getImpersonatedCompanyId();

      const { data, error } = await supabase.functions.invoke('invite-employee', {
        body: {
          email: createForm.email.trim().toLowerCase(),
          name: createForm.name.trim(),
          phone: createForm.phone.trim() || undefined,
          password: createForm.password,
          type: createForm.type,
          locationIds: createForm.selectedLocations,
          primaryLocationId: createForm.primaryLocation || undefined,
          // Quando estiver em Modo Suporte (MASTER), garantimos que o backend saiba
          // em qual empresa o funcionário deve ser criado.
          companyId: impersonatedCompanyId || undefined,
          cpf: createForm.cpf.trim() || undefined,
          pis: createForm.pis.trim() || undefined,
          admissionDate: createForm.admission_date || undefined,
          position: createForm.position.trim() || undefined,
          department: createForm.department.trim() || undefined,
          valorDiaria: createForm.type === 'substitute' ? createForm.valor_diaria : undefined,
        },
      });

      if (error) {
        // supabase-js gives a generic "non-2xx status code" message; the real
        // reason is in the response body the function returned.
        let detail = error.message;
        try {
          const body = await (error as any).context?.json?.();
          if (body?.error) detail = body.error;
        } catch { /* ignore */ }
        throw new Error(detail);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      toast.success(data.message || `Funcionário criado com sucesso`);
      setCreateDialogOpen(false);
      setCreateForm({
        name: '',
        email: '',
        phone: '',
        password: '',
        type: 'fixed',
        selectedLocations: [],
        primaryLocation: '',
        cpf: '',
        pis: '',
        admission_date: '',
        position: '',
        department: '',
        valor_diaria: null,
      });
      refetch();
    } catch (error: any) {
      console.error('Error creating employee:', error);
      toast.error(error.message || 'Erro ao criar funcionário');
    } finally {
      setSaving(false);
    }
  };

  const viewHistory = (employee: EmployeeWithProfile) => {
    navigate(`/employee-history/${employee.id}`);
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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl lg:text-3xl font-bold text-foreground">
                Funcionários
              </h1>
              {limits && (
                <Badge variant="outline" className="flex items-center gap-1.5 px-3 py-1">
                  <Users className="h-3.5 w-3.5" />
                  <span className="font-medium">{employees.filter(e => e.is_active).length}/{limits.maxEmployees}</span>
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-1">
              Gerencie os funcionários da empresa
            </p>
          </div>
          <Button variant="glow" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Funcionário
          </Button>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar funcionários..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Employees List */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredEmployees.map((employee, index) => {
            const primaryLoc = employee.locations?.find(l => l.is_primary)?.location;
            const locationCount = employee.locations?.length || 0;

            return (
              <Card
                key={employee.id}
                variant="interactive"
                className={`animate-slide-up cursor-pointer ${
                  !employee.invitation_accepted ? 'border-2 border-yellow-400 bg-yellow-50/50 dark:bg-yellow-900/10' : ''
                }`}
                style={{ animationDelay: `${index * 50}ms` }}
                onClick={() => viewHistory(employee)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-lg">
                        {(employee.profile?.name || 'U').charAt(0)}
                      </div>
                      <div>
                        <h3 className="font-semibold">{employee.profile?.name || 'Sem nome'}</h3>
                        <p className="text-sm text-muted-foreground">{employee.profile?.email || ''}</p>
                      </div>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); viewHistory(employee); }}>
                          <History className="h-4 w-4 mr-2" />
                          Ver Histórico
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openLocationsDialog(employee); }}>
                          <MapPin className="h-4 w-4 mr-2" />
                          Locais de Trabalho
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openScheduleDialog(employee); }}>
                          <Clock className="h-4 w-4 mr-2" />
                          Jornada de Trabalho
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEditDialog(employee); }}>
                          <Edit className="h-4 w-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={(e) => { e.stopPropagation(); handleDelete(employee); }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Remover
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mt-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                        employee.type === 'fixed'
                          ? 'bg-primary/10 text-primary'
                          : 'bg-accent/10 text-accent'
                      }`}
                    >
                      {employee.type === 'fixed' ? 'Fixo' : 'Folguista'}
                    </span>
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                        employee.is_active
                          ? 'bg-success/10 text-success'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {employee.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                    {!employee.invitation_accepted && (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                        Convite Pendente
                      </span>
                    )}
                  </div>

                  <div className="mt-3 pt-3 border-t border-border">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4" />
                      <span>
                        {locationCount > 0
                          ? (primaryLoc?.name || employee.locations?.[0]?.location?.name || 'Local não definido')
                          : 'Sem local associado'}
                        {locationCount > 1 && ` (+${locationCount - 1})`}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {filteredEmployees.length === 0 && (
          <Card variant="default">
            <CardContent className="py-12 text-center">
              <User className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold">Nenhum funcionário encontrado</h3>
              <p className="text-muted-foreground mt-1">
                Ajuste sua busca ou aguarde o cadastro de funcionários.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Edit Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={(open) => { setEditDialogOpen(open); if (!open) setSelectedEmployee(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Funcionário</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={selectedEmployee?.profile?.name || ''} disabled />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={selectedEmployee?.profile?.email || ''} disabled />
              </div>
              <div className="space-y-2">
                <Label>Telefone (WhatsApp)</Label>
                <Input value={selectedEmployee?.profile?.phone || 'Não informado'} disabled />
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select
                  value={editForm.type}
                  onValueChange={(value: 'fixed' | 'substitute') =>
                    setEditForm({ ...editForm, type: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Fixo</SelectItem>
                    <SelectItem value="substitute">Folguista</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editForm.type === 'substitute' && (
                <div className="space-y-2">
                  <Label>Valor por Dia (R$)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Ex: 150.00"
                    value={editForm.valor_diaria ?? ''}
                    onChange={(e) =>
                      setEditForm({ ...editForm, valor_diaria: e.target.value ? Number(e.target.value) : null })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Valor usado para gerar o registro de pagamento automaticamente ao bater ponto de entrada.
                  </p>
                </div>
              )}

              {/* Dados legais (Portaria 671 / espelho de ponto) */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>CPF</Label>
                  <Input
                    placeholder="000.000.000-00"
                    value={editForm.cpf}
                    onChange={(e) => setEditForm({ ...editForm, cpf: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>PIS</Label>
                  <Input
                    placeholder="000.00000.00-0"
                    value={editForm.pis}
                    onChange={(e) => setEditForm({ ...editForm, pis: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Data de Admissão</Label>
                <Input
                  type="date"
                  value={editForm.admission_date}
                  onChange={(e) => setEditForm({ ...editForm, admission_date: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Cargo</Label>
                  <Input
                    placeholder="Ex: Porteiro"
                    value={editForm.position}
                    onChange={(e) => setEditForm({ ...editForm, position: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Setor</Label>
                  <Input
                    placeholder="Ex: Portaria"
                    value={editForm.department}
                    onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is_active"
                  checked={editForm.is_active}
                  onCheckedChange={(checked) =>
                    setEditForm({ ...editForm, is_active: checked as boolean })
                  }
                />
                <Label htmlFor="is_active">Funcionário ativo</Label>
              </div>
              <Button className="w-full" onClick={handleSaveEdit} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Locations Dialog */}
        <Dialog open={locationsDialogOpen} onOpenChange={(open) => { setLocationsDialogOpen(open); if (!open) setSelectedEmployee(null); }}>
          <DialogContent className="max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Locais de Trabalho</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <p className="text-sm text-muted-foreground">
                Selecione os locais onde este funcionário pode registrar ponto. A associação é opcional.
              </p>

              {locations.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">
                  Nenhum local cadastrado
                </p>
              ) : (
                <div className="space-y-2">
                  {locations.map((location) => (
                    <div
                      key={location.id}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        selectedLocations.includes(location.id)
                          ? 'border-primary bg-primary/5'
                          : 'border-border'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={selectedLocations.includes(location.id)}
                          onCheckedChange={() => toggleLocation(location.id)}
                        />
                        <div>
                          <p className="font-medium">{location.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Raio: {location.radius}m
                          </p>
                        </div>
                      </div>
                      {selectedLocations.includes(location.id) && selectedLocations.length > 1 && (
                        <Button
                          variant={primaryLocation === location.id ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setPrimaryLocation(location.id)}
                        >
                          {primaryLocation === location.id ? 'Principal' : 'Definir principal'}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <Button className="w-full" onClick={handleSaveLocations} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Schedule Dialog */}
        <Dialog open={scheduleDialogOpen} onOpenChange={(open) => { setScheduleDialogOpen(open); if (!open) setSelectedEmployee(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Jornada de Trabalho</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <p className="text-sm text-muted-foreground">
                Configure a jornada padrão para cálculo automático de horas extras.
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Entrada</Label>
                  <Input
                    type="time"
                    value={scheduleForm.work_start_time}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, work_start_time: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Saída</Label>
                  <Input
                    type="time"
                    value={scheduleForm.work_end_time}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, work_end_time: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Duração do almoço (minutos)</Label>
                <Input
                  type="number"
                  min="0"
                  max="180"
                  value={scheduleForm.lunch_duration_minutes}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, lunch_duration_minutes: parseInt(e.target.value) || 0 })}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="count_early"
                  checked={scheduleForm.count_early_entry_as_extra}
                  onCheckedChange={(checked) =>
                    setScheduleForm({ ...scheduleForm, count_early_entry_as_extra: checked as boolean })
                  }
                />
                <Label htmlFor="count_early">Contar entrada antecipada como hora extra</Label>
              </div>

              <div className="space-y-2">
                <Label>Compensação de Horas Extras</Label>
                <Select
                  value={scheduleForm.overtime_compensation_mode}
                  onValueChange={(value: 'cash' | 'time_off') =>
                    setScheduleForm({ ...scheduleForm, overtime_compensation_mode: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">💰 Pagamento em dinheiro</SelectItem>
                    <SelectItem value="time_off">🏖️ Banco de horas (folga)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {scheduleForm.overtime_compensation_mode === 'cash'
                    ? 'Horas extras serão pagas com base no valor/hora definido'
                    : 'Horas extras serão acumuladas para conversão em folgas. 8h extras = 1 folga (jornada 8h) ou 12h extras = 1 folga (jornada 12h)'}
                </p>
              </div>

              {scheduleForm.overtime_compensation_mode === 'cash' && (
                <div className="space-y-2">
                  <Label>Valor da hora extra (R$)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Ex: 25.00"
                    value={scheduleForm.overtime_rate || ''}
                    onChange={(e) => setScheduleForm({ 
                      ...scheduleForm, 
                      overtime_rate: e.target.value ? parseFloat(e.target.value) : null 
                    })}
                  />
                </div>
              )}

              <Button className="w-full" onClick={handleSaveSchedule} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Create Employee Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Novo Funcionário</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <p className="text-sm text-muted-foreground">
                Preencha os dados do funcionário e crie uma senha para ele.
              </p>

              <div className="space-y-2">
                <Label htmlFor="emp-name">Nome *</Label>
                <Input
                  id="emp-name"
                  placeholder="Nome completo"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="emp-email">Email *</Label>
                <Input
                  id="emp-email"
                  type="email"
                  placeholder="email@exemplo.com"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="emp-password">Senha *</Label>
                <Input
                  id="emp-password"
                  type="text"
                  placeholder="Mínimo 6 caracteres"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Você passará esta senha para o funcionário acessar o sistema.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="emp-phone">WhatsApp (para alertas)</Label>
                <Input
                  id="emp-phone"
                  type="tel"
                  placeholder="5521999999999"
                  value={createForm.phone}
                  onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Formato: código do país + DDD + número. Ex: 5521999999999
                </p>
              </div>

              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select
                  value={createForm.type}
                  onValueChange={(value: 'fixed' | 'substitute') =>
                    setCreateForm({ ...createForm, type: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Fixo</SelectItem>
                    <SelectItem value="substitute">Folguista</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {createForm.type === 'substitute' && (
                <div className="space-y-2">
                  <Label>Valor por Dia (R$)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Ex: 150.00"
                    value={createForm.valor_diaria ?? ''}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, valor_diaria: e.target.value ? Number(e.target.value) : null })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Lançado automaticamente como diária quando o folguista bate entrada.
                  </p>
                </div>
              )}

              {/* Dados legais (Portaria 671 / espelho de ponto) */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>CPF</Label>
                  <Input
                    placeholder="000.000.000-00"
                    value={createForm.cpf}
                    onChange={(e) => setCreateForm({ ...createForm, cpf: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>PIS</Label>
                  <Input
                    placeholder="000.00000.00-0"
                    value={createForm.pis}
                    onChange={(e) => setCreateForm({ ...createForm, pis: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Data de Admissão</Label>
                <Input
                  type="date"
                  value={createForm.admission_date}
                  onChange={(e) => setCreateForm({ ...createForm, admission_date: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Cargo</Label>
                  <Input
                    placeholder="Ex: Porteiro"
                    value={createForm.position}
                    onChange={(e) => setCreateForm({ ...createForm, position: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Setor</Label>
                  <Input
                    placeholder="Ex: Portaria"
                    value={createForm.department}
                    onChange={(e) => setCreateForm({ ...createForm, department: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Locais de Trabalho (opcional)</Label>
                {locations.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">
                    Nenhum local cadastrado
                  </p>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {locations.map((location) => (
                      <div
                        key={location.id}
                        className={`flex items-center justify-between p-2 rounded-lg border ${
                          createForm.selectedLocations.includes(location.id)
                            ? 'border-primary bg-primary/5'
                            : 'border-border'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={createForm.selectedLocations.includes(location.id)}
                            onCheckedChange={() => toggleCreateLocation(location.id)}
                          />
                          <span className="text-sm">{location.name}</span>
                        </div>
                        {createForm.selectedLocations.includes(location.id) && createForm.selectedLocations.length > 1 && (
                          <Button
                            variant={createForm.primaryLocation === location.id ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setCreateForm({ ...createForm, primaryLocation: location.id })}
                          >
                            {createForm.primaryLocation === location.id ? 'Principal' : 'Definir'}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Button className="w-full" onClick={handleCreateEmployee} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Criar Funcionário
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}