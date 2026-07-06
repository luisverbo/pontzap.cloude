import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';
import { savePendingClockRecord, isOnline } from '@/lib/offlineStorage';

type ClockRecord = Tables<'clock_records'>;
type ClockType = 'entry' | 'lunch_out' | 'lunch_in' | 'exit';

export interface ClockRecordWithDetails extends ClockRecord {
  location?: Tables<'locations'>;
}

interface LocationWithRadius {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
}

// Calculate distance between two coordinates in meters (Haversine formula)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function useClockRecords(employeeId?: string) {
  const [records, setRecords] = useState<ClockRecordWithDetails[]>([]);
  const [todayRecords, setTodayRecords] = useState<ClockRecordWithDetails[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRecords = async () => {
    if (!employeeId) {
      setLoading(false);
      return;
    }

    // If offline, just set loading to false and keep existing records
    if (!isOnline()) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('clock_records')
        .select(`
          *,
          location:locations(*)
        `)
        .eq('employee_id', employeeId)
        .order('timestamp', { ascending: false });

      if (error) throw error;

      setRecords(data || []);

      // Filter today's records
      const today = new Date().toDateString();
      const todayData = (data || []).filter(
        (r) => new Date(r.timestamp).toDateString() === today
      );
      setTodayRecords(todayData);
    } catch (error: any) {
      console.error('Error fetching clock records:', error);
    } finally {
      setLoading(false);
    }
  };

  const validateLocation = async (
    locationId: string,
    userLat: number,
    userLng: number
  ): Promise<{ valid: boolean; distance: number; location: LocationWithRadius | null }> => {
    // If offline, skip validation
    if (!isOnline()) {
      return { valid: true, distance: 0, location: null };
    }

    try {
      const { data: location, error } = await supabase
        .from('locations')
        .select('id, name, latitude, longitude, radius')
        .eq('id', locationId)
        .single();

      if (error || !location) {
        return { valid: false, distance: 0, location: null };
      }

      const distance = calculateDistance(
        userLat,
        userLng,
        location.latitude,
        location.longitude
      );

      return {
        valid: distance <= location.radius,
        distance: Math.round(distance),
        location,
      };
    } catch (error) {
      console.error('Error validating location:', error);
      return { valid: false, distance: 0, location: null };
    }
  };

  const clockIn = async (
    type: ClockType,
    locationId: string,
    method: 'gps' | 'qr',
    latitude?: number,
    longitude?: number
  ): Promise<{ success: boolean; outsideRadius?: boolean; distance?: number; recordId?: string; offline?: boolean }> => {
    if (!employeeId) {
      toast.error('Funcionário não identificado');
      return { success: false };
    }

    const timestamp = new Date().toISOString();

    // If offline, save locally
    if (!isOnline()) {
      try {
        const localId = await savePendingClockRecord({
          employee_id: employeeId,
          location_id: locationId,
          type,
          method,
          latitude,
          longitude,
          timestamp,
        });

        toast.success('✅ Ponto registrado OFFLINE. Será enviado quando a conexão voltar.', {
          duration: 5000,
        });

        // Add to local today records for UI display
        const newRecord: ClockRecordWithDetails = {
          id: localId,
          employee_id: employeeId,
          location_id: locationId,
          type,
          method,
          latitude: latitude || null,
          longitude: longitude || null,
          timestamp,
          created_at: timestamp,
          is_manual: false,
          manual_observation: null,
          manual_registered_by: null,
        };
        setTodayRecords(prev => [...prev, newRecord]);

        return { success: true, recordId: localId, offline: true };
      } catch (error) {
        console.error('Error saving offline record:', error);
        toast.error('Erro ao salvar ponto offline');
        return { success: false };
      }
    }

    // Online: register through the server. The Edge Function is the trust
    // boundary — it sets the timestamp, validates the geofence and the company
    // ownership of the location, and creates the folguista payment record. The
    // client no longer inserts directly.
    try {
      const { data, error } = await supabase.functions.invoke('register-clock', {
        body: { type, locationId, method, latitude, longitude },
      });

      // Non-2xx responses arrive as `error` with the Response in error.context
      if (error) {
        let info: any = {};
        try { info = await (error as any).context?.json?.(); } catch { /* ignore */ }
        if (info?.outsideRadius) {
          toast.error(info.error || 'Você está fora do raio permitido.', { duration: 8000 });
          return { success: false, outsideRadius: true, distance: info.distance };
        }
        toast.error(info?.error || 'Erro ao registrar ponto');
        return { success: false };
      }

      if (!data?.success) {
        if (data?.outsideRadius) {
          toast.error(data.error || 'Você está fora do raio permitido.', { duration: 8000 });
          return { success: false, outsideRadius: true, distance: data.distance };
        }
        toast.error(data?.error || 'Erro ao registrar ponto');
        return { success: false };
      }

      await fetchRecords();
      toast.success('Ponto registrado com sucesso!');
      return { success: true, recordId: data.recordId };
    } catch (error: any) {
      console.error('Error clocking in:', error);

      // If network error, try to save offline
      if (error.message?.includes('network') || error.message?.includes('Failed to fetch')) {
        try {
          const localId = await savePendingClockRecord({
            employee_id: employeeId,
            location_id: locationId,
            type,
            method,
            latitude,
            longitude,
            timestamp,
          });

          toast.success('✅ Ponto registrado OFFLINE. Será enviado quando a conexão voltar.', {
            duration: 5000,
          });

          const newRecord: ClockRecordWithDetails = {
            id: localId,
            employee_id: employeeId,
            location_id: locationId,
            type,
            method,
            latitude: latitude || null,
            longitude: longitude || null,
            timestamp,
            created_at: timestamp,
            is_manual: false,
            manual_observation: null,
            manual_registered_by: null,
          };
          setTodayRecords(prev => [...prev, newRecord]);

          return { success: true, recordId: localId, offline: true };
        } catch (offlineError) {
          console.error('Error saving offline fallback:', offlineError);
        }
      }
      
      toast.error('Erro ao registrar ponto');
      return { success: false };
    }
  };

  useEffect(() => {
    fetchRecords();
  }, [employeeId]);

  return {
    records,
    todayRecords,
    loading,
    clockIn,
    refetch: fetchRecords,
    validateLocation,
  };
}
