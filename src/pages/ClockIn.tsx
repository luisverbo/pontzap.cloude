import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  QrCode, 
  MapPin, 
  CheckCircle2, 
  Loader2,
  LogIn,
  Coffee,
  LogOut as LogOutIcon,
  Settings,
  KeyRound,
  Wallet,
  Calendar,
  DollarSign,
  ChevronDown,
  FileText,
  ClipboardList
} from 'lucide-react';
import { ClockType, CLOCK_TYPE_LABELS } from '@/types';
import { useClockRecords, type ClockReceipt } from '@/hooks/useClockRecords';
import { useSelfieCapture } from '@/hooks/useSelfieCapture';
import { getCurrentPosition, GeoError, openLocationSettings, type GeoErrorKind } from '@/lib/nativeGeo';
import { ensureCameraPermission } from '@/lib/nativePermissions';
import { isNative } from '@/lib/native';
import { ClockReceiptDialog } from '@/components/clock/ClockReceiptDialog';
import { QRCodeScanner } from '@/components/clock/QRCodeScanner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useNavigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';

interface Anotacao {
  id: string;
  data_trabalho: string;
  valor: number;
  status: string;
  observacao: string | null;
  local_id: string | null;
  periodo_id: string | null;
  locations?: { name: string } | null;
}

interface Periodo {
  id: string;
  periodo_mes: number;
  periodo_ano: number;
}

interface PeriodoGroup {
  periodo: Periodo | null;
  mesAno: string;
  anotacoes: Anotacao[];
  totalAPagar: number;
  totalPago: number;
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

interface ClockButton {
  type: ClockType;
  label: string;
  icon: React.ReactNode;
  color: string;
}

const clockButtons: ClockButton[] = [
  { type: 'entry', label: 'Entrada', icon: <LogIn className="h-6 w-6" />, color: 'bg-success hover:bg-success/90' },
  { type: 'lunch_out', label: 'Saída Almoço', icon: <Coffee className="h-6 w-6" />, color: 'bg-warning hover:bg-warning/90' },
  { type: 'lunch_in', label: 'Volta Almoço', icon: <Coffee className="h-6 w-6" />, color: 'bg-primary hover:bg-primary/90' },
  { type: 'exit', label: 'Saída', icon: <LogOutIcon className="h-6 w-6" />, color: 'bg-accent hover:bg-accent/90' },
];

export default function ClockIn() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [loading, setLoading] = useState<ClockType | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [gpsErrorKind, setGpsErrorKind] = useState<GeoErrorKind | null>(null);
  const [refreshingLocation, setRefreshingLocation] = useState(false);
  const [employeeData, setEmployeeData] = useState<{ id: string; locationId: string | null; companyId: string | null; type: string; valorDiaria: number | null } | null>(null);
  const [requireClockPhoto, setRequireClockPhoto] = useState(false);
  const { capture: captureSelfie, overlay: selfieOverlay } = useSelfieCapture();
  const [loadingEmployee, setLoadingEmployee] = useState(true);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [pendingClockType, setPendingClockType] = useState<ClockType | null>(null);
  const [receipt, setReceipt] = useState<ClockReceipt | null>(null);

  const openReceiptFor = (record: any) => {
    setReceipt({
      nsr: record.nsr ?? null,
      hash: record.record_hash ?? null,
      timestamp: record.timestamp,
      type: record.type,
      locationName: record.location?.name || 'Local',
    });
  };

  // Password change dialog state
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [changingPassword, setChangingPassword] = useState(false);

  // Anotações (folguista work entries)
  const [anotacoes, setAnotacoes] = useState<Anotacao[]>([]);
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [loadingAnotacoes, setLoadingAnotacoes] = useState(false);
  const [expandedPeriodos, setExpandedPeriodos] = useState<Set<string>>(new Set());

  const { todayRecords, clockIn, refetch } = useClockRecords(employeeData?.id);
  const { online, syncing, pendingCount, syncPendingRecords, updatePendingCount } = useOfflineSync();

  const togglePeriodo = (periodoKey: string) => {
    setExpandedPeriodos(prev => {
      const newSet = new Set(prev);
      if (newSet.has(periodoKey)) {
        newSet.delete(periodoKey);
      } else {
        newSet.add(periodoKey);
      }
      return newSet;
    });
  };

