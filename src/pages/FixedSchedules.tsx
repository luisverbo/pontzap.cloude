import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Calendar, Search, Save, Users, MapPin, Clock, Plus } from 'lucide-react';
import { DAYS_OF_WEEK } from '@/types';

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

interface FixedSchedule {
  id: string;
  employee_id: string;
  location_id: string;
  day_of_week: number;
  works: boolean;
  start_time: string;
  end_time: string;
  tolerance_minutes: number;
  schedule_type: string;
  lunch_start_time?: string;
  lunch_end_time?: string;
  notes?: string;
  cycle_start_date?: string;
  requires_lunch?: boolean;
}

type ScheduleType = 'regular' | '12x36' | 'summer' | 'shift';

const SCHEDULE_TYPES = [
  { value: 'regular', label: 'Jornada Normal' },
  { value: '12x36', label: 'Escala 12x36' },
  { value: 'summer', label: 'Escala de Verão' },
  { value: 'shift', label: 'Rodízio/Turno' },
];

export default function FixedSchedules() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [schedules, setSchedules] = useState<FixedSchedule[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const [selectedScheduleType, setSelectedScheduleType] = useState<ScheduleType>('regular');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [globalTolerance, setGlobalTolerance] = useState<string>('');
  const [cycleStartDate, setCycleStartDate] = useState<string>('');
  const [requiresLunch, setRequiresLunch] = useState(true);

  // Default schedule for each day
  const defaultSchedule = DAYS_OF_WEEK.map((day) => ({
    day_of_week: day.value,
    works: day.value !== 0, // Sunday off by default
    start_time: '08:00',
    end_time: '17:00',
    tolerance_minutes: 15,
    schedule_type: 'regular',
    lunch_start_time: '12:00',
    lunch_end_time: '13:00',
  }));

  const [editingSchedule, setEditingSchedule] = useState(defaultSchedule);

  // Apply global tolerance to all days
  const applyGlobalTolerance = () => {
    const tolerance = parseInt(globalTolerance);
    if (isNaN(tolerance) || tolerance < 0 || tolerance > 60) {
      toast.error('Informe um valor válido entre 0 e 60 minutos');
      return;
    }
    setEditingSchedule((prev) =>
      prev.map((day) => ({ ...day, tolerance_minutes: tolerance }))
    );
    toast.success(`${tolerance} minutos aplicado a todos os dias`);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      // Fetch employees (only fixed type)
      const { data: employeesData, error: employeesError } = await supabase
        .from('employees')
        .select('id, user_id, type, is_active')
        .eq('type', 'fixed')
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

      // Fetch all fixed schedules
      const { data: schedulesData, error: schedulesError } = await supabase
        .from('fixed_schedules')
        .select('*');

      if (schedulesError) throw schedulesError;

      setEmployees(employeesWithProfiles as Employee[]);
      setLocations(locationsData || []);
      setSchedules(schedulesData || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectEmployee = async (employeeId: string) => {
    setSelectedEmployee(employeeId);

    // Load existing schedules for this employee
    const employeeSchedules = schedules.filter((s) => s.employee_id === employeeId);

    if (employeeSchedules.length > 0) {
      // Use existing schedules
      const mappedSchedule = DAYS_OF_WEEK.map((day) => {
        const existing = employeeSchedules.find((s) => s.day_of_week === day.value);
        return existing
          ? {
              day_of_week: day.value,
              works: existing.works,
              start_time: existing.start_time,
              end_time: existing.end_time,
              tolerance_minutes: existing.tolerance_minutes,
              schedule_type: existing.schedule_type || 'regular',
              lunch_start_time: existing.lunch_start_time || '12:00',
              lunch_end_time: existing.lunch_end_time || '13:00',
            }
          : {
              day_of_week: day.value,
              works: day.value !== 0,
              start_time: '08:00',
              end_time: '17:00',
              tolerance_minutes: 15,
              schedule_type: 'regular',
              lunch_start_time: '12:00',
              lunch_end_time: '13:00',
            };
      });
      setEditingSchedule(mappedSchedule);

      // Set location from existing schedule
      if (employeeSchedules[0]?.location_id) {
        setSelectedLocation(employeeSchedules[0].location_id);
      }
      
      // Set schedule type from existing schedule
      if (employeeSchedules[0]?.schedule_type) {
        setSelectedScheduleType(employeeSchedules[0].schedule_type as ScheduleType);
      }
      
      // Set cycle_start_date for 12x36 schedules
      if (employeeSchedules[0]?.cycle_start_date) {
        setCycleStartDate(employeeSchedules[0].cycle_start_date);
      } else {
        setCycleStartDate('');
      }
      
      // Set requires_lunch from existing schedule
      if (employeeSchedules[0]?.requires_lunch !== undefined) {
        setRequiresLunch(employeeSchedules[0].requires_lunch);
      } else {
        setRequiresLunch(true);
      }
    } else {
      // Reset to defaults
      setEditingSchedule(defaultSchedule);
      setSelectedLocation('');
      setCycleStartDate('');
      setRequiresLunch(true);
    }
  };

  const handleDayChange = (dayIndex: number, field: string, value: any) => {
    setEditingSchedule((prev) =>
      prev.map((day, idx) =>
        idx === dayIndex ? { ...day, [field]: value } : day
      )
    );
  };

  const handleSaveSchedule = async () => {
    if (!selectedEmployee || !selectedLocation) {
      toast.error('Selecione um funcionário e um local de trabalho');
      return;
    }

    // Validar data inicial do ciclo para escala 12x36
    if (selectedScheduleType === '12x36' && !cycleStartDate) {
      toast.error('Para escala 12x36, informe a data inicial do ciclo');
      return;
    }

    setIsSaving(true);
    try {
      // Delete existing schedules for this employee
      await supabase
        .from('fixed_schedules')
        .delete()
        .eq('employee_id', selectedEmployee);

      // Insert new schedules
      const schedulesToInsert = editingSchedule.map((day) => ({
        employee_id: selectedEmployee,
        location_id: selectedLocation,
        day_of_week: day.day_of_week,
        works: day.works,
        start_time: day.start_time,
        end_time: day.end_time,
        tolerance_minutes: day.tolerance_minutes,
        schedule_type: selectedScheduleType,
        lunch_start_time: day.lunch_start_time || null,
        lunch_end_time: day.lunch_end_time || null,
        cycle_start_date: selectedScheduleType === '12x36' ? cycleStartDate : null,
        requires_lunch: requiresLunch,
      }));

      const { error } = await supabase
        .from('fixed_schedules')
        .insert(schedulesToInsert);

      if (error) throw error;

      // Also update employee schedule_type
      await supabase
        .from('employees')
        .update({ schedule_type: selectedScheduleType })
        .eq('id', selectedEmployee);

      toast.success('Escala salva com sucesso!');
      setIsDialogOpen(false);
      setCycleStartDate('');
      fetchData(true);
    } catch (error) {
      console.error('Error saving schedule:', error);
      toast.error('Erro ao salvar escala');
    } finally {
      setIsSaving(false);
    }
  };

  const getEmployeeSchedule = (employeeId: string) => {
    return schedules.filter((s) => s.employee_id === employeeId);
  };

  const getLocationName = (locationId: string) => {
    return locations.find((l) => l.id === locationId)?.name || 'N/A';
  };

  const filteredEmployees = employees.filter((emp) => {
    const name = emp.profiles?.name?.toLowerCase() || '';
    return name.includes(searchTerm.toLowerCase());
  });

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Escala Fixa</h1>
            <p className="text-muted-foreground">
              Gerencie as escalas semanais dos funcionários fixos
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="glow">
                <Plus className="h-4 w-4 mr-2" />
                Nova Escala
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Configurar Escala Fixa</DialogTitle>
              </DialogHeader>
              <div className="space-y-6 py-4">
                {/* Employee Selection */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Funcionário</Label>
                    <Select
                      value={selectedEmployee}
                      onValueChange={handleSelectEmployee}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um funcionário" />
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
                  <div className="space-y-2">
                    <Label>Local de Trabalho</Label>
                    <Select
                      value={selectedLocation}
                      onValueChange={setSelectedLocation}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um local" />
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
                </div>

                {/* Schedule Type Selection */}
                <div className="space-y-2">
                  <Label className="text-base font-semibold">Tipo de Escala</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {SCHEDULE_TYPES.map((type) => (
                      <Button
                        key={type.value}
                        type="button"
                        variant={selectedScheduleType === type.value ? 'default' : 'outline'}
                        onClick={() => setSelectedScheduleType(type.value as ScheduleType)}
                        className="w-full justify-start"
                        size="sm"
                      >
                        {type.label}
                      </Button>
                    ))}
                  </div>
                  {selectedScheduleType === '12x36' && (
                    <div className="mt-3 p-3 rounded-lg border bg-warning/10 space-y-2">
                      <p className="text-xs text-muted-foreground">
                        Trabalha 12h e descansa 36h. Os dias de trabalho são calculados automaticamente a partir da data inicial do ciclo.
                      </p>
                      <div className="space-y-1">
                        <Label className="text-sm font-medium">Data inicial do ciclo *</Label>
                        <Input
                          type="date"
                          value={cycleStartDate}
                          onChange={(e) => setCycleStartDate(e.target.value)}
                          className="w-48"
                        />
                        <p className="text-xs text-muted-foreground">
                          Informe o primeiro dia de trabalho do funcionário nesta escala.
                        </p>
                      </div>
                    </div>
                  )}
                  {selectedScheduleType === 'summer' && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Escala especial de verão com horários estendidos.
                    </p>
                  )}
                </div>

                {/* Global Tolerance */}
                <div className="p-4 rounded-lg border bg-primary/5 space-y-3">
                  <Label className="text-base font-semibold">Min. antes do alerta (global)</Label>
                  <p className="text-xs text-muted-foreground">
                    Aplique o mesmo valor para todos os dias de uma vez
                  </p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={globalTolerance}
                      onChange={(e) => setGlobalTolerance(e.target.value)}
                      placeholder="Ex: 15"
                      className="w-24"
                      min={0}
                      max={60}
                    />
                    <span className="text-sm text-muted-foreground">min</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={applyGlobalTolerance}
                      disabled={!globalTolerance}
                    >
                      Aplicar a todos
                    </Button>
                  </div>
                </div>

                {/* Requires Lunch Toggle */}
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

                {/* Schedule Grid */}
                <div className="space-y-3">
                  <Label className="text-base font-semibold">Horários por Dia</Label>
                  {editingSchedule.map((day, idx) => (
                    <div
                      key={day.day_of_week}
                      className={`p-4 rounded-lg border transition-colors ${
                        day.works ? 'bg-card' : 'bg-muted/50'
                      }`}
                    >
                      <div className="flex items-center justify-between flex-wrap gap-4">
                        <div className="flex items-center gap-3 min-w-[140px]">
                          <Switch
                            checked={day.works}
                            onCheckedChange={(checked) =>
                              handleDayChange(idx, 'works', checked)
                            }
                          />
                          <span className="font-medium">
                            {DAYS_OF_WEEK[day.day_of_week].label}
                          </span>
                        </div>

                        {day.works && (
                          <div className="flex items-center gap-4 flex-wrap">
                            <div className="flex items-center gap-2">
                              <Label className="text-xs text-muted-foreground">
                                Entrada
                              </Label>
                              <Input
                                type="time"
                                value={day.start_time}
                                onChange={(e) =>
                                  handleDayChange(idx, 'start_time', e.target.value)
                                }
                                className="w-28"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <Label className="text-xs text-muted-foreground">
                                Saída
                              </Label>
                              <Input
                                type="time"
                                value={day.end_time}
                                onChange={(e) =>
                                  handleDayChange(idx, 'end_time', e.target.value)
                                }
                                className="w-28"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <Label className="text-xs text-muted-foreground">
                                Min. antes do alerta
                              </Label>
                              <Input
                                type="number"
                                value={day.tolerance_minutes}
                                onChange={(e) =>
                                  handleDayChange(
                                    idx,
                                    'tolerance_minutes',
                                    parseInt(e.target.value) || 0
                                  )
                                }
                                className="w-16"
                                min={0}
                                max={60}
                              />
                              <span className="text-xs text-muted-foreground">min</span>
                            </div>
                          </div>
                        )}

                        {!day.works && (
                          <Badge variant="secondary">Folga</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <Button
                  onClick={handleSaveSchedule}
                  disabled={isSaving || !selectedEmployee || !selectedLocation}
                  className="w-full"
                  variant="glow"
                >
                  {isSaving ? (
                    'Salvando...'
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Salvar Escala
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar funcionário..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Employee List with Schedules */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6">
                  <div className="h-6 bg-muted rounded w-1/2 mb-4" />
                  <div className="space-y-2">
                    {[...Array(3)].map((_, j) => (
                      <div key={j} className="h-4 bg-muted rounded w-full" />
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredEmployees.length === 0 ? (
          <Card variant="glass" className="p-12 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">
              Nenhum funcionário fixo encontrado
            </h3>
            <p className="text-muted-foreground">
              Cadastre funcionários do tipo "Fixo" para configurar suas escalas.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredEmployees.map((employee, index) => {
              const employeeSchedule = getEmployeeSchedule(employee.id);
              const hasSchedule = employeeSchedule.length > 0;
              const locationName = hasSchedule
                ? getLocationName(employeeSchedule[0].location_id)
                : null;

              return (
                <Card
                  key={employee.id}
                  variant="interactive"
                  className="animate-fade-in"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Users className="h-4 w-4 text-primary" />
                          {employee.profiles?.name || 'Sem nome'}
                        </CardTitle>
                        {locationName && (
                          <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                            <MapPin className="h-3 w-3" />
                            {locationName}
                          </p>
                        )}
                      </div>
                      <Badge variant={hasSchedule ? 'default' : 'secondary'}>
                        {hasSchedule ? 'Configurado' : 'Pendente'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {hasSchedule ? (
                      <div className="flex flex-wrap gap-1.5">
                        {DAYS_OF_WEEK.map((day) => {
                          const daySchedule = employeeSchedule.find(
                            (s) => s.day_of_week === day.value
                          );
                          const works = daySchedule?.works ?? false;
                          return (
                            <div
                              key={day.value}
                              className={`px-2 py-1 rounded text-xs font-medium ${
                                works
                                  ? 'bg-primary/10 text-primary'
                                  : 'bg-muted text-muted-foreground'
                              }`}
                              title={
                                works
                                  ? `${daySchedule?.start_time} - ${daySchedule?.end_time}`
                                  : 'Folga'
                              }
                            >
                              {day.label.slice(0, 3)}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Clique em "Nova Escala" para configurar
                      </p>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4 w-full"
                      onClick={() => {
                        handleSelectEmployee(employee.id);
                        setIsDialogOpen(true);
                      }}
                    >
                      <Calendar className="h-4 w-4 mr-2" />
                      {hasSchedule ? 'Editar Escala' : 'Configurar Escala'}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
