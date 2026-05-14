import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, parseISO, isBefore, startOfDay, eachDayOfInterval, getMonth, getYear, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { DateRange } from 'react-day-picker';
import {
  CalendarIcon,
  Search,
  Plus,
  Trash2,
  MapPin,
  Clock,
  CalendarCheck,
  ChevronDown,
  ChevronUp,
  Edit,
  CalendarRange,
  RefreshCw,
} from 'lucide-react';

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

interface Employee {
  id: string;
  user_id: string;
  type: string;
  is_active: boolean;
  profiles?: {
    name: string;
    email: string;
  };
}

interface Location {
  id: string;
  name: string;
}

interface PunctualSchedule {
  id: string;
  employee_id: string;
  location_id: string;
  date: string;
  start_time: string;
  end_time: string;
  tolerance_minutes: number;
  employees?: {
    profiles?: {
      name: string;
    };
  };
  locations?: {
    name: string;
  };
}

interface MonthGroup {
  month: number;
  year: number;
  label: string;
  schedules: PunctualSchedule[];
}

export default function PunctualSchedules() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [schedules, setSchedules] = useState<PunctualSchedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'upcoming' | 'past'>('upcoming');
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [createMode, setCreateMode] = useState<'single' | 'range' | '12x36'>('single');
  const [scale12x36Shifts, setScale12x36Shifts] = useState(15); // Number of shifts for 12x36

  // Form state
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedDateRange, setSelectedDateRange] = useState<DateRange | undefined>(undefined);
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('17:00');
  const [toleranceMinutes, setToleranceMinutes] = useState(15);
  const [requiresLunch, setRequiresLunch] = useState(true);

  // Edit state
  const [editingSchedule, setEditingSchedule] = useState<PunctualSchedule | null>(null);
  const [editDate, setEditDate] = useState<Date | undefined>();
  const [editStartTime, setEditStartTime] = useState('08:00');
  const [editEndTime, setEditEndTime] = useState('17:00');
  const [editTolerance, setEditTolerance] = useState(15);
  const [editLocation, setEditLocation] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  // Auto-expand current month
  useEffect(() => {
    const now = new Date();
    const currentKey = `${getYear(now)}-${getMonth(now)}`;
    setExpandedMonths(new Set([currentKey]));
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch employees (only substitute type)
      const { data: employeesData, error: employeesError } = await supabase
        .from('employees')
        .select('id, user_id, type, is_active')
        .eq('type', 'substitute')
        .eq('is_active', true);

      if (employeesError) throw employeesError;

      // Fetch profiles for employees
      const userIds = employeesData?.map((e) => e.user_id) || [];
      let profilesMap: Record<string, { name: string; email: string }> = {};

      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, name, email')
          .in('id', userIds);

        profilesMap = (profilesData || []).reduce((acc, p) => {
          acc[p.id] = { name: p.name, email: p.email };
          return acc;
        }, {} as Record<string, { name: string; email: string }>);
      }

      // Merge profiles with employees
      const employeesWithProfiles = (employeesData || []).map((emp) => ({
        ...emp,
        profiles: profilesMap[emp.user_id],
      }));

      // Fetch locations
      const { data: locationsData, error: locationsError } = await supabase
        .from('locations')
        .select('id, name')
        .order('name');

      if (locationsError) throw locationsError;

      // Fetch punctual schedules
      const { data: schedulesData, error: schedulesError } = await supabase
        .from('punctual_schedules')
        .select('*')
        .order('date', { ascending: true });

      if (schedulesError) throw schedulesError;

      // Fetch employee profiles for schedules
      const scheduleEmployeeIds = [...new Set((schedulesData || []).map((s) => s.employee_id))];
      const scheduleLocationIds = [...new Set((schedulesData || []).map((s) => s.location_id))];

      // Get all employees for schedule display
      let allEmployeesMap: Record<string, string> = {};
      if (scheduleEmployeeIds.length > 0) {
        const { data: scheduleEmployees } = await supabase
          .from('employees')
          .select('id, user_id')
          .in('id', scheduleEmployeeIds);

        const scheduleUserIds = (scheduleEmployees || []).map((e) => e.user_id);
        if (scheduleUserIds.length > 0) {
          const { data: scheduleProfiles } = await supabase
            .from('profiles')
            .select('id, name')
            .in('id', scheduleUserIds);

          const profileNameMap = (scheduleProfiles || []).reduce((acc, p) => {
            acc[p.id] = p.name;
            return acc;
          }, {} as Record<string, string>);

          (scheduleEmployees || []).forEach((emp) => {
            allEmployeesMap[emp.id] = profileNameMap[emp.user_id] || 'N/A';
          });
        }
      }

      // Get all locations for schedule display
      let allLocationsMap: Record<string, string> = {};
      if (scheduleLocationIds.length > 0) {
        const { data: scheduleLocations } = await supabase
          .from('locations')
          .select('id, name')
          .in('id', scheduleLocationIds);

        allLocationsMap = (scheduleLocations || []).reduce((acc, l) => {
          acc[l.id] = l.name;
          return acc;
        }, {} as Record<string, string>);
      }

      // Merge data
      const schedulesWithRelations = (schedulesData || []).map((schedule) => ({
        ...schedule,
        employees: {
          profiles: {
            name: allEmployeesMap[schedule.employee_id] || 'N/A',
          },
        },
        locations: {
          name: allLocationsMap[schedule.location_id] || 'N/A',
        },
      }));

      setEmployees(employeesWithProfiles as Employee[]);
      setLocations(locationsData || []);
      setSchedules(schedulesWithRelations);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateSchedule = async () => {
    if (!selectedEmployee || !selectedLocation) {
      toast.error('Selecione folguista e condomínio');
      return;
    }

    if ((createMode === 'single' || createMode === '12x36') && !selectedDate) {
      toast.error('Selecione uma data');
      return;
    }

    if (createMode === 'range' && (!selectedDateRange?.from || !selectedDateRange?.to)) {
      toast.error('Selecione o período (data inicial e final)');
      return;
    }

    if (createMode === '12x36' && scale12x36Shifts < 1) {
      toast.error('Número de plantões deve ser maior que 0');
      return;
    }

    setIsSaving(true);
    try {
      let datesToCreate: Date[] = [];

      if (createMode === 'single' && selectedDate) {
        datesToCreate = [selectedDate];
      } else if (createMode === 'range' && selectedDateRange?.from && selectedDateRange?.to) {
        datesToCreate = eachDayOfInterval({
          start: selectedDateRange.from,
          end: selectedDateRange.to,
        });
      } else if (createMode === '12x36' && selectedDate) {
        // 12x36: work one day, off next day (every 2 days)
        for (let i = 0; i < scale12x36Shifts; i++) {
          datesToCreate.push(addDays(selectedDate, i * 2));
        }
      }

      // Create all schedules
      const schedulesToInsert = datesToCreate.map((date) => ({
        employee_id: selectedEmployee,
        location_id: selectedLocation,
        date: format(date, 'yyyy-MM-dd'),
        start_time: startTime,
        end_time: endTime,
        tolerance_minutes: toleranceMinutes,
        requires_lunch: requiresLunch,
      }));

      const { error } = await supabase.from('punctual_schedules').insert(schedulesToInsert);

      if (error) throw error;

      toast.success(
        datesToCreate.length === 1
          ? 'Escala criada com sucesso!'
          : `${datesToCreate.length} escalas criadas com sucesso!`
      );
      setIsDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      console.error('Error creating schedule:', error);
      if (error.code === '23505') {
        toast.error('Já existe uma escala para este funcionário em uma das datas');
      } else {
        toast.error('Erro ao criar escala');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditSchedule = async () => {
    if (!editingSchedule || !editDate || !editLocation) {
      toast.error('Preencha todos os campos');
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('punctual_schedules')
        .update({
          date: format(editDate, 'yyyy-MM-dd'),
          location_id: editLocation,
          start_time: editStartTime,
          end_time: editEndTime,
          tolerance_minutes: editTolerance,
        })
        .eq('id', editingSchedule.id);

      if (error) throw error;

      toast.success('Escala atualizada com sucesso!');
      setIsEditDialogOpen(false);
      setEditingSchedule(null);
      fetchData();
    } catch (error: any) {
      console.error('Error updating schedule:', error);
      if (error.code === '23505') {
        toast.error('Já existe uma escala para este funcionário nesta data');
      } else {
        toast.error('Erro ao atualizar escala');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    try {
      const { error } = await supabase
        .from('punctual_schedules')
        .delete()
        .eq('id', scheduleId);

      if (error) throw error;

      toast.success('Escala removida com sucesso!');
      fetchData();
    } catch (error) {
      console.error('Error deleting schedule:', error);
      toast.error('Erro ao remover escala');
    }
  };

  const openEditDialog = (schedule: PunctualSchedule) => {
    setEditingSchedule(schedule);
    setEditDate(parseISO(schedule.date));
    setEditStartTime(schedule.start_time.slice(0, 5));
    setEditEndTime(schedule.end_time.slice(0, 5));
    setEditTolerance(schedule.tolerance_minutes);
    setEditLocation(schedule.location_id);
    setIsEditDialogOpen(true);
  };

  const resetForm = () => {
    setSelectedEmployee('');
    setSelectedLocation('');
    setSelectedDate(undefined);
    setSelectedDateRange(undefined);
    setStartTime('08:00');
    setEndTime('17:00');
    setToleranceMinutes(15);
    setCreateMode('single');
    setScale12x36Shifts(15);
    setRequiresLunch(true);
  };

  const toggleMonth = (key: string) => {
    setExpandedMonths((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  const today = startOfDay(new Date());

  const filteredSchedules = schedules.filter((schedule) => {
    const scheduleDate = parseISO(schedule.date);
    const employeeName =
      schedule.employees?.profiles?.name?.toLowerCase() || '';
    const matchesSearch = employeeName.includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (filterStatus === 'upcoming') {
      return !isBefore(scheduleDate, today);
    } else if (filterStatus === 'past') {
      return isBefore(scheduleDate, today);
    }
    return true;
  });

  // Group schedules by month
  const groupedByMonth: MonthGroup[] = filteredSchedules.reduce((acc, schedule) => {
    const date = parseISO(schedule.date);
    const month = getMonth(date);
    const year = getYear(date);

    let group = acc.find((g) => g.month === month && g.year === year);
    if (!group) {
      group = {
        month,
        year,
        label: `${MESES[month]} ${year}`,
        schedules: [],
      };
      acc.push(group);
    }
    group.schedules.push(schedule);

    return acc;
  }, [] as MonthGroup[]);

  // Sort groups by date
  groupedByMonth.sort((a, b) => {
    const dateA = new Date(a.year, a.month);
    const dateB = new Date(b.year, b.month);
    return filterStatus === 'past' ? dateB.getTime() - dateA.getTime() : dateA.getTime() - dateB.getTime();
  });

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Escalas Pontuais
            </h1>
            <p className="text-muted-foreground">
              Gerencie as escalas de cobertura dos folguistas
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="glow">
                <Plus className="h-4 w-4 mr-2" />
                Nova Escala
              </Button>
            </DialogTrigger>
            <DialogContent className="flex max-h-[85vh] flex-col max-w-md">
              <DialogHeader>
                <DialogTitle>Criar Escala Pontual</DialogTitle>
              </DialogHeader>
              <div className="flex-1 space-y-4 overflow-y-auto py-4 pr-1">
                {/* Employee Selection */}
                <div className="space-y-2">
                  <Label>Folguista</Label>
                  <Select
                    value={selectedEmployee}
                    onValueChange={setSelectedEmployee}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um folguista" />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.map((emp) => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.profiles?.name || 'Sem nome'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Location Selection */}
                <div className="space-y-2">
                  <Label>Condomínio</Label>
                  <Select
                    value={selectedLocation}
                    onValueChange={setSelectedLocation}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um condomínio" />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map((loc) => (
                        <SelectItem key={loc.id} value={loc.id}>
                          {loc.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Mode Selection */}
                <div className="space-y-2">
                  <Label>Tipo de criação</Label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant={createMode === 'single' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setCreateMode('single')}
                    >
                      <CalendarIcon className="h-4 w-4 mr-2" />
                      Dia único
                    </Button>
                    <Button
                      type="button"
                      variant={createMode === 'range' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setCreateMode('range')}
                    >
                      <CalendarRange className="h-4 w-4 mr-2" />
                      Período
                    </Button>
                    <Button
                      type="button"
                      variant={createMode === '12x36' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        setCreateMode('12x36');
                        setStartTime('07:00');
                        setEndTime('19:00');
                      }}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      12x36
                    </Button>
                  </div>
                </div>

                {/* Date Selection - Single or 12x36 */}
                {(createMode === 'single' || createMode === '12x36') && (
                  <div className="space-y-2">
                    <Label>{createMode === '12x36' ? 'Data do primeiro plantão' : 'Data'}</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full justify-start text-left font-normal',
                            !selectedDate && 'text-muted-foreground'
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {selectedDate ? (
                            format(selectedDate, "dd 'de' MMMM, yyyy", {
                              locale: ptBR,
                            })
                          ) : (
                            <span>Selecione uma data</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={selectedDate}
                          onSelect={setSelectedDate}
                          disabled={(date) => isBefore(date, today)}
                          initialFocus
                          className={cn('p-3 pointer-events-auto')}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                )}

                {/* Number of shifts for 12x36 */}
                {createMode === '12x36' && (
                  <div className="space-y-2">
                    <Label>Quantidade de plantões</Label>
                    <p className="text-xs text-muted-foreground">
                      O sistema irá criar escalas alternadas (trabalha 1 dia, folga 1 dia)
                    </p>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={scale12x36Shifts}
                        onChange={(e) => setScale12x36Shifts(parseInt(e.target.value) || 1)}
                        min={1}
                        max={60}
                        className="w-24"
                      />
                      <span className="text-sm text-muted-foreground">plantões</span>
                    </div>
                    {selectedDate && scale12x36Shifts > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Último plantão: {format(addDays(selectedDate, (scale12x36Shifts - 1) * 2), "dd/MM/yyyy")}
                      </p>
                    )}
                  </div>
                )}

                {/* Date Selection - Range */}
                {createMode === 'range' && (
                  <div className="space-y-2">
                    <Label>Período (para férias, cobertura, etc.)</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full justify-start text-left font-normal',
                            !selectedDateRange?.from && 'text-muted-foreground'
                          )}
                        >
                          <CalendarRange className="mr-2 h-4 w-4" />
                          {selectedDateRange?.from ? (
                            selectedDateRange?.to ? (
                              <>
                                {format(selectedDateRange.from, 'dd/MM/yyyy')} -{' '}
                                {format(selectedDateRange.to, 'dd/MM/yyyy')}
                              </>
                            ) : (
                              format(selectedDateRange.from, 'dd/MM/yyyy')
                            )
                          ) : (
                            <span>Selecione o período</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="range"
                          selected={selectedDateRange}
                          onSelect={setSelectedDateRange}
                          disabled={(date) => isBefore(date, today)}
                          numberOfMonths={2}
                          initialFocus
                          className={cn('p-3 pointer-events-auto')}
                        />
                      </PopoverContent>
                    </Popover>
                    {selectedDateRange?.from && selectedDateRange?.to && (
                      <p className="text-xs text-muted-foreground">
                        {eachDayOfInterval({ start: selectedDateRange.from, end: selectedDateRange.to }).length} dias selecionados
                      </p>
                    )}
                  </div>
                )}

                {/* Time Inputs */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Entrada</Label>
                    <Input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Saída</Label>
                    <Input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                    />
                  </div>
                </div>

                {/* Minutes before alert */}
                <div className="space-y-2">
                  <Label>Min. antes do alerta</Label>
                  <p className="text-xs text-muted-foreground">
                    O alerta será enviado X minutos antes da entrada se o folguista não tiver chegado
                  </p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={toleranceMinutes}
                      onChange={(e) =>
                        setToleranceMinutes(parseInt(e.target.value) || 0)
                      }
                      min={0}
                      max={60}
                      className="w-24"
                    />
                    <span className="text-sm text-muted-foreground">min</span>
                  </div>
                </div>

                {/* Requires Lunch */}
                <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                  <div className="space-y-0.5">
                    <Label className="text-base font-medium">Registrar Almoço</Label>
                    <p className="text-xs text-muted-foreground">
                      Funcionário precisa bater ponto de almoço?
                    </p>
                  </div>
                  <Switch
                    checked={requiresLunch}
                    onCheckedChange={setRequiresLunch}
                  />
                </div>
              </div>

              <DialogFooter className="border-t border-border pt-4">
                <Button
                  onClick={handleCreateSchedule}
                  disabled={isSaving}
                  className="w-full"
                  variant="glow"
                >
                  {isSaving ? 'Salvando...' : (createMode === 'range' || createMode === '12x36') ? 'Criar Escalas' : 'Criar Escala'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar folguista..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select
            value={filterStatus}
            onValueChange={(value: 'all' | 'upcoming' | 'past') =>
              setFilterStatus(value)
            }
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="upcoming">Próximas</SelectItem>
              <SelectItem value="past">Passadas</SelectItem>
              <SelectItem value="all">Todas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Schedule List - Grouped by Month */}
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6">
                  <div className="h-6 bg-muted rounded w-1/3 mb-4" />
                  <div className="space-y-2">
                    {[...Array(2)].map((_, j) => (
                      <div key={j} className="h-16 bg-muted rounded w-full" />
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : groupedByMonth.length === 0 ? (
          <Card variant="glass" className="p-12 text-center">
            <CalendarCheck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">
              Nenhuma escala pontual encontrada
            </h3>
            <p className="text-muted-foreground">
              {filterStatus === 'upcoming'
                ? 'Não há escalas futuras agendadas.'
                : filterStatus === 'past'
                ? 'Não há escalas passadas.'
                : 'Clique em "Nova Escala" para criar uma cobertura.'}
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {groupedByMonth.map((group) => {
              const key = `${group.year}-${group.month}`;
              const isExpanded = expandedMonths.has(key);
              const totalSchedules = group.schedules.length;

              return (
                <Collapsible key={key} open={isExpanded} onOpenChange={() => toggleMonth(key)}>
                  <Card variant="elevated">
                    <CollapsibleTrigger asChild>
                      <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors pb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {isExpanded ? (
                              <ChevronUp className="h-5 w-5 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-5 w-5 text-muted-foreground" />
                            )}
                            <CardTitle className="text-lg flex items-center gap-2">
                              <CalendarIcon className="h-5 w-5 text-primary" />
                              {group.label}
                            </CardTitle>
                          </div>
                          <Badge variant="outline">
                            {totalSchedules} {totalSchedules === 1 ? 'escala' : 'escalas'}
                          </Badge>
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="space-y-3 pt-0">
                        {group.schedules.map((schedule) => {
                          const scheduleDate = parseISO(schedule.date);
                          const isPast = isBefore(scheduleDate, today);

                          return (
                            <div
                              key={schedule.id}
                              className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border"
                            >
                              <div className="flex items-center gap-4">
                                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary font-semibold">
                                  {schedule.employees?.profiles?.name
                                    ?.charAt(0)
                                    .toUpperCase() || '?'}
                                </div>
                                <div>
                                  <p className="font-medium">
                                    {schedule.employees?.profiles?.name || 'N/A'}
                                  </p>
                                  <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                      <CalendarIcon className="h-3 w-3" />
                                      {format(scheduleDate, "dd/MM (EEEE)", { locale: ptBR })}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <MapPin className="h-3 w-3" />
                                      {schedule.locations?.name || 'N/A'}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <Clock className="h-3 w-3" />
                                      {schedule.start_time.slice(0, 5)} - {schedule.end_time.slice(0, 5)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              {!isPast && (
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => openEditDialog(schedule)}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-destructive hover:text-destructive"
                                    onClick={() => handleDeleteSchedule(schedule.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              );
            })}
          </div>
        )}

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Editar Escala</DialogTitle>
            </DialogHeader>
            {editingSchedule && (
              <div className="space-y-4 py-4">
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="font-medium">{editingSchedule.employees?.profiles?.name || 'N/A'}</p>
                  <p className="text-sm text-muted-foreground">Folguista</p>
                </div>

                {/* Location Selection */}
                <div className="space-y-2">
                  <Label>Condomínio</Label>
                  <Select
                    value={editLocation}
                    onValueChange={setEditLocation}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um condomínio" />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map((loc) => (
                        <SelectItem key={loc.id} value={loc.id}>
                          {loc.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Date Selection */}
                <div className="space-y-2">
                  <Label>Data</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left font-normal',
                          !editDate && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {editDate ? (
                          format(editDate, "dd 'de' MMMM, yyyy", {
                            locale: ptBR,
                          })
                        ) : (
                          <span>Selecione uma data</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={editDate}
                        onSelect={setEditDate}
                        initialFocus
                        className={cn('p-3 pointer-events-auto')}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Time Inputs */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Entrada</Label>
                    <Input
                      type="time"
                      value={editStartTime}
                      onChange={(e) => setEditStartTime(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Saída</Label>
                    <Input
                      type="time"
                      value={editEndTime}
                      onChange={(e) => setEditEndTime(e.target.value)}
                    />
                  </div>
                </div>

                {/* Tolerance */}
                <div className="space-y-2">
                  <Label>Min. antes do alerta</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={editTolerance}
                      onChange={(e) =>
                        setEditTolerance(parseInt(e.target.value) || 0)
                      }
                      min={0}
                      max={60}
                      className="w-24"
                    />
                    <span className="text-sm text-muted-foreground">min</span>
                  </div>
                </div>

                <Button
                  onClick={handleEditSchedule}
                  disabled={isSaving}
                  className="w-full"
                  variant="glow"
                >
                  {isSaving ? 'Salvando...' : 'Salvar Alterações'}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