  // Fetch anotações for folguista
  useEffect(() => {
    const fetchAnotacoes = async () => {
      if (!employeeData?.id) return;
      
      setLoadingAnotacoes(true);
      try {
        // Fetch periodos
        const { data: periodosData } = await supabase
          .from('anotacoes_periodo')
          .select('id, periodo_mes, periodo_ano')
          .eq('folguista_id', employeeData.id)
          .order('periodo_ano', { ascending: false })
          .order('periodo_mes', { ascending: false });

        setPeriodos(periodosData || []);

        // Fetch anotacoes
        const { data, error } = await supabase
          .from('anotacoes_folguista')
          .select(`
            id,
            data_trabalho,
            valor,
            status,
            observacao,
            local_id,
            periodo_id,
            locations(name)
          `)
          .eq('folguista_id', employeeData.id)
          .order('data_trabalho', { ascending: false });

        if (error) throw error;
        setAnotacoes(data || []);
      } catch (error) {
        console.error('Error fetching anotacoes:', error);
      } finally {
        setLoadingAnotacoes(false);
      }
    };

    fetchAnotacoes();
  }, [employeeData?.id]);

  // Group anotações by period
  const groupedAnotacoes = (): PeriodoGroup[] => {
    const groups: Map<string, PeriodoGroup> = new Map();
    
    anotacoes.forEach(anotacao => {
      let key: string;
      let periodo: Periodo | null = null;
      
      if (anotacao.periodo_id) {
        periodo = periodos.find(p => p.id === anotacao.periodo_id) || null;
        if (periodo) {
          key = `${periodo.periodo_ano}-${periodo.periodo_mes}`;
        } else {
          // Fallback: extract from date
          const date = new Date(anotacao.data_trabalho + 'T12:00:00');
          key = `${date.getFullYear()}-${date.getMonth() + 1}`;
        }
      } else {
        // No period, use date
        const date = new Date(anotacao.data_trabalho + 'T12:00:00');
        key = `${date.getFullYear()}-${date.getMonth() + 1}`;
      }
      
      if (!groups.has(key)) {
        const [ano, mes] = key.split('-').map(Number);
        groups.set(key, {
          periodo,
          mesAno: `${MESES[mes - 1]}/${ano}`,
          anotacoes: [],
          totalAPagar: 0,
          totalPago: 0
        });
      }
      
      const group = groups.get(key)!;
      group.anotacoes.push(anotacao);
      if (anotacao.status === 'pago') {
        group.totalPago += Number(anotacao.valor);
      } else {
        group.totalAPagar += Number(anotacao.valor);
      }
    });
    
    // Sort by year/month descending
    return Array.from(groups.values()).sort((a, b) => {
      const [mesA, anoA] = a.mesAno.split('/');
      const [mesB, anoB] = b.mesAno.split('/');
      const yearDiff = Number(anoB) - Number(anoA);
      if (yearDiff !== 0) return yearDiff;
      return MESES.indexOf(mesB) - MESES.indexOf(mesA);
    });
  };

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Get user's location — native GPS in the app (with permission dialog),
  // browser geolocation on the web. Reusable so the user can retry after
  // granting permission or turning the GPS on.
  const refreshLocation = async () => {
    setRefreshingLocation(true);
    setLocationError(null);
    setGpsErrorKind(null);
    try {
      const coords = await getCurrentPosition();
      setLocation(coords);
      setGpsErrorKind(null);
    } catch (e) {
      const kind = e instanceof GeoError ? e.kind : 'unavailable';
      setGpsErrorKind(kind);
      setLocationError(
        kind === 'disabled'
          ? 'O GPS do celular está desligado. Ative a localização e toque em Tentar novamente.'
          : kind === 'permission'
          ? 'Permissão de localização negada. Permita o acesso e toque em Tentar novamente.'
          : 'Não foi possível obter sua localização.'
      );
    } finally {
      setRefreshingLocation(false);
    }
  };

