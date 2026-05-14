import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ArrowLeft, Clock, MapPin, Loader2, Download, Calendar, AlertTriangle, CheckCircle, ChevronDown, ChevronRight, Plus, HandMetal } from 'lucide-react';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, differenceInMinutes, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import type { Tables } from '@/integrations/supabase/types';
import { CLOCK_TYPE_LABELS, ClockType } from '@/types';
import { ManualClockDialog } from '@/components/clock/ManualClockDialog';

type ClockRecord = Tables<'clock_records'>;

interface EmployeeProfile {
  id: string;
  name: string;
  email: string;
}

interface EmployeeData {
  user_id: string;
  work_start_time: string | null;
  work_end_time: string | null;
  lunch_duration_minutes: number | null;
  count_early_entry_as_extra: boolean | null;
}

interface LocationData {
  id: string;
  name: string;
}

interface DayGroup {
  date: string;
  dateFormatted: string;
  records: ClockRecord[];
  isLate: boolean;
  lateMinutes: number;
}

type FilterPeriod = 'today' | 'week' | 'month' | 'custom';

export default function EmployeeHistory() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState<EmployeeProfile | null>(null);
  const [records, setRecords] = useState<ClockRecord[]>([]);
  const [locations, setLocations] = useState<LocationData[]>([]);
  const [employeeData, setEmployeeData] = useState<EmployeeData | null>(null);
  const [filterPeriod, setFilterPeriod] = useState<FilterPeriod>('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [showManualDialog, setShowManualDialog] = useState(false);

  const [fixedScheduleByDow, setFixedScheduleByDow] = useState<
    Record<number, { startMinutes: number; toleranceMinutes: number }>
  >({});
  const [punctualScheduleByDate, setPunctualScheduleByDate] = useState<
    Record<string, { startMinutes: number; toleranceMinutes: number }>
  >({});

  const parseTimeToMinutes = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  };

  const getDateRange = () => {
    const now = new Date();
    switch (filterPeriod) {
      case 'today':
        return { start: startOfDay(now), end: endOfDay(now) };
      case 'week':
        return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
      case 'month':
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case 'custom':
        return {
          start: customStart ? startOfDay(parseISO(customStart)) : startOfMonth(now),
          end: customEnd ? endOfDay(parseISO(customEnd)) : endOfMonth(now),
        };
    }
  };
  const refetchRecords = async () => {
    if (!employeeId) return;
    const { start, end } = getDateRange();
    const { data: recordsData, error: recordsError } = await supabase
      .from('clock_records')
      .select('*')
      .eq('employee_id', employeeId)
      .gte('timestamp', start.toISOString())
      .lte('timestamp', end.toISOString())
      .order('timestamp', { ascending: false });

    if (!recordsError) {
      setRecords(recordsData || []);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      if (!employeeId) return;

      setLoading(true);
      try {
        // Fetch employee data
        const { data: empData, error: empError } = await supabase
          .from('employees')
          .select('user_id, work_start_time, work_end_time, lunch_duration_minutes, count_early_entry_as_extra')
          .eq('id', employeeId)
          .single();

        if (empError) throw empError;
        setEmployeeData(empData);

        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, name, email')
          .eq('id', empData.user_id)
          .single();

        if (profileError) throw profileError;
        setEmployee(profileData);

        // Fetch locations
        const { data: locData, error: locError } = await supabase
          .from('locations')
          .select('id, name');

        if (locError) throw locError;
        setLocations(locData || []);

        // Fetch clock records
        const { start, end } = getDateRange();
        const { data: recordsData, error: recordsError } = await supabase
          .from('clock_records')
          .select('*')
          .eq('employee_id', employeeId)
          .gte('timestamp', start.toISOString())
          .lte('timestamp', end.toISOString())
          .order('timestamp', { ascending: false });

        if (recordsError) throw recordsError;
        setRecords(recordsData || []);

        // Fetch schedules for correct lateness calculation (per day)
        const startDateStr = format(start, 'yyyy-MM-dd');
        const endDateStr = format(end, 'yyyy-MM-dd');

        const [{ data: fixedSchedules, error: fixedError }, { data: punctualSchedules, error: punctualError }] =
          await Promise.all([
            supabase
              .from('fixed_schedules')
              .select('day_of_week, start_time, tolerance_minutes')
              .eq('employee_id', employeeId)
              .eq('works', true),
            supabase
              .from('punctual_schedules')
              .select('date, start_time, tolerance_minutes')
              .eq('employee_id', employeeId)
              .gte('date', startDateStr)
              .lte('date', endDateStr),
          ]);

        if (fixedError) console.error('Error fetching fixed schedules:', fixedError);
        if (punctualError) console.error('Error fetching punctual schedules:', punctualError);

        const fixedMap: Record<number, { startMinutes: number; toleranceMinutes: number }> = {};
        (fixedSchedules || []).forEach((s: any) => {
          const startMinutes = parseTimeToMinutes(s.start_time);
          const toleranceMinutes = Number(s.tolerance_minutes ?? 15);
          const existing = fixedMap[s.day_of_week];
          if (!existing || startMinutes < existing.startMinutes) {
            fixedMap[s.day_of_week] = { startMinutes, toleranceMinutes };
          }
        });

        const punctualMap: Record<string, { startMinutes: number; toleranceMinutes: number }> = {};
        (punctualSchedules || []).forEach((s: any) => {
          punctualMap[s.date] = {
            startMinutes: parseTimeToMinutes(s.start_time),
            toleranceMinutes: Number(s.tolerance_minutes ?? 15),
          };
        });

        setFixedScheduleByDow(fixedMap);
        setPunctualScheduleByDate(punctualMap);

        // Auto-expand today
        const today = format(new Date(), 'yyyy-MM-dd');
        setExpandedDays(new Set([today]));
      } catch (error: any) {
        console.error('Error fetching data:', error);
        toast.error('Erro ao carregar dados');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [employeeId, filterPeriod, customStart, customEnd]);

  const getLocationName = (locationId: string) => {
    return locations.find(l => l.id === locationId)?.name || 'Local desconhecido';
  };

  const getScheduleForDay = (dateStr: string) => {
    const punctual = punctualScheduleByDate[dateStr];
    if (punctual) return punctual;

    // Important: build a local Date to avoid timezone shifting with date-only strings
    const dayOfWeek = new Date(`${dateStr}T00:00:00`).getDay();
    const fixed = fixedScheduleByDow[dayOfWeek];
    if (fixed) return fixed;

    const defaultStartTime = employeeData?.work_start_time || '08:00:00';
    return { startMinutes: parseTimeToMinutes(defaultStartTime), toleranceMinutes: 15 };
  };

  // Group records by day
  const groupRecordsByDay = (): DayGroup[] => {
    const dayGroups: Record<string, ClockRecord[]> = {};

    records.forEach(record => {
      const day = format(parseISO(record.timestamp), 'yyyy-MM-dd');
      if (!dayGroups[day]) dayGroups[day] = [];
      dayGroups[day].push(record);
    });

    return Object.entries(dayGroups)
      .map(([date, dayRecords]) => {
        const sorted = dayRecords.sort((a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        const entryRecord = sorted.find(r => r.type === 'entry');
        let isLate = false;
        let lateMinutes = 0;

        if (entryRecord) {
          const schedule = getScheduleForDay(date);

          const entryTime = parseISO(entryRecord.timestamp);
          const actualMinutes = entryTime.getHours() * 60 + entryTime.getMinutes();

          // Atraso é qualquer batida APÓS o horário de entrada
          // A tolerância é usada apenas para o alerta de WhatsApp (ANTES do horário)
          if (actualMinutes > schedule.startMinutes) {
            isLate = true;
            lateMinutes = actualMinutes - schedule.startMinutes;
          }
        }

        return {
          date,
          dateFormatted: format(parseISO(date), "EEEE, dd 'de' MMMM", { locale: ptBR }),
          records: sorted,
          isLate,
          lateMinutes,
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  };

  const calculateTotalHours = () => {
    const dayGroups = groupRecordsByDay();
    const workStartTime = employeeData?.work_start_time || '08:00:00';
    const workEndTime = employeeData?.work_end_time || '17:00:00';
    const lunchDuration = employeeData?.lunch_duration_minutes || 60;

    const [startH, startM] = workStartTime.split(':').map(Number);
    const [endH, endM] = workEndTime.split(':').map(Number);
    const standardWorkMinutes = (endH * 60 + endM) - (startH * 60 + startM) - lunchDuration;

    let totalMinutes = 0;
    let extraMinutes = 0;
    let lateCount = 0;

    dayGroups.forEach(({ records: dayRecords, isLate }) => {
      const entry = dayRecords.find(r => r.type === 'entry');
      const exit = dayRecords.find(r => r.type === 'exit');
      const lunchOut = dayRecords.find(r => r.type === 'lunch_out');
      const lunchIn = dayRecords.find(r => r.type === 'lunch_in');

      if (entry && exit) {
        const workMinutes = differenceInMinutes(parseISO(exit.timestamp), parseISO(entry.timestamp));
        let lunchMinutesActual = 0;
        if (lunchOut && lunchIn) {
          lunchMinutesActual = differenceInMinutes(parseISO(lunchIn.timestamp), parseISO(lunchOut.timestamp));
        }
        const netMinutes = workMinutes - lunchMinutesActual;
        totalMinutes += netMinutes;

        if (netMinutes > standardWorkMinutes) {
          extraMinutes += netMinutes - standardWorkMinutes;
        }
      }

      if (isLate) lateCount++;
    });

    return {
      total: Math.floor(totalMinutes / 60) + 'h ' + (totalMinutes % 60) + 'min',
      extra: Math.floor(extraMinutes / 60) + 'h ' + (extraMinutes % 60) + 'min',
      lateCount,
    };
  };

  const toggleDay = (date: string) => {
    const newExpanded = new Set(expandedDays);
    if (newExpanded.has(date)) {
      newExpanded.delete(date);
    } else {
      newExpanded.add(date);
    }
    setExpandedDays(newExpanded);
  };

  const exportPDF = () => {
    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.getWidth();

    pdf.setFontSize(18);
    pdf.text('Histórico de Ponto', pageWidth / 2, 20, { align: 'center' });

    pdf.setFontSize(12);
    pdf.text(`Funcionário: ${employee?.name || 'N/A'}`, 20, 35);
    pdf.text(`Período: ${format(getDateRange().start, 'dd/MM/yyyy')} - ${format(getDateRange().end, 'dd/MM/yyyy')}`, 20, 42);

    const stats = calculateTotalHours();
    pdf.text(`Total de horas: ${stats.total}`, 20, 52);
    pdf.text(`Horas extras: ${stats.extra}`, 20, 59);

    let y = 75;
    pdf.setFontSize(10);
    pdf.text('Data', 20, y);
    pdf.text('Tipo', 60, y);
    pdf.text('Horário', 100, y);
    pdf.text('Local', 130, y);

    y += 10;
    records.forEach((record) => {
      if (y > 270) {
        pdf.addPage();
        y = 20;
      }
      pdf.text(format(parseISO(record.timestamp), 'dd/MM/yyyy'), 20, y);
      pdf.text(CLOCK_TYPE_LABELS[record.type as ClockType], 60, y);
      pdf.text(format(parseISO(record.timestamp), 'HH:mm'), 100, y);
      pdf.text(getLocationName(record.location_id).substring(0, 20), 130, y);
      y += 7;
    });

    pdf.save(`historico-${employee?.name?.replace(/\s+/g, '-').toLowerCase() || 'funcionario'}.pdf`);
  };

  const exportExcel = () => {
    const data = records.map(record => ({
      Data: format(parseISO(record.timestamp), 'dd/MM/yyyy'),
      Horário: format(parseISO(record.timestamp), 'HH:mm:ss'),
      Tipo: CLOCK_TYPE_LABELS[record.type as ClockType],
      Local: getLocationName(record.location_id),
      Método: record.method === 'qr' ? 'QR Code' : 'GPS',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Histórico');
    XLSX.writeFile(wb, `historico-${employee?.name?.replace(/\s+/g, '-').toLowerCase() || 'funcionario'}.xlsx`);
  };

  const stats = calculateTotalHours();
  const dayGroups = groupRecordsByDay();

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
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/employees')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-foreground">
                Histórico de Ponto
              </h1>
              <p className="text-muted-foreground mt-1">
                {employee?.name} - {employee?.email}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={() => setShowManualDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Registro Manual
            </Button>
            <Button variant="outline" onClick={exportPDF}>
              <Download className="h-4 w-4 mr-2" />
              PDF
            </Button>
            <Button variant="outline" onClick={exportExcel}>
              <Download className="h-4 w-4 mr-2" />
              Excel
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Horas Trabalhadas</p>
                  <p className="text-xl font-bold">{stats.total}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <CheckCircle className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Horas Extras</p>
                  <p className="text-xl font-bold">{stats.extra}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Atrasos</p>
                  <p className="text-xl font-bold">{stats.lateCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Dias Trabalhados</p>
                  <p className="text-xl font-bold">{dayGroups.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="space-y-2">
                <Label>Período</Label>
                <Select value={filterPeriod} onValueChange={(v) => setFilterPeriod(v as FilterPeriod)}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Hoje</SelectItem>
                    <SelectItem value="week">Esta Semana</SelectItem>
                    <SelectItem value="month">Este Mês</SelectItem>
                    <SelectItem value="custom">Personalizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {filterPeriod === 'custom' && (
                <>
                  <div className="space-y-2">
                    <Label>Data Início</Label>
                    <Input
                      type="date"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      className="w-40"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Data Fim</Label>
                    <Input
                      type="date"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      className="w-40"
                    />
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Records grouped by day */}
        <div className="space-y-3">
          {dayGroups.map((dayGroup) => (
            <Card 
              key={dayGroup.date} 
              className={`overflow-hidden ${dayGroup.isLate ? 'border-l-4 border-l-warning' : ''}`}
            >
              <Collapsible 
                open={expandedDays.has(dayGroup.date)}
                onOpenChange={() => toggleDay(dayGroup.date)}
              >
                <CollapsibleTrigger asChild>
                  <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-secondary/50 transition-colors">
                    <div className="flex items-center gap-3">
                      {expandedDays.has(dayGroup.date) ? (
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      )}
                      <div>
                        <p className="font-medium capitalize">{dayGroup.dateFormatted}</p>
                        <p className="text-sm text-muted-foreground">
                          {dayGroup.records.length} registro{dayGroup.records.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {dayGroup.isLate && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-warning/10 text-warning">
                          <AlertTriangle className="h-3 w-3" />
                          Atraso de {dayGroup.lateMinutes}min
                        </span>
                      )}
                      {!dayGroup.isLate && dayGroup.records.some(r => r.type === 'entry') && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-success/10 text-success">
                          <CheckCircle className="h-3 w-3" />
                          No horário
                        </span>
                      )}
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-4 pb-4 space-y-2 border-t border-border pt-3">
                    {dayGroup.records.map((record) => (
                      <div
                        key={record.id}
                        className={`flex items-center justify-between p-3 rounded-lg ${
                          record.is_manual
                            ? 'bg-primary/10 border border-primary/20'
                            : record.type === 'entry' && dayGroup.isLate 
                              ? 'bg-warning/10 border border-warning/20' 
                              : 'bg-secondary/50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                            record.is_manual
                              ? 'bg-primary/20 text-primary'
                              : record.type === 'entry' 
                                ? dayGroup.isLate 
                                  ? 'bg-warning/20 text-warning' 
                                  : 'bg-success/10 text-success' 
                                : record.type === 'exit' 
                                  ? 'bg-destructive/10 text-destructive' 
                                  : 'bg-primary/10 text-primary'
                          }`}>
                            {record.is_manual ? <HandMetal className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-sm">{CLOCK_TYPE_LABELS[record.type as ClockType]}</p>
                              {record.is_manual && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-primary/20 text-primary">
                                  MANUAL
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {format(parseISO(record.timestamp), 'HH:mm:ss')}
                            </p>
                            {record.is_manual && record.manual_observation && (
                              <p className="text-xs text-muted-foreground italic mt-1">
                                Obs: {record.manual_observation}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-right text-sm">
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <MapPin className="h-3 w-3" />
                            {getLocationName(record.location_id)}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {record.is_manual ? 'Registro Manual' : record.method === 'qr' ? 'QR Code' : 'GPS'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          ))}

          {dayGroups.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">Nenhum registro encontrado</h3>
                <p className="text-muted-foreground mt-1">
                  Não há registros de ponto para o período selecionado.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Manual Clock Dialog */}
        {employeeId && employee && (
          <ManualClockDialog
            open={showManualDialog}
            onOpenChange={setShowManualDialog}
            employeeId={employeeId}
            employeeName={employee.name}
            locations={locations}
            onSuccess={refetchRecords}
          />
        )}
      </div>
    </MainLayout>
  );
}
