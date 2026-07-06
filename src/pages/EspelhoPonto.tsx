import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import { FileText, Download, Loader2, Calendar, User, Building2 } from 'lucide-react';
import { format, startOfMonth, endOfMonth, parseISO, eachDayOfInterval, isWeekend } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getImpersonatedCompanyId } from '@/components/ImpersonationBar';

// São Paulo local calendar day (YYYY-MM-DD) for a timestamptz. Using the raw
// UTC date would push evening punches (21h–23h59) onto the next day.
const spDayKey = (iso: string): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(iso));

// São Paulo local HH:mm for a timestamptz, independent of the browser timezone.
const spTime = (iso: string): string =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso));

interface DailyRecord {
  date: string;
  dayOfWeek: string;
  entry: string | null;
  lunchOut: string | null;
  lunchIn: string | null;
  exit: string | null;
  totalWorked: string;
  overtime: string;
  observations: string;
}

interface EmployeeData {
  id: string;
  name: string;
  email: string;
  pis?: string;
  cpf?: string;
  admission_date?: string;
  department?: string;
  position?: string;
}

interface CompanyData {
  name: string;
  cnpj?: string;
  address?: string;
}

export default function EspelhoPonto() {
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [employees, setEmployees] = useState<EmployeeData[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [dailyRecords, setDailyRecords] = useState<DailyRecord[]>([]);
  const [employeeInfo, setEmployeeInfo] = useState<EmployeeData | null>(null);
  const [companyInfo, setCompanyInfo] = useState<CompanyData | null>(null);
  const [totalWorkedHours, setTotalWorkedHours] = useState(0);
  const [totalOvertimeMinutes, setTotalOvertimeMinutes] = useState(0);

  // Fetch employees on mount
  useEffect(() => {
    fetchEmployees();
    fetchCompanyInfo();
  }, []);

  const fetchEmployees = async () => {
    try {
      const impersonatedCompanyId = getImpersonatedCompanyId();
      
      let query = supabase
        .from('employees')
        .select('id, user_id, company_id, pis, cpf, admission_date, position, department')
        .eq('is_active', true);
      
      if (impersonatedCompanyId) {
        query = query.eq('company_id', impersonatedCompanyId);
      }

      const { data: employeesData, error } = await query;
      if (error) throw error;

      const userIds = (employeesData || []).map(e => e.user_id);
      
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, email')
        .in('id', userIds.length > 0 ? userIds : ['']);

      const mappedEmployees: EmployeeData[] = (employeesData || []).map((emp: any) => {
        const profile = (profiles || []).find(p => p.id === emp.user_id);
        return {
          id: emp.id,
          name: profile?.name || 'Sem nome',
          email: profile?.email || '',
          pis: emp.pis || undefined,
          cpf: emp.cpf || undefined,
          admission_date: emp.admission_date || undefined,
          position: emp.position || undefined,
          department: emp.department || undefined,
        };
      });

      setEmployees(mappedEmployees.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error) {
      console.error('Error fetching employees:', error);
      toast.error('Erro ao carregar funcionários');
    }
  };

  const fetchCompanyInfo = async () => {
    try {
      const impersonatedCompanyId = getImpersonatedCompanyId();
      
      if (impersonatedCompanyId) {
        const { data } = await supabase
          .from('companies')
          .select('name')
          .eq('id', impersonatedCompanyId)
          .single();
        
        if (data) {
          setCompanyInfo({ name: data.name });
        }
      } else {
        // Try to get company from current user's employee record
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: emp } = await supabase
            .from('employees')
            .select('company_id')
            .eq('user_id', user.id)
            .maybeSingle();
          
          if (emp?.company_id) {
            const { data: company } = await supabase
              .from('companies')
              .select('name')
              .eq('id', emp.company_id)
              .single();
            
            if (company) {
              setCompanyInfo({ name: company.name });
            }
          }
        }
      }
    } catch (error) {
      console.error('Error fetching company info:', error);
    }
  };

  const fetchRecords = async () => {
    if (!selectedEmployee || !selectedMonth) return;
    
    setLoading(true);
    try {
      const [year, month] = selectedMonth.split('-').map(Number);
      const startDate = startOfMonth(new Date(year, month - 1));
      const endDate = endOfMonth(new Date(year, month - 1));
      
      // Fetch clock records
      const { data: clockRecords, error } = await supabase
        .from('clock_records')
        .select('*')
        .eq('employee_id', selectedEmployee)
        .gte('timestamp', startDate.toISOString())
        .lte('timestamp', endDate.toISOString())
        .order('timestamp', { ascending: true });

      if (error) throw error;

      // Get employee info
      const emp = employees.find(e => e.id === selectedEmployee);
      if (emp) {
        setEmployeeInfo(emp);
      }

      // Get employee work schedule
      const { data: empData } = await supabase
        .from('employees')
        .select('work_start_time, work_end_time, lunch_duration_minutes, schedule_type')
        .eq('id', selectedEmployee)
        .single();

      const workStartTime = empData?.work_start_time || '08:00:00';
      const workEndTime = empData?.work_end_time || '17:00:00';
      const lunchMinutes = empData?.lunch_duration_minutes || 60;
      const scheduleType = empData?.schedule_type || 'regular';
      
      // Calculate expected work minutes per day
      const [startHour, startMin] = workStartTime.split(':').map(Number);
      const [endHour, endMin] = workEndTime.split(':').map(Number);
      const expectedWorkMinutes = scheduleType === '12x36' ? 12 * 60 : 
        ((endHour * 60 + endMin) - (startHour * 60 + startMin) - lunchMinutes);

      // Group records by day
      const recordsByDay: Record<string, typeof clockRecords> = {};
      (clockRecords || []).forEach(record => {
        const day = spDayKey(record.timestamp);
        if (!recordsByDay[day]) recordsByDay[day] = [];
        recordsByDay[day].push(record);
      });

      // Generate all days of the month
      const days = eachDayOfInterval({ start: startDate, end: endDate });
      
      let totalWorked = 0;
      let totalOvertime = 0;
      
      const records: DailyRecord[] = days.map(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const dayRecords = recordsByDay[dateStr] || [];
        
        const entry = dayRecords.find(r => r.type === 'entry');
        const lunchOut = dayRecords.find(r => r.type === 'lunch_out');
        const lunchIn = dayRecords.find(r => r.type === 'lunch_in');
        const exit = dayRecords.find(r => r.type === 'exit');
        
        // Calculate worked time
        let workedMinutes = 0;
        let overtimeMinutes = 0;
        let observations = '';
        
        if (entry && exit) {
          const entryTime = new Date(entry.timestamp);
          const exitTime = new Date(exit.timestamp);
          
          let actualLunchMinutes = lunchMinutes;
          if (lunchOut && lunchIn) {
            const lunchOutTime = new Date(lunchOut.timestamp);
            const lunchInTime = new Date(lunchIn.timestamp);
            actualLunchMinutes = Math.round((lunchInTime.getTime() - lunchOutTime.getTime()) / 60000);
          }
          
          workedMinutes = Math.round((exitTime.getTime() - entryTime.getTime()) / 60000) - actualLunchMinutes;
          
          if (workedMinutes > expectedWorkMinutes) {
            overtimeMinutes = workedMinutes - expectedWorkMinutes;
          }
          
          totalWorked += workedMinutes;
          totalOvertime += overtimeMinutes;
          
          // Check for late entry
          const [expHour, expMin] = workStartTime.split(':').map(Number);
          const expectedEntry = new Date(entryTime);
          expectedEntry.setHours(expHour, expMin, 0, 0);
          if (entryTime > expectedEntry) {
            observations = 'Entrada atrasada';
          }
        } else if (isWeekend(day)) {
          observations = 'Fim de semana';
        } else if (dayRecords.length === 0) {
          observations = 'Sem registro';
        } else {
          observations = 'Registro incompleto';
        }
        
        // Check for manual records
        const hasManual = dayRecords.some(r => r.is_manual);
        if (hasManual) {
          observations = observations ? `${observations} | Manual` : 'Registro manual';
        }
        
        return {
          date: format(day, 'dd/MM/yyyy'),
          dayOfWeek: format(day, 'EEEE', { locale: ptBR }),
          entry: entry ? spTime(entry.timestamp) : null,
          lunchOut: lunchOut ? spTime(lunchOut.timestamp) : null,
          lunchIn: lunchIn ? spTime(lunchIn.timestamp) : null,
          exit: exit ? spTime(exit.timestamp) : null,
          totalWorked: workedMinutes > 0 ? formatMinutes(workedMinutes) : '-',
          overtime: overtimeMinutes > 0 ? formatMinutes(overtimeMinutes) : '-',
          observations,
        };
      });

      setDailyRecords(records);
      setTotalWorkedHours(totalWorked);
      setTotalOvertimeMinutes(totalOvertime);
    } catch (error) {
      console.error('Error fetching records:', error);
      toast.error('Erro ao carregar registros');
    } finally {
      setLoading(false);
    }
  };

  const formatMinutes = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    if (selectedEmployee && selectedMonth) {
      fetchRecords();
    }
  }, [selectedEmployee, selectedMonth]);

  const exportToPDF = async () => {
    if (!dailyRecords.length || !employeeInfo) return;
    
    setExporting(true);
    try {
      const doc = new jsPDF({ orientation: 'landscape' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      
      const [year, month] = selectedMonth.split('-').map(Number);
      const monthName = format(new Date(year, month - 1), 'MMMM yyyy', { locale: ptBR });
      
      // Header - Company Info
      doc.setFillColor(13, 148, 136);
      doc.rect(0, 0, pageWidth, 25, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('ESPELHO DE PONTO', 15, 15);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Conforme Portaria 671/2021 - MTE`, pageWidth - 15, 10, { align: 'right' });
      doc.text(monthName.toUpperCase(), pageWidth - 15, 18, { align: 'right' });

      let yPos = 35;

      // Company and Employee Info
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('EMPREGADOR:', 15, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(companyInfo?.name || 'Empresa não informada', 50, yPos);
      
      yPos += 8;
      doc.setFont('helvetica', 'bold');
      doc.text('EMPREGADO:', 15, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(employeeInfo.name, 50, yPos);
      if (employeeInfo.cpf) doc.text(`CPF: ${employeeInfo.cpf}`, 150, yPos);

      // Second identification line — legal fields required by Portaria 671
      const idBits: string[] = [];
      if (employeeInfo.pis) idBits.push(`PIS: ${employeeInfo.pis}`);
      if (employeeInfo.position) idBits.push(`Cargo: ${employeeInfo.position}`);
      if (employeeInfo.department) idBits.push(`Setor: ${employeeInfo.department}`);
      if (employeeInfo.admission_date) {
        idBits.push(`Admissão: ${format(new Date(employeeInfo.admission_date + 'T12:00:00'), 'dd/MM/yyyy')}`);
      }
      if (idBits.length > 0) {
        yPos += 6;
        doc.setFontSize(9);
        doc.text(idBits.join('   |   '), 50, yPos);
        doc.setFontSize(10);
      }

      yPos += 12;

      // Table Header
      doc.setFillColor(240, 240, 240);
      doc.rect(10, yPos - 5, pageWidth - 20, 10, 'F');
      
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      
      const colWidths = [25, 30, 22, 22, 22, 22, 25, 25, 60];
      const colStarts = [15, 40, 70, 92, 114, 136, 158, 183, 208];
      
      const headers = ['Data', 'Dia', 'Entrada', 'Saída Alm.', 'Ret. Alm.', 'Saída', 'Trabalhado', 'H. Extra', 'Observações'];
      headers.forEach((header, i) => {
        doc.text(header, colStarts[i], yPos);
      });
      
      yPos += 8;
      
      // Table Body
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      
      dailyRecords.forEach((record, index) => {
        // Check if we need a new page
        if (yPos > pageHeight - 30) {
          doc.addPage();
          yPos = 20;
          
          // Re-add header on new page
          doc.setFillColor(240, 240, 240);
          doc.rect(10, yPos - 5, pageWidth - 20, 10, 'F');
          doc.setFontSize(8);
          doc.setFont('helvetica', 'bold');
          headers.forEach((header, i) => {
            doc.text(header, colStarts[i], yPos);
          });
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          yPos += 8;
        }
        
        // Alternate row background
        if (index % 2 === 0) {
          doc.setFillColor(250, 250, 250);
          doc.rect(10, yPos - 4, pageWidth - 20, 6, 'F');
        }
        
        // Weekend styling
        const isWeekendDay = record.dayOfWeek.includes('sábado') || record.dayOfWeek.includes('domingo');
        if (isWeekendDay) {
          doc.setTextColor(150, 150, 150);
        } else {
          doc.setTextColor(0, 0, 0);
        }
        
        doc.text(record.date, colStarts[0], yPos);
        doc.text(record.dayOfWeek.substring(0, 10), colStarts[1], yPos);
        doc.text(record.entry || '-', colStarts[2], yPos);
        doc.text(record.lunchOut || '-', colStarts[3], yPos);
        doc.text(record.lunchIn || '-', colStarts[4], yPos);
        doc.text(record.exit || '-', colStarts[5], yPos);
        doc.text(record.totalWorked, colStarts[6], yPos);
        
        // Overtime in different color
        if (record.overtime !== '-') {
          doc.setTextColor(13, 148, 136);
        }
        doc.text(record.overtime, colStarts[7], yPos);
        doc.setTextColor(0, 0, 0);
        
        // Observations with ellipsis if too long
        const obs = record.observations.length > 35 ? record.observations.substring(0, 35) + '...' : record.observations;
        doc.text(obs, colStarts[8], yPos);
        
        yPos += 6;
      });

      // Totals
      yPos += 10;
      doc.setFillColor(13, 148, 136);
      doc.rect(10, yPos - 5, pageWidth - 20, 15, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('RESUMO DO PERÍODO', 15, yPos + 2);
      doc.text(`Total Trabalhado: ${formatMinutes(totalWorkedHours)}`, 100, yPos + 2);
      doc.text(`Horas Extras: ${formatMinutes(totalOvertimeMinutes)}`, 180, yPos + 2);
      
      // Signature section
      yPos += 25;
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      
      // Left signature
      doc.line(30, yPos, 120, yPos);
      doc.text('Assinatura do Empregado', 55, yPos + 5);
      
      // Right signature  
      doc.line(160, yPos, 250, yPos);
      doc.text('Assinatura do Empregador', 185, yPos + 5);
      
      // Footer
      yPos += 15;
      doc.setFontSize(6);
      doc.setTextColor(128, 128, 128);
      doc.text(`Documento gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm')} pelo sistema PontZap`, pageWidth / 2, yPos, { align: 'center' });
      doc.text('Este documento atende aos requisitos da Portaria 671/2021 do Ministério do Trabalho', pageWidth / 2, yPos + 4, { align: 'center' });

      // Page numbers
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(128, 128, 128);
        doc.text(`Página ${i} de ${pageCount}`, pageWidth - 15, pageHeight - 10, { align: 'right' });
      }

      const fileName = `espelho-ponto-${employeeInfo.name.replace(/\s+/g, '-').toLowerCase()}-${selectedMonth}.pdf`;
      doc.save(fileName);
      toast.success('Espelho de Ponto exportado com sucesso!');
    } catch (error) {
      console.error('Error exporting PDF:', error);
      toast.error('Erro ao exportar PDF');
    } finally {
      setExporting(false);
    }
  };

  // Generate month options (last 12 months)
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    return {
      value: format(date, 'yyyy-MM'),
      label: format(date, 'MMMM yyyy', { locale: ptBR }),
    };
  });

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-2">
              <FileText className="h-7 w-7 text-primary" />
              Espelho de Ponto
            </h1>
            <p className="text-muted-foreground mt-1">
              Relatório oficial conforme Portaria 671/2021 - MTE
            </p>
          </div>
          <Button 
            variant="glow" 
            onClick={exportToPDF} 
            disabled={!dailyRecords.length || exporting}
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Exportar PDF
          </Button>
        </div>

        {/* Filters */}
        <Card variant="default">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Selecionar Período
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Funcionário</Label>
                <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o funcionário" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map(emp => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Mês/Ano</Label>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o mês" />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Employee and Company Info */}
        {employeeInfo && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card variant="interactive">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Empregador</p>
                    <p className="font-medium">{companyInfo?.name || 'Não informado'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card variant="interactive">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    <User className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Empregado</p>
                    <p className="font-medium">{employeeInfo.name}</p>
                    <p className="text-xs text-muted-foreground">{employeeInfo.email}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Records Table */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : dailyRecords.length > 0 ? (
          <Card variant="elevated">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Registros Diários</span>
                <div className="flex gap-4 text-sm font-normal">
                  <span className="text-muted-foreground">
                    Total: <strong className="text-foreground">{formatMinutes(totalWorkedHours)}</strong>
                  </span>
                  <span className="text-muted-foreground">
                    H. Extras: <strong className="text-primary">{formatMinutes(totalOvertimeMinutes)}</strong>
                  </span>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left p-2 font-medium text-muted-foreground">Data</th>
                      <th className="text-left p-2 font-medium text-muted-foreground">Dia</th>
                      <th className="text-center p-2 font-medium text-muted-foreground">Entrada</th>
                      <th className="text-center p-2 font-medium text-muted-foreground">Saída Almoço</th>
                      <th className="text-center p-2 font-medium text-muted-foreground">Retorno Almoço</th>
                      <th className="text-center p-2 font-medium text-muted-foreground">Saída</th>
                      <th className="text-center p-2 font-medium text-muted-foreground">Trabalhado</th>
                      <th className="text-center p-2 font-medium text-muted-foreground">H. Extra</th>
                      <th className="text-left p-2 font-medium text-muted-foreground">Observações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyRecords.map((record, index) => {
                      const isWeekendDay = record.dayOfWeek.includes('sábado') || record.dayOfWeek.includes('domingo');
                      return (
                        <tr 
                          key={index}
                          className={`border-b border-border/50 hover:bg-secondary/30 transition-colors ${
                            isWeekendDay ? 'bg-secondary/20 text-muted-foreground' : index % 2 === 0 ? 'bg-secondary/10' : ''
                          }`}
                        >
                          <td className="p-2 font-mono text-xs">{record.date}</td>
                          <td className="p-2 capitalize text-xs">{record.dayOfWeek}</td>
                          <td className="text-center p-2 font-mono">{record.entry || '-'}</td>
                          <td className="text-center p-2 font-mono">{record.lunchOut || '-'}</td>
                          <td className="text-center p-2 font-mono">{record.lunchIn || '-'}</td>
                          <td className="text-center p-2 font-mono">{record.exit || '-'}</td>
                          <td className="text-center p-2 font-mono font-medium">{record.totalWorked}</td>
                          <td className="text-center p-2 font-mono">
                            {record.overtime !== '-' ? (
                              <span className="text-primary font-medium">{record.overtime}</span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="p-2 text-xs text-muted-foreground">{record.observations}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ) : selectedEmployee ? (
          <Card variant="elevated">
            <CardContent className="p-12 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">
                Nenhum registro encontrado para o período selecionado
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card variant="elevated">
            <CardContent className="p-12 text-center">
              <User className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">
                Selecione um funcionário para visualizar o espelho de ponto
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}