  useEffect(() => {
    refreshLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch employee data
  useEffect(() => {
    const fetchEmployeeData = async () => {
      if (!user) return;

      try {
        const { data: employee, error } = await supabase
          .from('employees')
          .select(`
            id,
            company_id,
            type,
            valor_diaria,
            employee_locations(
              location_id,
              is_primary
            ),
            companies(
              require_clock_photo
            )
          `)
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) throw error;

        if (employee) {
          const primaryLocation = employee.employee_locations?.find((l: any) => l.is_primary);
          const firstLocation = employee.employee_locations?.[0];

          setEmployeeData({
            id: employee.id,
            locationId: primaryLocation?.location_id || firstLocation?.location_id || null,
            companyId: employee.company_id,
            type: (employee as any).type || 'fixed',
            valorDiaria: (employee as any).valor_diaria ?? null,
          });
          setRequireClockPhoto(!!(employee as any).companies?.require_clock_photo);
        }
      } catch (error) {
        console.error('Error fetching employee data:', error);
      } finally {
        setLoadingEmployee(false);
      }
    };

    fetchEmployeeData();
  }, [user]);

  // Folguista payment records are now created server-side by the register-clock
  // Edge Function (correct timezone, value from the DB, RLS-safe), so there is
  // no client-side auto-creation anymore.

  const sendWhatsAppNotification = async (clockRecordId: string, type: ClockType, method: 'qr' | 'gps') => {
    try {
      console.log('Sending WhatsApp notification for clock record:', clockRecordId);
      await supabase.functions.invoke('send-whatsapp', {
        body: { clockRecordId, type, method }
      });
    } catch (error) {
      console.error('Error sending WhatsApp notification:', error);
      // Don't show error to user - notification is optional
    }
  };

  // For entry and exit: open QR scanner first. Request camera permission up front
  // (native) so the scanner's camera can actually open on Android.
  const handleEntryExitClick = (type: ClockType) => {
    setPendingClockType(type);
    setShowQRScanner(true);
    if (isNative) {
      ensureCameraPermission();
    }
  };

  // For lunch: clock in directly without QR (GPS based)
  const handleLunchClockIn = async (type: ClockType) => {
    if (!location) {
      toast.error('Localização não disponível. Verifique as permissões do GPS.');
      return;
    }

    const isSubstitute = employeeData?.type === 'substitute';
    if (!isSubstitute && !employeeData?.locationId) {
      toast.error('Você não está associado a nenhum local de trabalho.');
      return;
    }

    // Capture the selfie when the company requires it. On native, ensure the
    // camera permission first (Android WebView getUserMedia needs it; unlike iOS
    // web it isn't tap-gesture-locked). On web, keep captureSelfie() in the tap
    // gesture (iOS requirement) with no await before it.
    let photo: string | undefined;
    if (requireClockPhoto) {
      if (isNative) await ensureCameraPermission();
      photo = (await captureSelfie()) || undefined;
    }

    setLoading(type);

    const locationId = employeeData?.locationId || null;
    const result = await clockIn(type, locationId!, 'gps', location.lat, location.lng, photo || undefined);

    if (result.success && result.recordId) {
      if (result.offline) {
        updatePendingCount();
      } else {
        sendWhatsAppNotification(result.recordId, type, 'gps');
        if (result.receipt) setReceipt(result.receipt);
      }
      await refetch();
    }

    setLoading(null);
  };

  // GPS fallback for entry/exit. The selfie (when required) is captured inside the
  // QR scanner's tap gesture and passed in here.
  const handleGPSFallback = async (type: ClockType, photo?: string) => {
    if (!location) {
      toast.error('Localização não disponível. Verifique as permissões do GPS.');
      return;
    }

    const isSubstitute = employeeData?.type === 'substitute';
    if (!isSubstitute && !employeeData?.locationId) {
      toast.error('Você não está associado a nenhum local de trabalho.');
      return;
    }

    setLoading(type);

    const locationId = employeeData?.locationId || null;
    const result = await clockIn(type, locationId!, 'gps', location.lat, location.lng, photo || undefined);

    if (result.success && result.recordId) {
      if (result.offline) {
        updatePendingCount();
      } else {
        sendWhatsAppNotification(result.recordId, type, 'gps');
        if (result.receipt) setReceipt(result.receipt);
      }
      // The folguista payment record is created server-side on entry.
      await refetch();
    }

    setLoading(null);
    setShowQRScanner(false);
    setPendingClockType(null);
  };

  const handleQRClockIn = async (type: ClockType, locationId: string, photo?: string): Promise<{ success: boolean }> => {
    if (!employeeData?.id) {
      toast.error('Funcionário não identificado');
      return { success: false };
    }

    // The selfie (anti-fraud) is captured inside the scanner, within the button
    // tap gesture, and passed in here. Send GPS coordinates too so the server
    // enforces the geofence — a photo/screenshot of the QR no longer works.
    const result = await clockIn(type, locationId, 'qr', location?.lat, location?.lng, photo || undefined);

    if (result.success && result.recordId) {
      sendWhatsAppNotification(result.recordId, type, 'qr');
      if (result.receipt) setReceipt(result.receipt);
      // The folguista payment record is created server-side on entry.
      await refetch();
    }

    return result;
  };

  const handlePasswordChange = async () => {
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      toast.error('Preencha todos os campos');
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      toast.error('A nova senha deve ter pelo menos 6 caracteres');
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('As senhas não conferem');
      return;
    }

    setChangingPassword(true);
    try {
      // First verify the current password by signing in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email || '',
        password: passwordForm.currentPassword,
      });

