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

    // Validate GPS location if provided
    if (method === 'gps' && latitude !== undefined && longitude !== undefined) {
      const validation = await validateLocation(locationId, latitude, longitude);
      
      console.log('GPS Validation:', {
        userLat: latitude,
        userLng: longitude,
        locationLat: validation.location?.latitude,
        locationLng: validation.location?.longitude,
        distance: validation.distance,
        radius: validation.location?.radius,
        valid: validation.valid
      });
      
      if (!validation.valid) {
        const distanceText = validation.distance > 1000 
          ? `${(validation.distance / 1000).toFixed(1)}km`
          : `${validation.distance}m`;
        
        toast.error(
          `Você está a ${distanceText} do local "${validation.location?.name}". Raio permitido: ${validation.location?.radius || 100}m.`,
          { duration: 8000 }
        );
        return { success: false, outsideRadius: true, distance: validation.distance };
      }
    }

    try {
      const { data, error } = await supabase.from('clock_records').insert({
        employee_id: employeeId,
        location_id: locationId,
        type,
        method,
        latitude,
        longitude,
        timestamp,
      }).select('id').single();

      if (error) throw error;

      await fetchRecords();
      toast.success('Ponto registrado com sucesso!');
      return { success: true, recordId: data?.id };
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
