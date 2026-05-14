import { useEffect, useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Users, MapPin, Clock, AlertTriangle, CheckCircle2, TrendingUp, Loader2 } from 'lucide-react';
import { format, parseISO, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CLOCK_TYPE_LABELS, ClockType } from '@/types';
import { getImpersonatedCompanyId } from '@/components/ImpersonationBar';

interface DashboardStats {
  totalEmployees: number;
  totalLocations: number;
  clockInsToday: number;
  pendingAlerts: number;
}

interface RecentClock {
  id: string;
  employee_name: string;
  type: ClockType;
  time: string;
  location_name: string;
}

export default function Dashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalEmployees: 0,
    totalLocations: 0,
    clockInsToday: 0,
    pendingAlerts: 0,
  });
  const [recentClocks, setRecentClocks] = useState<RecentClock[]>([]);
  const [onTimeCount, setOnTimeCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const today = new Date();
        const startOfToday = startOfDay(today).toISOString();
        const endOfToday = endOfDay(today).toISOString();
        const impersonatedCompanyId = getImpersonatedCompanyId();

        // Fetch employees count
        let employeesQuery = supabase
          .from('employees')
          .select('*', { count: 'exact', head: true })
          .eq('is_active', true);
        
        if (impersonatedCompanyId) {
          employeesQuery = employeesQuery.eq('company_id', impersonatedCompanyId);
        }
        const { count: employeesCount } = await employeesQuery;

        // Fetch locations count
        let locationsQuery = supabase
          .from('locations')
          .select('*', { count: 'exact', head: true });
        
        if (impersonatedCompanyId) {
          locationsQuery = locationsQuery.eq('company_id', impersonatedCompanyId);
        }
        const { count: locationsCount } = await locationsQuery;

        // Fetch employees for filtering clock records
        let allEmployeesQuery = supabase
          .from('employees')
          .select('id, user_id, work_start_time')
          .eq('is_active', true);
        
        if (impersonatedCompanyId) {
          allEmployeesQuery = allEmployeesQuery.eq('company_id', impersonatedCompanyId);
        }
        const { data: allEmployees } = await allEmployeesQuery;
        const companyEmployeeIds = (allEmployees || []).map(e => e.id);

        // Fetch today's clock records count (filtered by company employees)
        let clockInsCount = 0;
        let clockRecords: any[] = [];
        
        if (companyEmployeeIds.length > 0) {
          const { count } = await supabase
            .from('clock_records')
            .select('*', { count: 'exact', head: true })
            .gte('timestamp', startOfToday)
            .lte('timestamp', endOfToday)
            .in('employee_id', companyEmployeeIds);
          clockInsCount = count || 0;

          // Fetch recent clock records with employee and location data
          const { data } = await supabase
            .from('clock_records')
            .select(`
              id,
              type,
              timestamp,
              employee_id,
              location_id
            `)
            .gte('timestamp', startOfToday)
            .lte('timestamp', endOfToday)
            .in('employee_id', companyEmployeeIds)
            .order('timestamp', { ascending: false })
            .limit(10);
          clockRecords = data || [];
        }

        // Fetch employee and location data
        const employeeIds = [...new Set(clockRecords?.map(r => r.employee_id) || [])];
        const locationIds = [...new Set(clockRecords?.map(r => r.location_id) || [])];

        const [employeesData, locationsData, profilesData] = await Promise.all([
          supabase.from('employees').select('id, user_id').in('id', employeeIds.length > 0 ? employeeIds : ['']),
          supabase.from('locations').select('id, name').in('id', locationIds.length > 0 ? locationIds : ['']),
          employeeIds.length > 0 
            ? supabase.from('profiles').select('id, name')
            : Promise.resolve({ data: [] })
        ]);

        // Map employee user_ids to profile names
        const employeeToUserMap: Record<string, string> = {};
        employeesData.data?.forEach(emp => {
          employeeToUserMap[emp.id] = emp.user_id;
        });

        const userToNameMap: Record<string, string> = {};
        profilesData.data?.forEach((p: any) => {
          userToNameMap[p.id] = p.name;
        });

        const locationMap: Record<string, string> = {};
        locationsData.data?.forEach(loc => {
          locationMap[loc.id] = loc.name;
        });

        const recentClocksFormatted: RecentClock[] = (clockRecords || []).slice(0, 5).map(record => ({
          id: record.id,
          employee_name: userToNameMap[employeeToUserMap[record.employee_id]] || 'Funcionário',
          type: record.type as ClockType,
          time: format(parseISO(record.timestamp), 'HH:mm'),
          location_name: locationMap[record.location_id] || 'Local',
        }));

        // Calculate on-time and pending counts
        // Only count employees as pending if their scheduled start time has passed
        const employeesWithEntry = new Set(
          clockRecords?.filter(r => r.type === 'entry').map(r => r.employee_id) || []
        );

        // Get current time in minutes
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinutes = now.getMinutes();
        const currentTimeInMinutes = currentHour * 60 + currentMinutes;

        // Fetch fixed schedules for today to know each employee's start time
        const dayOfWeek = now.getDay();
        const todayDate = format(now, 'yyyy-MM-dd');
        
        let schedulesQuery = supabase
          .from('fixed_schedules')
          .select('employee_id, start_time')
          .eq('day_of_week', dayOfWeek)
          .eq('works', true);
        
        const { data: fixedSchedules } = await schedulesQuery;
        
        // Also get punctual schedules for today (they override fixed schedules)
        const { data: punctualSchedules } = await supabase
          .from('punctual_schedules')
          .select('employee_id, start_time')
          .eq('date', todayDate);
        
        // Create a map of employee_id to their start_time (punctual takes priority)
        const employeeStartTimeMap: Record<string, number> = {};
        
        fixedSchedules?.forEach(schedule => {
          const [hours, minutes] = schedule.start_time.split(':').map(Number);
          employeeStartTimeMap[schedule.employee_id] = hours * 60 + minutes;
        });
        
        // Punctual schedules override fixed schedules
        punctualSchedules?.forEach(schedule => {
          const [hours, minutes] = schedule.start_time.split(':').map(Number);
          employeeStartTimeMap[schedule.employee_id] = hours * 60 + minutes;
        });

        let onTime = 0;
        let pending = 0;

        allEmployees?.forEach(emp => {
          if (employeesWithEntry.has(emp.id)) {
            onTime++;
          } else {
            // Only count as pending if their scheduled start time has passed
            const startTimeMinutes = employeeStartTimeMap[emp.id];
            if (startTimeMinutes !== undefined && currentTimeInMinutes >= startTimeMinutes) {
              pending++;
            }
            // If no schedule or start time hasn't passed yet, don't count as pending
          }
        });

        setStats({
          totalEmployees: employeesCount || 0,
          totalLocations: locationsCount || 0,
          clockInsToday: clockInsCount || 0,
          pendingAlerts: pending,
        });
        setRecentClocks(recentClocksFormatted);
        setOnTimeCount(onTime);
        setPendingCount(pending);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const statCards = [
    {
      title: 'Funcionários',
      value: stats.totalEmployees,
      icon: <Users className="h-6 w-6" />,
      color: 'text-primary',
      bgColor: 'bg-[hsl(var(--pastel-blue))]',
    },
    {
      title: 'Batidas Hoje',
      value: stats.clockInsToday,
      icon: <Clock className="h-6 w-6" />,
      color: 'text-success',
      bgColor: 'bg-[hsl(var(--pastel-green))]',
    },
  ];

  const punctualityRate = stats.totalEmployees > 0 
    ? Math.round((onTimeCount / stats.totalEmployees) * 100) 
    : 0;

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
        <div className="space-y-1">
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground">
            Olá, {profile?.name?.split(' ')[0] || 'Usuário'}! 👋
          </h1>
          <p className="text-muted-foreground">
            Acompanhe o controle de ponto da sua empresa
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4">
          {statCards.map((stat, index) => (
            <Card 
              key={stat.title} 
              className="card-modern animate-slide-up overflow-hidden" 
              style={{ animationDelay: `${index * 80}ms` }}
            >
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground font-medium">{stat.title}</p>
                    <p className="text-3xl font-bold mt-1 text-foreground">{stat.value}</p>
                  </div>
                  <div className={`p-3 rounded-xl ${stat.bgColor} ${stat.color}`}>
                    {stat.icon}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Recent Activity & Status */}
        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="card-modern animate-slide-up" style={{ animationDelay: '160ms' }}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <Clock className="h-5 w-5 text-primary" />
                Batidas Recentes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentClocks.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Clock className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p>Nenhuma batida registrada hoje</p>
                  </div>
                ) : (
                  recentClocks.map((clock) => (
                    <div
                      key={clock.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-secondary/50 hover:bg-secondary/80 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                          {clock.employee_name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-sm text-foreground">{clock.employee_name}</p>
                          <p className="text-xs text-muted-foreground">{clock.location_name}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                          clock.type === 'entry' ? 'bg-success/10 text-success' :
                          clock.type === 'exit' ? 'bg-destructive/10 text-destructive' :
                          'bg-warning/10 text-warning'
                        }`}>
                          {CLOCK_TYPE_LABELS[clock.type]}
                        </span>
                        <p className="text-xs text-muted-foreground mt-1">{clock.time}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="card-modern animate-slide-up" style={{ animationDelay: '240ms' }}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <TrendingUp className="h-5 w-5 text-success" />
                Status do Dia
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* On time */}
                <div className="flex items-center gap-4 p-4 rounded-xl bg-[hsl(var(--pastel-green))] border border-success/20">
                  <div className="p-2 rounded-lg bg-success/20">
                    <CheckCircle2 className="h-6 w-6 text-success" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{onTimeCount} funcionário{onTimeCount !== 1 ? 's' : ''}</p>
                    <p className="text-sm text-muted-foreground">Bateram ponto hoje</p>
                  </div>
                </div>

                {/* Pending */}
                <div className="flex items-center gap-4 p-4 rounded-xl bg-[hsl(var(--pastel-yellow))] border border-warning/20">
                  <div className="p-2 rounded-lg bg-warning/20">
                    <AlertTriangle className="h-6 w-6 text-warning" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{pendingCount} funcionário{pendingCount !== 1 ? 's' : ''}</p>
                    <p className="text-sm text-muted-foreground">Aguardando batida de ponto</p>
                  </div>
                </div>

                {/* Punctuality rate */}
                <div className="p-4 rounded-xl bg-[hsl(var(--pastel-blue))] border border-primary/20">
                  <p className="text-sm text-muted-foreground mb-3">Taxa de pontualidade</p>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-3 bg-secondary rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary rounded-full transition-all duration-700 ease-out" 
                        style={{ width: `${punctualityRate}%` }} 
                      />
                    </div>
                    <span className="font-bold text-primary text-lg">{punctualityRate}%</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}