      if (signInError) {
        toast.error('Senha atual incorreta');
        setChangingPassword(false);
        return;
      }

      // Update to new password
      const { error: updateError } = await supabase.auth.updateUser({
        password: passwordForm.newPassword,
      });

      if (updateError) throw updateError;

      toast.success('Senha alterada com sucesso!');
      setShowPasswordDialog(false);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error: any) {
      console.error('Error changing password:', error);
      toast.error(error.message || 'Erro ao alterar senha');
    } finally {
      setChangingPassword(false);
    }
  };

  const getDisabledClockTypes = (): ClockType[] => {
    return todayRecords.map(r => r.type as ClockType);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getTimeFromRecord = (type: ClockType) => {
    const record = todayRecords.find((r) => r.type === type);
    if (record) {
      return new Date(record.timestamp).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    return null;
  };

  if (loadingEmployee) {
    return (
      <MainLayout>
        <div className="max-w-2xl mx-auto px-4 sm:px-0 space-y-4 sm:space-y-6 pb-6">
          <div className="flex items-center justify-between gap-2 pt-2">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-6 w-40 mx-auto" />
              <Skeleton className="h-4 w-32 mx-auto" />
            </div>
          </div>
          <Card variant="default">
            <div className="py-8 sm:py-10 px-4 flex flex-col items-center gap-3">
              <Skeleton className="h-14 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          </Card>
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <Skeleton className="h-24 sm:h-32 rounded-xl" />
            <Skeleton className="h-24 sm:h-32 rounded-xl" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <Skeleton className="h-20 sm:h-24 rounded-xl" />
            <Skeleton className="h-20 sm:h-24 rounded-xl" />
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto px-4 sm:px-0 space-y-4 sm:space-y-6 animate-fade-in pb-6">
        {/* Welcome Header */}
        <div className="flex items-center justify-between gap-2 pt-2">
          <div className="text-center flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground truncate">
              Bem-vindo, {profile?.name?.split(' ')[0] || 'Funcionário'}!
            </h1>
            <p className="text-muted-foreground capitalize text-xs sm:text-sm mt-1">
              {formatDate(currentTime)}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowPasswordDialog(true)}
            title="Alterar senha"
            className="hover:bg-secondary shrink-0 h-10 w-10"
          >
            <Settings className="h-5 w-5" />
          </Button>
        </div>

        {/* Clock Display — calm, high-contrast, no ambient motion */}
        <Card variant="default" className="text-center overflow-hidden">
          <div className="py-8 sm:py-10 px-4">
            <p className="text-5xl sm:text-6xl lg:text-7xl font-bold text-foreground font-mono tabular-nums tracking-tight leading-none">
              {formatTime(currentTime)}
            </p>
            <div className="mt-3 flex items-center justify-center gap-1.5 text-xs sm:text-sm">
              {location ? (
                <>
                  <MapPin className="h-3.5 w-3.5 text-success" />
                  <span className="text-success font-medium">Localização ativa</span>
                </>
              ) : refreshingLocation ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  <span className="text-muted-foreground">Localizando...</span>
                </>
              ) : locationError ? (
                <>
                  <MapPin className="h-3.5 w-3.5 text-destructive" />
                  <span className="text-destructive font-medium">Sem GPS</span>
                </>
              ) : (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  <span className="text-muted-foreground">Localizando...</span>
                </>
              )}
            </div>

            {/* Helpful recovery actions when there's no GPS fix */}
            {!location && !refreshingLocation && locationError && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-muted-foreground max-w-xs mx-auto">{locationError}</p>
                <div className="flex items-center justify-center gap-2">
                  <Button size="sm" variant="outline" onClick={refreshLocation} className="h-9">
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    Tentar novamente
                  </Button>
                  {isNative && (gpsErrorKind === 'disabled' || gpsErrorKind === 'unavailable') && (
                    <Button size="sm" onClick={() => openLocationSettings()} className="h-9">
                      <MapPin className="h-3.5 w-3.5 mr-1.5" />
                      Ativar GPS
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Entry and Exit - QR Code Primary */}
        <Card variant="default">
          <CardHeader className="px-4 sm:px-6 py-3 sm:py-4">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <QrCode className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              Entrada e Saída
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">Use o QR Code do local de trabalho</CardDescription>
          </CardHeader>
          <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
            {!employeeData?.locationId && employeeData?.type !== 'substitute' && (
              <div className="mb-3 sm:mb-4 p-2 sm:p-3 rounded-lg bg-warning/10 text-warning text-xs sm:text-sm text-center">
                Você não está associado a nenhum local de trabalho. Contate o administrador.
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              {clockButtons.filter(btn => btn.type === 'entry' || btn.type === 'exit').map((btn) => {
                const existingTime = getTimeFromRecord(btn.type);
                const alreadyClocked = !!existingTime;
                const isEntry = btn.type === 'entry';
                return (
                  <Button
                    key={btn.type}
                    size="xl"
                    className={`flex-col h-24 sm:h-32 gap-2 sm:gap-3 rounded-xl transition-colors duration-150 touch-manipulation active:scale-[0.98] ${
                      alreadyClocked
                        ? 'bg-muted text-muted-foreground'
                        : isEntry
                          ? 'bg-success hover:bg-success/90 text-success-foreground'
                          : 'bg-accent hover:bg-accent/90 text-accent-foreground'
                    }`}
                    onClick={() => handleEntryExitClick(btn.type)}
                    disabled={loading !== null || alreadyClocked || (!employeeData?.locationId && employeeData?.type !== 'substitute')}
                  >
                    {loading === btn.type ? (
                      <Loader2 className="h-8 w-8 sm:h-10 sm:w-10 animate-spin" />
                    ) : alreadyClocked ? (
                      <CheckCircle2 className="h-8 w-8 sm:h-10 sm:w-10" />
                    ) : (
                      <QrCode className="h-8 w-8 sm:h-10 sm:w-10" />
                    )}
                    <span className="text-base sm:text-lg font-bold">{btn.label}</span>
                    {alreadyClocked && (
                      <span className="text-xs sm:text-sm opacity-80">{existingTime}</span>
                    )}
                  </Button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Lunch - Direct GPS */}
        <Card variant="default">
          <CardHeader className="px-4 sm:px-6 py-3 sm:py-4">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Coffee className="h-4 w-4 sm:h-5 sm:w-5 text-warning" />
              Almoço
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">Registre saída e retorno do almoço</CardDescription>
          </CardHeader>
          <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              {clockButtons.filter(btn => btn.type === 'lunch_out' || btn.type === 'lunch_in').map((btn) => {
                const existingTime = getTimeFromRecord(btn.type);
                const alreadyClocked = !!existingTime;
                return (
                  <Button
                    key={btn.type}
                    size="xl"
                    className={`${btn.color} text-white flex-col h-20 sm:h-24 gap-1.5 sm:gap-2 rounded-xl sm:rounded-2xl touch-manipulation`}
                    onClick={() => handleLunchClockIn(btn.type)}
                    disabled={loading !== null || alreadyClocked || !location || (!employeeData?.locationId && employeeData?.type !== 'substitute')}
                  >
                    {loading === btn.type ? (
                      <Loader2 className="h-5 w-5 sm:h-6 sm:w-6 animate-spin" />
                    ) : alreadyClocked ? (
                      <CheckCircle2 className="h-5 w-5 sm:h-6 sm:w-6" />
                    ) : (
                      <span className="[&>svg]:h-5 [&>svg]:w-5 sm:[&>svg]:h-6 sm:[&>svg]:w-6">{btn.icon}</span>
                    )}
                    <span className="text-xs sm:text-sm font-semibold">{btn.label}</span>
                    {alreadyClocked && (
                      <span className="text-[10px] sm:text-xs opacity-80">{existingTime}</span>
                    )}
                  </Button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Shift Swap Link */}
        <Card variant="default">
          <CardContent className="p-4">
            <Button
              variant="outline"
              className="w-full justify-start gap-3"
              onClick={() => window.location.href = '/my-shift-swaps'}
            >
              <RefreshCw className="h-5 w-5 text-primary" />
              <div className="text-left">
                <p className="font-medium">Troca de Escalas</p>
                <p className="text-xs text-muted-foreground">Solicitar ou aceitar trocas</p>
              </div>
            </Button>
          </CardContent>
        </Card>

        {/* Livro de Ocorrências */}
        <Card variant="default">
          <CardContent className="p-4">
            <Button
              variant="outline"
              className="w-full justify-start gap-3"
              onClick={() => navigate('/minhas-ocorrencias')}
            >
              <ClipboardList className="h-5 w-5 text-primary" />
              <div className="text-left">
                <p className="font-medium">Livro de Ocorrências</p>
                <p className="text-xs text-muted-foreground">Registrar ocorrência no local</p>
              </div>
            </Button>
          </CardContent>
        </Card>

        {/* QR Code Scanner Modal */}
        {showQRScanner && (
          <QRCodeScanner
            onScan={(locationId, locationName) => {
              console.log('Location scanned:', locationId, locationName);
            }}
            onClose={() => {
              setShowQRScanner(false);
              setPendingClockType(null);
            }}
            onClockIn={handleQRClockIn}
            disabledTypes={getDisabledClockTypes()}
            defaultClockType={pendingClockType}
            onGPSFallback={pendingClockType ? (photo?: string) => handleGPSFallback(pendingClockType, photo) : undefined}
            hasLocation={!!location}
            requirePhoto={requireClockPhoto}
          />
        )}

        {/* Selfie overlay for the direct (lunch) clock-in buttons */}
        {selfieOverlay}

        {/* Comprovante de Ponto (Portaria 671) */}
        <ClockReceiptDialog
          receipt={receipt}
          employeeName={profile?.name || 'Funcionário'}
          onClose={() => setReceipt(null)}
        />

        {/* Password Change Dialog */}
        <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5" />
                Alterar Senha
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Senha Atual</Label>
                <Input
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                  placeholder="Digite sua senha atual"
                />
              </div>
              <div className="space-y-2">
                <Label>Nova Senha</Label>
                <Input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                  placeholder="Digite a nova senha"
                />
              </div>
              <div className="space-y-2">
                <Label>Confirmar Nova Senha</Label>
                <Input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                  placeholder="Confirme a nova senha"
                />
              </div>
              <Button 
                onClick={handlePasswordChange} 
                disabled={changingPassword}
                className="w-full"
              >
                {changingPassword ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Alterar Senha
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Today's Summary */}
        {todayRecords.length > 0 && (
          <Card variant="default">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="font-medium">Registros de Hoje</p>
                  <p className="text-sm text-muted-foreground">
                    {todayRecords.length} registro{todayRecords.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {todayRecords.map((record) => (
                  <div
                    key={record.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      record.type === 'entry' ? 'bg-success/5 border-success/20' :
                      record.type === 'exit' ? 'bg-destructive/5 border-destructive/20' :
                      'bg-primary/5 border-primary/20'
                    }`}
                  >
                    <span className={`text-xs font-medium ${
                      record.type === 'entry' ? 'text-success' :
                      record.type === 'exit' ? 'text-destructive' :
                      'text-primary'
                    }`}>
                      {CLOCK_TYPE_LABELS[record.type as ClockType]}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-foreground">
                        {format(new Date(record.timestamp), 'HH:mm')}
                      </span>
                      <button
                        onClick={() => openReceiptFor(record)}
                        title="Ver comprovante"
                        className="p-1 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                      >
                        <FileText className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Anotações - Folguista Work Entries - Organized by Period */}
        {anotacoes.length > 0 && (
          <Card variant="default">
            <CardHeader className="px-4 sm:px-6 py-3 sm:py-4">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Wallet className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                Meus Dias Trabalhados
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Seus registros organizados por período
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6 space-y-4">
              {/* Global Summary */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 rounded-lg border border-success/20 bg-success/5 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Total a Receber</p>
                  <p className="text-2xl font-bold text-success font-mono tabular-nums">
                    R$ {anotacoes
                      .filter(a => a.status === 'a_pagar')
                      .reduce((sum, a) => sum + Number(a.valor), 0)
                      .toFixed(2)}
                  </p>
                </div>
                <div className="p-4 rounded-lg border border-border/60 bg-muted/40 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Total Recebido</p>
                  <p className="text-2xl font-bold text-muted-foreground font-mono tabular-nums">
                    R$ {anotacoes
                      .filter(a => a.status === 'pago')
                      .reduce((sum, a) => sum + Number(a.valor), 0)
                      .toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Periods with collapsible entries */}
              <div className="space-y-2">
                {groupedAnotacoes().map((group, idx) => (
                  <Collapsible 
                    key={idx}
                    open={expandedPeriodos.has(group.mesAno)}
                    onOpenChange={() => togglePeriodo(group.mesAno)}
                  >
                    <CollapsibleTrigger asChild>
                      <button className="w-full flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border/50 hover:bg-muted transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                            <Calendar className="h-4 w-4 text-primary" />
                          </div>
                          <div className="text-left">
                            <p className="text-sm font-semibold">{group.mesAno}</p>
                            <p className="text-xs text-muted-foreground">
                              {group.anotacoes.length} dia{group.anotacoes.length !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            {group.totalAPagar > 0 && (
                              <p className="text-xs text-success font-medium">
                                R$ {group.totalAPagar.toFixed(2)}
                              </p>
                            )}
                            {group.totalPago > 0 && (
                              <p className="text-xs text-muted-foreground">
                                Pago: R$ {group.totalPago.toFixed(2)}
                              </p>
                            )}
                          </div>
                          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${
                            expandedPeriodos.has(group.mesAno) ? 'rotate-180' : ''
                          }`} />
                        </div>
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-2">
                      <div className="space-y-1.5 pl-2 border-l-2 border-border ml-4">
                        {group.anotacoes.map((anotacao) => (
                          <div 
                            key={anotacao.id} 
                            className="flex items-center justify-between p-2.5 rounded-lg bg-background border border-border/30"
                          >
                            <div className="flex items-center gap-2">
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                                anotacao.status === 'pago' ? 'bg-success/20' : 'bg-warning/20'
                              }`}>
                                <DollarSign className={`h-3 w-3 ${
                                  anotacao.status === 'pago' ? 'text-success' : 'text-warning'
                                }`} />
                              </div>
                              <div>
                                <p className="text-xs font-medium">
                                  {new Date(anotacao.data_trabalho + 'T12:00:00').toLocaleDateString('pt-BR')}
                                </p>
                                {anotacao.locations?.name && (
                                  <p className="text-[10px] text-muted-foreground">{anotacao.locations.name}</p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold font-mono tabular-nums">
                                R$ {Number(anotacao.valor).toFixed(2)}
                              </span>
                              <Badge
                                variant={anotacao.status === 'pago' ? 'secondary' : 'warning'}
                                className="text-[10px] px-1.5 py-0.5"
                              >
                                {anotacao.status === 'pago' ? 'Pago' : 'A receber'}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {loadingAnotacoes && (
          <Card variant="default">
            <CardContent className="p-4 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        )}
      </div>
      
      {/* Offline Indicator */}
      <OfflineIndicator
        online={online}
        syncing={syncing}
        pendingCount={pendingCount}
        onSync={syncPendingRecords}
      />
    </MainLayout>
  );
}
