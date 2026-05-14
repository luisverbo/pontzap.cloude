import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { CalendarIcon, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Employee {
  id: string;
  name: string;
}

interface ResetClockRecordsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ResetType = 'all' | 'period' | 'day';

export function ResetClockRecordsDialog({ open, onOpenChange }: ResetClockRecordsDialogProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('all');
  const [resetType, setResetType] = useState<ResetType>('all');
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [singleDate, setSingleDate] = useState<Date | undefined>();
  const [loading, setLoading] = useState(false);
  const [loadingEmployees, setLoadingEmployees] = useState(true);

  useEffect(() => {
    if (open) {
      fetchEmployees();
    }
  }, [open]);

  const fetchEmployees = async () => {
    setLoadingEmployees(true);
    try {
      const { data: employeesData, error: employeesError } = await supabase
        .from('employees')
        .select('id, user_id')
        .eq('is_active', true);

      if (employeesError) throw employeesError;

      if (employeesData && employeesData.length > 0) {
        const userIds = employeesData.map(e => e.user_id);
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, name')
          .in('id', userIds);

        if (profilesError) throw profilesError;

        const employeesWithNames = employeesData.map(emp => {
          const profile = profiles?.find(p => p.id === emp.user_id);
          return {
            id: emp.id,
            name: profile?.name || 'Sem nome',
          };
        }).sort((a, b) => a.name.localeCompare(b.name));

        setEmployees(employeesWithNames);
      }
    } catch (error) {
      console.error('Error fetching employees:', error);
      toast.error('Erro ao carregar funcionários');
    } finally {
      setLoadingEmployees(false);
    }
  };

  const handleReset = async () => {
    let confirmMessage = 'Tem certeza que deseja zerar os registros de ponto';
    
    if (selectedEmployee === 'all') {
      confirmMessage += ' de TODOS os funcionários';
    } else {
      const emp = employees.find(e => e.id === selectedEmployee);
      confirmMessage += ` de ${emp?.name}`;
    }

    if (resetType === 'all') {
      confirmMessage += ' (TODOS os registros)';
    } else if (resetType === 'period' && startDate && endDate) {
      confirmMessage += ` do período ${format(startDate, 'dd/MM/yyyy')} a ${format(endDate, 'dd/MM/yyyy')}`;
    } else if (resetType === 'day' && singleDate) {
      confirmMessage += ` do dia ${format(singleDate, 'dd/MM/yyyy')}`;
    }

    confirmMessage += '? Esta ação não pode ser desfeita.';

    if (!confirm(confirmMessage)) {
      return;
    }

    setLoading(true);
    try {
      let query = supabase.from('clock_records').delete();

      // Filter by employee
      if (selectedEmployee !== 'all') {
        query = query.eq('employee_id', selectedEmployee);
      }

      // Filter by date range or single day
      if (resetType === 'period' && startDate && endDate) {
        const startStr = format(startDate, 'yyyy-MM-dd') + 'T00:00:00';
        const endStr = format(endDate, 'yyyy-MM-dd') + 'T23:59:59';
        query = query.gte('timestamp', startStr).lte('timestamp', endStr);
      } else if (resetType === 'day' && singleDate) {
        const dayStr = format(singleDate, 'yyyy-MM-dd');
        query = query.gte('timestamp', dayStr + 'T00:00:00').lte('timestamp', dayStr + 'T23:59:59');
      }

      // Need to add a condition to make it work (can't delete without where clause)
      if (selectedEmployee === 'all' && resetType === 'all') {
        query = query.neq('id', '00000000-0000-0000-0000-000000000000');
      }

      const { error } = await query;
      if (error) throw error;

      toast.success('Registros de ponto zerados com sucesso!');
      onOpenChange(false);
      window.location.reload();
    } catch (error) {
      console.error('Error resetting clock records:', error);
      toast.error('Erro ao zerar registros');
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = () => {
    if (resetType === 'period') {
      return startDate && endDate;
    }
    if (resetType === 'day') {
      return singleDate;
    }
    return true;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Zerar Registros de Ponto</DialogTitle>
          <DialogDescription>
            Selecione as opções para zerar os registros de ponto.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Employee Selection */}
          <div className="space-y-2">
            <Label>Funcionário</Label>
            <Select value={selectedEmployee} onValueChange={setSelectedEmployee} disabled={loadingEmployees}>
              <SelectTrigger>
                <SelectValue placeholder={loadingEmployees ? "Carregando..." : "Selecione um funcionário"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os funcionários</SelectItem>
                {employees.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Reset Type */}
          <div className="space-y-2">
            <Label>Tipo de Reset</Label>
            <RadioGroup value={resetType} onValueChange={(v) => setResetType(v as ResetType)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="all" id="all" />
                <Label htmlFor="all" className="font-normal cursor-pointer">Completo (todos os registros)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="period" id="period" />
                <Label htmlFor="period" className="font-normal cursor-pointer">Por período</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="day" id="day" />
                <Label htmlFor="day" className="font-normal cursor-pointer">Por dia específico</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Period Selection */}
          {resetType === 'period' && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Data Inicial</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !startDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecione a data"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={setStartDate}
                      initialFocus
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Data Final</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !endDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {endDate ? format(endDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecione a data"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={setEndDate}
                      initialFocus
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}

          {/* Single Day Selection */}
          {resetType === 'day' && (
            <div className="space-y-2">
              <Label>Data</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !singleDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {singleDate ? format(singleDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecione a data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={singleDate}
                    onSelect={setSingleDate}
                    initialFocus
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            variant="destructive" 
            onClick={handleReset} 
            disabled={loading || !canSubmit()}
          >
            <RotateCcw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
            {loading ? 'Zerando...' : 'Zerar Pontos'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
