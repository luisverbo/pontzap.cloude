import { useState, useEffect, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import { 
  FileText, 
  Download, 
  Calendar,
  Clock,
  Users,
  TrendingUp,
  AlertTriangle,
  Loader2,
  DollarSign,
  MessageSquare
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths, differenceInMinutes, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CLOCK_TYPE_LABELS, ClockType } from '@/types';
import { getImpersonatedCompanyId } from '@/components/ImpersonationBar';

// São Paulo local calendar day for a timestamptz, so evening punches don't
// get bucketed onto the next (UTC) day.
const spDayKey = (iso: string): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(iso));

interface EmployeeOvertime {
  employeeId: string;
  name: string;
  email: string;
  regularHours: number;
  overtimeMinutes: number;
  overtimeRate: number | null;
  overtimeCost: number;
  lateCount: number;
  clockIns: number;
  compensationMode: 'cash' | 'time_off';
  accumulatedOvertimeMinutes: number;
  timeOffDaysTaken: number;
  scheduleType: string;
  eligibleTimeOffDays: number;
}

interface LatenessAlert {
  id: string;
  employee_name: string;
  location_name: string;
  schedule_date: string;
  scheduled_time: string;
  response_type: string | null;
  response_at: string | null;
  observation: string | null;
}

interface ReportData {
  totalClockIns: number;
  totalEmployees: number;
  averagePerDay: number;
  lateEntries: number;
  totalOvertimeMinutes: number;
  totalOvertimeCost: number;
  byType: Record<ClockType, number>;
  byEmployee: EmployeeOvertime[];
}

