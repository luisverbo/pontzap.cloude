import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useShiftSwaps } from '@/hooks/useShiftSwaps';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ArrowLeftRight,
  Plus,
  Check,
  X,
  Clock,
  Calendar,
  User,
  MapPin,
  Loader2,
  AlertCircle,
} from 'lucide-react';

interface ShiftSwapSectionProps {
  employeeId: string;
  companyId: string | null;
}

interface ColleagueOption {
  id: string;
  name: string;
}

interface ScheduleOption {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  location_id: string;
  location_name: string;
  type: 'punctual' | 'fixed';
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pendente', color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20' },
  accepted: { label: 'Aceito', color: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
  approved: { label: 'Aprovado', color: 'bg-green-500/10 text-green-600 border-green-500/20' },
  rejected: { label: 'Rejeitado', color: 'bg-red-500/10 text-red-600 border-red-500/20' },
  cancelled: { label: 'Cancelado', color: 'bg-gray-500/10 text-gray-600 border-gray-500/20' },
};

export function ShiftSwapSection({ employeeId, companyId }: ShiftSwapSectionProps) {
  const { swaps, loading, createSwapRequest, acceptSwap, rejectSwap, cancelSwap } = useShiftSwaps(employeeId);
  const [showDialog, setShowDialog] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  
  // Form state
  const [colleagues, setColleagues] = useState<ColleagueOption[]>([]);
  const [mySchedules, setMySchedules] = useState<ScheduleOption[]>([]);
  const [colleagueSchedules, setColleagueSchedules] = useState<ScheduleOption[]>([]);
  const [loadingColleagues, setLoadingColleagues] = useState(false);
  
  const [selectedColleague, setSelectedColleague] = useState('');
  const [selectedMySchedule, setSelectedMySchedule] = useState('');
  const [selectedColleagueSchedule, setSelectedColleagueSchedule] = useState('');
  const [reason, setReason] = useState('');

  // Fetch colleagues who work at same locations (for fixed employees)
  // OR colleagues who have schedules at the same locations (for substitute employees)
  useEffect(() => {
    const fetchColleagues = async () => {
      if (!employeeId) return;
      
      setLoadingColleagues(true);
      try {
        // Get my locations from employee_locations
        const { data: myLocations } = await supabase
          .from('employee_locations')
          .select('location_id')
          .eq('employee_id', employeeId);
        
        let myLocationIds = myLocations?.map(l => l.location_id) || [];
        
        // For substitute employees (folguistas), also get locations from punctual_schedules
        const { data: myPunctualSchedules } = await supabase
          .from('punctual_schedules')
          .select('location_id')
          .eq('employee_id', employeeId)
          .gte('date', new Date().toISOString().split('T')[0]);
        
        const punctualLocationIds = myPunctualSchedules?.map(s => s.location_id) || [];
        myLocationIds = [...new Set([...myLocationIds, ...punctualLocationIds])];
        
        if (myLocationIds.length === 0) {
          setColleagues([]);
          return;
        }

        // Get employees at same locations
        const { data: colleagueLocations } = await supabase
          .from('employee_locations')
          .select(`
            employee_id,
            employees(
              id,
              user_id,
              profiles(name)
            )
          `)
          .in('location_id', myLocationIds)
          .neq('employee_id', employeeId);
        
        const uniqueColleagues = new Map<string, ColleagueOption>();
        colleagueLocations?.forEach((cl: any) => {
          if (cl.employees?.id && cl.employees?.profiles?.name) {
            uniqueColleagues.set(cl.employees.id, {
              id: cl.employees.id,
              name: cl.employees.profiles.name,
            });
          }
        });

        // Also get colleagues from punctual schedules at same locations
        const { data: colleaguePunctualSchedules } = await supabase
          .from('punctual_schedules')
          .select(`
            employee_id,
            employees(
              id,
              user_id,
              profiles(name)
            )
          `)
          .in('location_id', myLocationIds)
          .neq('employee_id', employeeId)
          .gte('date', new Date().toISOString().split('T')[0]);

        colleaguePunctualSchedules?.forEach((ps: any) => {
          if (ps.employees?.id && ps.employees?.profiles?.name) {
            uniqueColleagues.set(ps.employees.id, {
              id: ps.employees.id,
              name: ps.employees.profiles.name,
            });
          }
        });
        
        setColleagues(Array.from(uniqueColleagues.values()));
      } catch (error) {
        console.error('Error fetching colleagues:', error);
      } finally {
        setLoadingColleagues(false);
      }
    };

    if (showDialog) {
      fetchColleagues();
    }
  }, [employeeId, showDialog]);

  // Fetch my schedules
  useEffect(() => {
    const fetchMySchedules = async () => {
      if (!employeeId || !showDialog) return;
      
      try {
        const today = format(new Date(), 'yyyy-MM-dd');
        
        // Fetch punctual schedules
        const { data: punctual } = await supabase
          .from('punctual_schedules')
          .select(`
            id,
            date,
            start_time,
            end_time,
            location_id,
            locations(name)
          `)
          .eq('employee_id', employeeId)
          .gte('date', today)
          .order('date');
        
        // Fetch fixed schedules (for next 30 days)
        const { data: fixed } = await supabase
          .from('fixed_schedules')
          .select(`
            id,
            day_of_week,
            start_time,
            end_time,
            location_id,
            works,
            locations(name)
          `)
          .eq('employee_id', employeeId)
          .eq('works', true);
        
        const schedules: ScheduleOption[] = [];
        
        // Add punctual schedules
        punctual?.forEach((p: any) => {
          schedules.push({
            id: p.id,
            date: p.date,
            start_time: p.start_time,
            end_time: p.end_time,
            location_id: p.location_id,
            location_name: p.locations?.name || 'N/A',
            type: 'punctual',
          });
        });
        
        // Add fixed schedules for next 30 days
        const now = new Date();
        for (let i = 0; i < 30; i++) {
          const date = new Date(now);
          date.setDate(date.getDate() + i);
          const dayOfWeek = date.getDay();
          
          const fixedForDay = fixed?.find((f: any) => f.day_of_week === dayOfWeek);
          if (fixedForDay) {
            const dateStr = format(date, 'yyyy-MM-dd');
            // Check if there's no punctual schedule for this date already
            if (!schedules.some(s => s.date === dateStr)) {
              schedules.push({
                id: `fixed-${fixedForDay.id}-${dateStr}`,
                date: dateStr,
                start_time: fixedForDay.start_time,
                end_time: fixedForDay.end_time,
                location_id: fixedForDay.location_id,
                location_name: (fixedForDay as any).locations?.name || 'N/A',
                type: 'fixed',
              });
            }
          }
        }
        
        // Sort by date
        schedules.sort((a, b) => a.date.localeCompare(b.date));
        setMySchedules(schedules);
      } catch (error) {
        console.error('Error fetching my schedules:', error);
      }
    };

    fetchMySchedules();
  }, [employeeId, showDialog]);

  // Fetch colleague schedules when selected
  useEffect(() => {
    const fetchColleagueSchedules = async () => {
      if (!selectedColleague || !selectedMySchedule) {
        setColleagueSchedules([]);
        return;
      }
      
      try {
        const mySchedule = mySchedules.find(s => s.id === selectedMySchedule);
        if (!mySchedule) return;
        
        const today = format(new Date(), 'yyyy-MM-dd');
        
        // Fetch punctual schedules at same location
        const { data: punctual } = await supabase
          .from('punctual_schedules')
          .select(`
            id,
            date,
            start_time,
            end_time,
            location_id,
            locations(name)
          `)
          .eq('employee_id', selectedColleague)
          .eq('location_id', mySchedule.location_id)
          .gte('date', today)
          .order('date');
        
        // Fetch fixed schedules
        const { data: fixed } = await supabase
          .from('fixed_schedules')
          .select(`
            id,
            day_of_week,
            start_time,
            end_time,
            location_id,
            works,
            locations(name)
          `)
          .eq('employee_id', selectedColleague)
          .eq('location_id', mySchedule.location_id)
          .eq('works', true);
        
        const schedules: ScheduleOption[] = [];
        
        // Add punctual schedules
        punctual?.forEach((p: any) => {
          schedules.push({
            id: p.id,
            date: p.date,
            start_time: p.start_time,
            end_time: p.end_time,
            location_id: p.location_id,
            location_name: p.locations?.name || 'N/A',
            type: 'punctual',
          });
        });
        
        // Add fixed schedules for next 30 days
        const now = new Date();
        for (let i = 0; i < 30; i++) {
          const date = new Date(now);
          date.setDate(date.getDate() + i);
          const dayOfWeek = date.getDay();
          
          const fixedForDay = fixed?.find((f: any) => f.day_of_week === dayOfWeek);
          if (fixedForDay) {
            const dateStr = format(date, 'yyyy-MM-dd');
            if (!schedules.some(s => s.date === dateStr)) {
              schedules.push({
                id: `fixed-${fixedForDay.id}-${dateStr}`,
                date: dateStr,
                start_time: fixedForDay.start_time,
                end_time: fixedForDay.end_time,
                location_id: fixedForDay.location_id,
                location_name: (fixedForDay as any).locations?.name || 'N/A',
                type: 'fixed',
              });
            }
          }
        }
        
        schedules.sort((a, b) => a.date.localeCompare(b.date));
        setColleagueSchedules(schedules);
      } catch (error) {
        console.error('Error fetching colleague schedules:', error);
      }
    };

    fetchColleagueSchedules();
  }, [selectedColleague, selectedMySchedule, mySchedules]);

  const handleCreateRequest = async () => {
    const mySchedule = mySchedules.find(s => s.id === selectedMySchedule);
    const colleagueSchedule = colleagueSchedules.find(s => s.id === selectedColleagueSchedule);
    
    if (!mySchedule || !colleagueSchedule || !selectedColleague) return;
    
    setProcessing('create');
    const success = await createSwapRequest({
      company_id: companyId,
      requester_employee_id: employeeId,
      target_employee_id: selectedColleague,
      location_id: mySchedule.location_id,
      requester_date: mySchedule.date,
      target_date: colleagueSchedule.date,
      requester_start_time: mySchedule.start_time,
      requester_end_time: mySchedule.end_time,
      target_start_time: colleagueSchedule.start_time,
      target_end_time: colleagueSchedule.end_time,
      schedule_type: mySchedule.type === 'punctual' && colleagueSchedule.type === 'punctual' ? 'punctual' : 'fixed',
      reason: reason || undefined,
    });
    
    if (success) {
      setShowDialog(false);
      resetForm();
    }
    setProcessing(null);
  };

  const resetForm = () => {
    setSelectedColleague('');
    setSelectedMySchedule('');
    setSelectedColleagueSchedule('');
    setReason('');
  };

  const handleAccept = async (swapId: string) => {
    setProcessing(swapId);
    await acceptSwap(swapId);
    setProcessing(null);
  };

  const handleReject = async (swapId: string) => {
    setProcessing(swapId);
    await rejectSwap(swapId);
    setProcessing(null);
  };

  const handleCancel = async (swapId: string) => {
    setProcessing(swapId);
    await cancelSwap(swapId);
    setProcessing(null);
  };

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr + 'T12:00:00'), "dd/MM (EEEE)", { locale: ptBR });
  };

  const formatTime = (timeStr: string) => timeStr.substring(0, 5);

  // Separate swaps by role
  const myRequests = swaps.filter(s => s.requester_employee_id === employeeId);
  const requestsForMe = swaps.filter(s => s.target_employee_id === employeeId && s.status === 'pending');

  return (
    <Card variant="default">
      <CardHeader className="px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <ArrowLeftRight className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              Troca de Escala
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Solicite ou aceite trocas com colegas
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setShowDialog(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Nova Troca
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6 space-y-4">
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Requests for me to accept */}
            {requestsForMe.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-yellow-500" />
                  Solicitações para você
                </p>
                {requestsForMe.map((swap) => (
                  <div key={swap.id} className="p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">
                          {swap.requester?.profiles?.name} quer trocar
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(swap.requester_date)} ({formatTime(swap.requester_start_time)}-{formatTime(swap.requester_end_time)})
                          <span className="mx-1">↔</span>
                          {formatDate(swap.target_date)} ({formatTime(swap.target_start_time)}-{formatTime(swap.target_end_time)})
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleReject(swap.id)}
                        disabled={processing === swap.id}
                        className="flex-1"
                      >
                        <X className="h-4 w-4 mr-1" />
                        Recusar
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleAccept(swap.id)}
                        disabled={processing === swap.id}
                        className="flex-1 bg-green-600 hover:bg-green-700"
                      >
                        {processing === swap.id ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-1" />
                        ) : (
                          <Check className="h-4 w-4 mr-1" />
                        )}
                        Aceitar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* My requests */}
            {myRequests.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Minhas solicitações</p>
                {myRequests.slice(0, 5).map((swap) => (
                  <div key={swap.id} className="p-3 rounded-lg border bg-muted/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-sm">
                          Troca com <span className="font-medium">{swap.target?.profiles?.name}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(swap.requester_date)} ↔ {formatDate(swap.target_date)}
                        </p>
                      </div>
                      <Badge className={STATUS_LABELS[swap.status]?.color || ''}>
                        {STATUS_LABELS[swap.status]?.label || swap.status}
                      </Badge>
                    </div>
                    {swap.status === 'pending' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleCancel(swap.id)}
                        disabled={processing === swap.id}
                        className="text-destructive hover:bg-destructive/10 w-full"
                      >
                        Cancelar solicitação
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {requestsForMe.length === 0 && myRequests.length === 0 && (
              <div className="text-center py-4 text-muted-foreground text-sm">
                Nenhuma troca de escala
              </div>
            )}
          </>
        )}
      </CardContent>

      {/* New Swap Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowLeftRight className="h-5 w-5" />
              Solicitar Troca de Escala
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Select colleague */}
            <div className="space-y-2">
              <Label>Trocar com quem?</Label>
              <Select value={selectedColleague} onValueChange={setSelectedColleague}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um colega" />
                </SelectTrigger>
                <SelectContent>
                  {loadingColleagues ? (
                    <div className="p-2 text-center">
                      <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                    </div>
                  ) : colleagues.length === 0 ? (
                    <div className="p-2 text-center text-sm text-muted-foreground">
                      Nenhum colega disponível
                    </div>
                  ) : (
                    colleagues.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Select my schedule */}
            <div className="space-y-2">
              <Label>Minha escala para trocar</Label>
              <Select value={selectedMySchedule} onValueChange={setSelectedMySchedule}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione sua escala" />
                </SelectTrigger>
                <SelectContent>
                  {mySchedules.length === 0 ? (
                    <div className="p-2 text-center text-sm text-muted-foreground">
                      Nenhuma escala disponível
                    </div>
                  ) : (
                    mySchedules.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {formatDate(s.date)} - {formatTime(s.start_time)}-{formatTime(s.end_time)} ({s.location_name})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Select colleague schedule */}
            {selectedColleague && selectedMySchedule && (
              <div className="space-y-2">
                <Label>Escala do colega para trocar</Label>
                <Select value={selectedColleagueSchedule} onValueChange={setSelectedColleagueSchedule}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a escala do colega" />
                  </SelectTrigger>
                  <SelectContent>
                    {colleagueSchedules.length === 0 ? (
                      <div className="p-2 text-center text-sm text-muted-foreground">
                        Nenhuma escala disponível no mesmo local
                      </div>
                    ) : (
                      colleagueSchedules.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {formatDate(s.date)} - {formatTime(s.start_time)}-{formatTime(s.end_time)}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Reason */}
            <div className="space-y-2">
              <Label>Motivo (opcional)</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex: Consulta médica"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDialog(false); resetForm(); }}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreateRequest}
              disabled={!selectedColleague || !selectedMySchedule || !selectedColleagueSchedule || processing === 'create'}
            >
              {processing === 'create' && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Solicitar Troca
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