export default function Reports() {
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [latenessAlerts, setLatenessAlerts] = useState<LatenessAlert[]>([]);

  const fetchReportData = async () => {
    setLoading(true);
    try {
      const impersonatedCompanyId = getImpersonatedCompanyId();

      // Fetch employees with profiles (filtered by company if impersonating)
      let empQuery = supabase
        .from('employees')
        .select('id, user_id, work_start_time, work_end_time, lunch_duration_minutes, overtime_rate, count_early_entry_as_extra, schedule_type, overtime_compensation_mode, accumulated_overtime_minutes, time_off_days_taken, company_id');
      
      if (impersonatedCompanyId) {
        empQuery = empQuery.eq('company_id', impersonatedCompanyId);
      }

      const { data: employees, error: empError } = await empQuery;
      if (empError) throw empError;

      const employeeIds = (employees || []).map(e => e.id);
      const userIds = (employees || []).map(e => e.user_id);

      // Fetch clock records for the period (filtered by company employees)
      let clockRecordsData: any[] = [];
      if (employeeIds.length > 0) {
        const { data: clockRecords, error: clockError } = await supabase
          .from('clock_records')
          .select(`
            *,
            employee:employees(
              id,
              user_id,
              work_start_time,
              work_end_time,
              lunch_duration_minutes,
              overtime_rate,
              count_early_entry_as_extra,
              schedule_type
            )
          `)
          .gte('timestamp', `${startDate}T00:00:00-03:00`)
          .lte('timestamp', `${endDate}T23:59:59-03:00`)
          .in('employee_id', employeeIds)
          .order('timestamp', { ascending: true });

        if (clockError) throw clockError;
        clockRecordsData = clockRecords || [];
      }

      // Fetch profiles
      const { data: profiles, error: profError } = await supabase
        .from('profiles')
        .select('id, name, email')
        .in('id', userIds.length > 0 ? userIds : ['']);

      if (profError) throw profError;

      // Fetch lateness alerts for the period
      let alertsData: LatenessAlert[] = [];
      if (employeeIds.length > 0) {
        const { data: alerts, error: alertsError } = await supabase
          .from('lateness_alerts')
          .select(`
            id,
            employee_id,
            location_id,
            schedule_date,
            scheduled_time,
            response_type,
            response_at,
            observation
          `)
          .gte('schedule_date', startDate)
          .lte('schedule_date', endDate)
          .in('employee_id', employeeIds)
          .order('schedule_date', { ascending: false });

        if (alertsError) throw alertsError;

        // Get employee names and location names
        const alertEmployeeIds = [...new Set((alerts || []).map(a => a.employee_id))];
        const alertLocationIds = [...new Set((alerts || []).map(a => a.location_id))];

        const [empData, locData] = await Promise.all([
          supabase.from('employees').select('id, user_id').in('id', alertEmployeeIds.length > 0 ? alertEmployeeIds : ['']),
          supabase.from('locations').select('id, name').in('id', alertLocationIds.length > 0 ? alertLocationIds : [''])
        ]);

        const empUserMap: Record<string, string> = {};
        (empData.data || []).forEach(e => { empUserMap[e.id] = e.user_id; });

        const userNameMap: Record<string, string> = {};
        (profiles || []).forEach(p => { userNameMap[p.id] = p.name; });

        const locNameMap: Record<string, string> = {};
        (locData.data || []).forEach(l => { locNameMap[l.id] = l.name; });

        alertsData = (alerts || []).map(a => ({
          id: a.id,
          employee_name: userNameMap[empUserMap[a.employee_id]] || 'Funcionário',
          location_name: locNameMap[a.location_id] || 'Local',
          schedule_date: a.schedule_date,
          scheduled_time: a.scheduled_time,
          response_type: a.response_type,
          response_at: a.response_at,
          observation: a.observation,
        }));
      }

      setLatenessAlerts(alertsData);

      // Process data
      const records = clockRecordsData || [];
      const byType: Record<ClockType, number> = {
        entry: 0,
        lunch_out: 0,
        lunch_in: 0,
        exit: 0,
      };

      let lateEntries = 0;
      
      // Group records by employee and day
      const recordsByEmployeeDay: Record<string, Record<string, typeof records>> = {};
      
      records.forEach((record) => {
        byType[record.type as ClockType]++;
        
        const empId = record.employee_id;
        const day = spDayKey(record.timestamp);
        
        if (!recordsByEmployeeDay[empId]) {
          recordsByEmployeeDay[empId] = {};
        }
        if (!recordsByEmployeeDay[empId][day]) {
          recordsByEmployeeDay[empId][day] = [];
        }
        recordsByEmployeeDay[empId][day].push(record);
      });

      // Calculate overtime for each employee
      const employeeStats: Record<string, EmployeeOvertime> = {};
      
      (employees || []).forEach((emp) => {
        const profile = (profiles || []).find(p => p.id === emp.user_id);
        const scheduleType = emp.schedule_type || 'regular';
        const hoursPerDay = scheduleType === '12x36' ? 12 : 8;
        const accumulatedMinutes = (emp as any).accumulated_overtime_minutes || 0;
        const timeOffDaysTaken = (emp as any).time_off_days_taken || 0;
        
        employeeStats[emp.id] = {
          employeeId: emp.id,
          name: profile?.name || 'Sem nome',
          email: profile?.email || '',
          regularHours: 0,
          overtimeMinutes: 0,
          overtimeRate: emp.overtime_rate,
          overtimeCost: 0,
          lateCount: 0,
          clockIns: 0,
          compensationMode: (emp as any).overtime_compensation_mode || 'cash',
          accumulatedOvertimeMinutes: accumulatedMinutes,
          timeOffDaysTaken: timeOffDaysTaken,
          scheduleType: scheduleType,
          eligibleTimeOffDays: Math.floor(accumulatedMinutes / (hoursPerDay * 60)),
        };
      });

      // Process each employee's daily records
      Object.entries(recordsByEmployeeDay).forEach(([empId, dayRecords]) => {
        const emp = (employees || []).find(e => e.id === empId);
        if (!emp || !employeeStats[empId]) return;

        const expectedStartTime = emp.work_start_time || '08:00:00';
        const expectedEndTime = emp.work_end_time || '17:00:00';
        const lunchMinutes = emp.lunch_duration_minutes || 60;
        const scheduleType = emp.schedule_type || 'regular';

        // For 12x36, expected work is 12 hours
        const expectedWorkMinutes = scheduleType === '12x36' ? 12 * 60 : 
          calculateExpectedWorkMinutes(expectedStartTime, expectedEndTime, lunchMinutes);

        Object.entries(dayRecords).forEach(([day, dayClockRecords]) => {
          employeeStats[empId].clockIns += dayClockRecords.length;

          // Find entry and exit times
          const entryRecord = dayClockRecords.find(r => r.type === 'entry');
          const exitRecord = dayClockRecords.find(r => r.type === 'exit');

          if (entryRecord) {
            // Check for lateness
            const entryTime = new Date(entryRecord.timestamp);
            const [expHour, expMin] = expectedStartTime.split(':').map(Number);
            const expectedEntry = new Date(entryTime);
            expectedEntry.setHours(expHour, expMin, 0, 0);

            if (entryTime > expectedEntry) {
              lateEntries++;
              employeeStats[empId].lateCount++;
            }
          }

          // Calculate worked time if we have both entry and exit
          if (entryRecord && exitRecord) {
            const entryTime = new Date(entryRecord.timestamp);
            const exitTime = new Date(exitRecord.timestamp);
            
            // Find lunch duration from records if available
            const lunchOut = dayClockRecords.find(r => r.type === 'lunch_out');
            const lunchIn = dayClockRecords.find(r => r.type === 'lunch_in');
            
            let actualLunchMinutes = lunchMinutes;
            if (lunchOut && lunchIn) {
              actualLunchMinutes = differenceInMinutes(
                new Date(lunchIn.timestamp),
                new Date(lunchOut.timestamp)
              );
            }

            const totalWorkedMinutes = differenceInMinutes(exitTime, entryTime) - actualLunchMinutes;
            
            // Calculate overtime
            let overtime = totalWorkedMinutes - expectedWorkMinutes;
            
            // For 12x36, only count overtime if worked more than 12 hours
            if (scheduleType === '12x36' && overtime < 0) {
              overtime = 0;
            }

            if (overtime > 0) {
              employeeStats[empId].overtimeMinutes += overtime;
              
              // Calculate cost if rate is set
              if (emp.overtime_rate) {
                const overtimeHours = overtime / 60;
                employeeStats[empId].overtimeCost += overtimeHours * emp.overtime_rate;
              }
            }

            employeeStats[empId].regularHours += Math.min(totalWorkedMinutes, expectedWorkMinutes) / 60;
          }
        });
      });

      const byEmployee = Object.values(employeeStats)
        .filter(e => e.clockIns > 0)
        .sort((a, b) => b.overtimeMinutes - a.overtimeMinutes);

      // Calculate days in period
      const start = new Date(startDate);
      const end = new Date(endDate);
      const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      const totalOvertimeMinutes = byEmployee.reduce((sum, e) => sum + e.overtimeMinutes, 0);
      const totalOvertimeCost = byEmployee.reduce((sum, e) => sum + e.overtimeCost, 0);

      setReportData({
        totalClockIns: records.length,
        totalEmployees: new Set(records.map(r => r.employee_id)).size,
        averagePerDay: Math.round((records.length / days) * 10) / 10,
        lateEntries,
        totalOvertimeMinutes,
        totalOvertimeCost,
        byType,
        byEmployee,
      });
    } catch (error) {
      console.error('Error fetching report data:', error);
      toast.error('Erro ao carregar dados do relatório');
    } finally {
      setLoading(false);
    }
  };

  const calculateExpectedWorkMinutes = (startTime: string, endTime: string, lunchMinutes: number): number => {
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    
    return endMinutes - startMinutes - lunchMinutes;
  };

  const formatMinutesToHours = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h${mins > 0 ? ` ${mins}min` : ''}`;
  };

  useEffect(() => {
    fetchReportData();
  }, [startDate, endDate]);

  const setQuickPeriod = (period: 'thisMonth' | 'lastMonth' | 'last30Days') => {
    const today = new Date();
    switch (period) {
      case 'thisMonth':
        setStartDate(format(startOfMonth(today), 'yyyy-MM-dd'));
        setEndDate(format(endOfMonth(today), 'yyyy-MM-dd'));
        break;
      case 'lastMonth':
        const lastMonth = subMonths(today, 1);
        setStartDate(format(startOfMonth(lastMonth), 'yyyy-MM-dd'));
        setEndDate(format(endOfMonth(lastMonth), 'yyyy-MM-dd'));
        break;
      case 'last30Days':
        setStartDate(format(subMonths(today, 1), 'yyyy-MM-dd'));
        setEndDate(format(today, 'yyyy-MM-dd'));
        break;
    }
  };

  // Export the raw punches for the period (audit trail with NSR + hash + PIS/CPF).
  // This is the data an accountant / fiscalização needs; it is AFD-ready data,
  // exported as CSV for easy reading.
  const exportMarcacoes = async () => {
    setExporting(true);
    try {
      const impersonatedCompanyId = getImpersonatedCompanyId();

      let empQuery = supabase
        .from('employees')
        .select('id, user_id, company_id, cpf, pis');
      if (impersonatedCompanyId) empQuery = empQuery.eq('company_id', impersonatedCompanyId);
      const { data: emps } = await empQuery;
      const employeeIds = (emps || []).map((e: any) => e.id);
      if (employeeIds.length === 0) {
        toast.error('Nenhum funcionário para exportar');
        return;
      }

      const userIds = (emps || []).map((e: any) => e.user_id);
      const { data: profs } = await supabase
        .from('profiles').select('id, name').in('id', userIds.length ? userIds : ['']);
      const nameByUser: Record<string, string> = {};
      (profs || []).forEach((p: any) => { nameByUser[p.id] = p.name; });
      const empById: Record<string, any> = {};
      (emps || []).forEach((e: any) => { empById[e.id] = e; });

      const { data: recs } = await supabase
        .from('clock_records')
        .select('*')
        .in('employee_id', employeeIds)
        .gte('timestamp', `${startDate}T00:00:00-03:00`)
        .lte('timestamp', `${endDate}T23:59:59-03:00`)
        .order('timestamp', { ascending: true });

      if (!recs || recs.length === 0) {
        toast.error('Nenhuma marcação no período');
        return;
      }

      const locIds = [...new Set(recs.map((r: any) => r.location_id).filter(Boolean))];
      const { data: locs } = await supabase
        .from('locations').select('id, name').in('id', locIds.length ? locIds : ['']);
      const locById: Record<string, string> = {};
      (locs || []).forEach((l: any) => { locById[l.id] = l.name; });

      const fmt = (iso: string) =>
        new Intl.DateTimeFormat('pt-BR', {
          timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
        }).format(new Date(iso));

      const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const header = ['NSR', 'Data/Hora', 'Funcionario', 'CPF', 'PIS', 'Tipo', 'Local', 'Metodo', 'Codigo (SHA-256)'];
      const lines = [header.map(esc).join(';')];

      for (const r of recs as any[]) {
        const emp = empById[r.employee_id] || {};
        lines.push([
          r.nsr ?? '',
          fmt(r.timestamp),
          nameByUser[emp.user_id] || '',
          emp.cpf || '',
          emp.pis || '',
          CLOCK_TYPE_LABELS[r.type as ClockType] || r.type,
          locById[r.location_id] || '',
          r.method || '',
          r.record_hash || '',
        ].map(esc).join(';'));
      }

      const csv = '﻿' + lines.join('\r\n'); // BOM for Excel
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `marcacoes-${startDate}-a-${endDate}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${recs.length} marcações exportadas`);
    } catch (e: any) {
      console.error('Erro ao exportar marcações:', e);
      toast.error('Erro ao exportar marcações');
    } finally {
      setExporting(false);
    }
  };

  const exportToPDF = async () => {
    if (!reportData) return;
    
    setExporting(true);
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      
      // Header
      doc.setFillColor(13, 148, 136); // Teal color
      doc.rect(0, 0, pageWidth, 35, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.text('PONTZAP', 20, 22);
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text(`Relatório de Ponto`, pageWidth - 20, 18, { align: 'right' });
      doc.text(`${format(parseISO(startDate), 'dd/MM/yyyy')} - ${format(parseISO(endDate), 'dd/MM/yyyy')}`, pageWidth - 20, 28, { align: 'right' });

      let yPos = 50;

      // Summary
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('Resumo do Período', 20, yPos);
      yPos += 12;

      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      
      const summaryItems = [
        ['Total de Batidas:', reportData.totalClockIns.toString()],
        ['Funcionários Ativos:', reportData.totalEmployees.toString()],
        ['Média por Dia:', reportData.averagePerDay.toString()],
        ['Atrasos:', reportData.lateEntries.toString()],
        ['Total Horas Extras:', formatMinutesToHours(reportData.totalOvertimeMinutes)],
        ['Custo Horas Extras:', `R$ ${reportData.totalOvertimeCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
      ];

      summaryItems.forEach(([label, value]) => {
        doc.text(label, 25, yPos);
        doc.setFont('helvetica', 'bold');
        doc.text(value, 100, yPos);
        doc.setFont('helvetica', 'normal');
        yPos += 8;
      });

      yPos += 10;

      // By Type
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('Batidas por Tipo', 20, yPos);
      yPos += 12;

      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      Object.entries(reportData.byType).forEach(([type, count]) => {
        doc.text(`${CLOCK_TYPE_LABELS[type as ClockType]}:`, 25, yPos);
        doc.setFont('helvetica', 'bold');
        doc.text(count.toString(), 100, yPos);
        doc.setFont('helvetica', 'normal');
        yPos += 8;
      });

      yPos += 10;

      // Employees Table
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('Detalhes por Funcionário', 20, yPos);
      yPos += 12;

      // Table header
      doc.setFillColor(240, 240, 240);
      doc.rect(15, yPos - 5, pageWidth - 30, 10, 'F');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('Funcionário', 20, yPos);
      doc.text('Batidas', 80, yPos);
      doc.text('Atrasos', 105, yPos);
      doc.text('H. Extras', 130, yPos);
      doc.text('Custo', 160, yPos);
      yPos += 10;

      doc.setFont('helvetica', 'normal');
      reportData.byEmployee.forEach((emp, index) => {
        if (yPos > 270) {
          doc.addPage();
          yPos = 30;
        }
        
        if (index % 2 === 0) {
          doc.setFillColor(248, 248, 248);
          doc.rect(15, yPos - 5, pageWidth - 30, 8, 'F');
        }

        doc.text(emp.name.substring(0, 25), 20, yPos);
        doc.text(emp.clockIns.toString(), 80, yPos);
        doc.text(emp.lateCount.toString(), 105, yPos);
        doc.text(formatMinutesToHours(emp.overtimeMinutes), 130, yPos);
        doc.text(`R$ ${emp.overtimeCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 160, yPos);
        yPos += 8;
      });

      // Footer
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(128, 128, 128);
        doc.text(`Gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm')} - Página ${i} de ${pageCount}`, pageWidth / 2, 290, { align: 'center' });
      }

      const fileName = `relatorio-ponto-${format(parseISO(startDate), 'yyyy-MM-dd')}-${format(parseISO(endDate), 'yyyy-MM-dd')}.pdf`;
      doc.save(fileName);
      toast.success('Relatório exportado com sucesso!');
    } catch (error) {
      console.error('Error exporting PDF:', error);
      toast.error('Erro ao exportar PDF');
    } finally {
      setExporting(false);
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground">
              Relatórios
            </h1>
            <p className="text-muted-foreground mt-1">
              Análise detalhada com cálculo de horas extras
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={exportMarcacoes}
              disabled={exporting}
              title="Exportar marcações do período (NSR, hash, PIS/CPF) para o contador"
            >
              <FileText className="h-4 w-4 mr-2" />
              Exportar Marcações
            </Button>
            <Button
              variant="glow"
              onClick={exportToPDF}
              disabled={!reportData || exporting}
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Exportar PDF
            </Button>
          </div>
        </div>

        {/* Period Filter */}
        <Card variant="default">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Período do Relatório
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4 items-end">
              <div className="flex-1 space-y-2">
                <Label>Data Inicial</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="flex-1 space-y-2">
                <Label>Data Final</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={() => setQuickPeriod('thisMonth')}>
                  Este Mês
                </Button>
                <Button variant="outline" size="sm" onClick={() => setQuickPeriod('lastMonth')}>
                  Mês Passado
                </Button>
                <Button variant="outline" size="sm" onClick={() => setQuickPeriod('last30Days')}>
                  Últimos 30 dias
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : reportData ? (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              <Card variant="interactive">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Total Batidas</p>
                      <p className="text-xl font-bold mt-1">{reportData.totalClockIns}</p>
                    </div>
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                      <Clock className="h-5 w-5" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card variant="interactive">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Funcionários</p>
                      <p className="text-xl font-bold mt-1">{reportData.totalEmployees}</p>
                    </div>
                    <div className="p-2 rounded-lg bg-success/10 text-success">
                      <Users className="h-5 w-5" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card variant="interactive">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Média/Dia</p>
                      <p className="text-xl font-bold mt-1">{reportData.averagePerDay}</p>
                    </div>
                    <div className="p-2 rounded-lg bg-accent/10 text-accent">
                      <TrendingUp className="h-5 w-5" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card variant="interactive">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Atrasos</p>
                      <p className="text-xl font-bold mt-1">{reportData.lateEntries}</p>
                    </div>
                    <div className="p-2 rounded-lg bg-warning/10 text-warning">
                      <AlertTriangle className="h-5 w-5" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card variant="interactive">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Horas Extras</p>
                      <p className="text-xl font-bold mt-1">{formatMinutesToHours(reportData.totalOvertimeMinutes)}</p>
                    </div>
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                      <Clock className="h-5 w-5" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card variant="interactive">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Custo H.E.</p>
                      <p className="text-xl font-bold mt-1 text-destructive">
                        R$ {reportData.totalOvertimeCost.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                      </p>
                    </div>
                    <div className="p-2 rounded-lg bg-destructive/10 text-destructive">
                      <DollarSign className="h-5 w-5" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* By Type */}
            <Card variant="elevated">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  Batidas por Tipo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Object.entries(reportData.byType).map(([type, count]) => (
                    <div
                      key={type}
                      className="p-4 rounded-lg bg-secondary/50 text-center"
                    >
                      <p className="text-2xl font-bold">{count}</p>
                      <p className="text-sm text-muted-foreground">{CLOCK_TYPE_LABELS[type as ClockType]}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* By Employee with Overtime */}
            <Card variant="elevated">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  Detalhes por Funcionário
                </CardTitle>
              </CardHeader>
              <CardContent>
                {reportData.byEmployee.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left p-3 text-sm font-medium text-muted-foreground">Funcionário</th>
                          <th className="text-center p-3 text-sm font-medium text-muted-foreground">Batidas</th>
                          <th className="text-center p-3 text-sm font-medium text-muted-foreground">Atrasos</th>
                          <th className="text-center p-3 text-sm font-medium text-muted-foreground">H. Normais</th>
                          <th className="text-center p-3 text-sm font-medium text-muted-foreground">H. Extras</th>
                          <th className="text-center p-3 text-sm font-medium text-muted-foreground">Compensação</th>
                          <th className="text-right p-3 text-sm font-medium text-muted-foreground">Custo/Folga</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.byEmployee.map((emp, index) => (
                          <tr 
                            key={emp.employeeId}
                            className={`border-b border-border/50 hover:bg-secondary/30 transition-colors ${index % 2 === 0 ? 'bg-secondary/10' : ''}`}
                          >
                            <td className="p-3">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                                  {emp.name.charAt(0)}
                                </div>
                                <div>
                                  <p className="font-medium text-sm">{emp.name}</p>
                                  <p className="text-xs text-muted-foreground">{emp.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="text-center p-3 font-medium">{emp.clockIns}</td>
                            <td className="text-center p-3">
                              {emp.lateCount > 0 ? (
                                <span className="text-warning font-medium">{emp.lateCount}</span>
                              ) : (
                                <span className="text-muted-foreground">0</span>
                              )}
                            </td>
                            <td className="text-center p-3 text-muted-foreground">
                              {emp.regularHours.toFixed(1)}h
                            </td>
                            <td className="text-center p-3">
                              {emp.overtimeMinutes > 0 ? (
                                <span className="font-medium text-primary">{formatMinutesToHours(emp.overtimeMinutes)}</span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </td>
                            <td className="text-center p-3">
                              {emp.compensationMode === 'time_off' ? (
                                <Badge variant="info" className="text-xs font-normal">
                                  Banco de horas
                                </Badge>
                              ) : (
                                <Badge variant="success" className="text-xs font-normal">
                                  Pagamento
                                </Badge>
                              )}
                            </td>
                            <td className="text-right p-3">
                              {emp.compensationMode === 'time_off' ? (
                                emp.eligibleTimeOffDays > 0 ? (
                                  <Badge variant="warning" className="text-xs font-medium">
                                    {emp.eligibleTimeOffDays} folga{emp.eligibleTimeOffDays > 1 ? 's' : ''} disponível
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground text-xs">
                                    {formatMinutesToHours(emp.accumulatedOvertimeMinutes)} acumuladas
                                  </span>
                                )
                              ) : emp.overtimeCost > 0 ? (
                                <span className="font-medium text-destructive">
                                  R$ {emp.overtimeCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-4">
                    Nenhum registro no período selecionado
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Lateness Alerts History */}
            <Card variant="elevated">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-warning" />
                  Histórico de Alertas de Atraso
                </CardTitle>
              </CardHeader>
              <CardContent>
                {latenessAlerts.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left p-3 text-sm font-medium text-muted-foreground">Data</th>
                          <th className="text-left p-3 text-sm font-medium text-muted-foreground">Funcionário</th>
                          <th className="text-left p-3 text-sm font-medium text-muted-foreground">Local</th>
                          <th className="text-center p-3 text-sm font-medium text-muted-foreground">Horário</th>
                          <th className="text-center p-3 text-sm font-medium text-muted-foreground">Resposta</th>
                          <th className="text-left p-3 text-sm font-medium text-muted-foreground">Observação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {latenessAlerts.map((alert, index) => (
                          <tr 
                            key={alert.id}
                            className={`border-b border-border/50 hover:bg-secondary/30 transition-colors ${index % 2 === 0 ? 'bg-secondary/10' : ''}`}
                          >
                            <td className="p-3 text-sm">
                              {format(parseISO(alert.schedule_date), 'dd/MM/yyyy')}
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-warning/10 flex items-center justify-center text-warning font-semibold text-xs">
                                  {alert.employee_name.charAt(0)}
                                </div>
                                <span className="font-medium text-sm">{alert.employee_name}</span>
                              </div>
                            </td>
                            <td className="p-3 text-sm text-muted-foreground">{alert.location_name}</td>
                            <td className="text-center p-3 text-sm font-mono">{alert.scheduled_time?.substring(0, 5)}</td>
                            <td className="text-center p-3">
                              {alert.response_type ? (
                                <Badge
                                  variant={
                                    alert.response_type === 'on_way'
                                      ? 'info'
                                      : alert.response_type === 'will_be_late'
                                      ? 'warning'
                                      : 'destructive'
                                  }
                                  className="text-xs font-medium"
                                >
                                  {alert.response_type === 'on_way' && 'Próximo'}
                                  {alert.response_type === 'will_be_late' && 'Atrasado'}
                                  {alert.response_type === 'absent' && 'Falta'}
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">Sem resposta</span>
                              )}
                            </td>
                            <td className="p-3 text-sm text-muted-foreground max-w-[200px] truncate">
                              {alert.observation || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-4">
                    Nenhum alerta de atraso no período selecionado
                  </p>
                )}
              </CardContent>
            </Card>
          </>
        ) : (
          <Card variant="default">
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold">Nenhum dado disponível</h3>
              <p className="text-muted-foreground mt-1">
                Selecione um período para gerar o relatório
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}