import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  getPendingClockRecords,
  markRecordAsSynced,
  deleteRecord,
  isOnline,
  addOnlineListener,
  clearSyncedRecords,
} from '@/lib/offlineStorage';

export function useOfflineSync() {
  const [online, setOnline] = useState(isOnline());
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const updatePendingCount = useCallback(async () => {
    try {
      const records = await getPendingClockRecords();
      setPendingCount(records.length);
    } catch (error) {
      console.error('Error getting pending count:', error);
    }
  }, []);

  const syncPendingRecords = useCallback(async () => {
    if (!isOnline() || syncing) return;

    const pendingRecords = await getPendingClockRecords();
    if (pendingRecords.length === 0) return;

    setSyncing(true);
    let syncedCount = 0;
    let failedCount = 0;

    for (const record of pendingRecords) {
      try {
        const { error } = await supabase.from('clock_records').insert({
          employee_id: record.employee_id,
          location_id: record.location_id,
          type: record.type,
          timestamp: record.timestamp,
          method: record.method,
          latitude: record.latitude,
          longitude: record.longitude,
        });

        if (error) {
          // Check if it's a duplicate error
          if (error.message.includes('duplicado') || error.message.includes('duplicate')) {
            await deleteRecord(record.id);
            syncedCount++;
          } else {
            console.error('Error syncing record:', error);
            failedCount++;
          }
        } else {
          await deleteRecord(record.id);
          syncedCount++;

          // Send WhatsApp notification for synced record
          try {
            await supabase.functions.invoke('send-whatsapp', {
              body: { 
                clockRecordId: record.id, 
                type: record.type, 
                method: record.method,
                offlineSync: true
              }
            });
          } catch (notifError) {
            console.error('Error sending notification for synced record:', notifError);
          }
        }
      } catch (error) {
        console.error('Error processing record:', error);
        failedCount++;
      }
    }

    setSyncing(false);
    await updatePendingCount();

    if (syncedCount > 0) {
      toast.success(`✅ ${syncedCount} registro(s) sincronizado(s) com sucesso!`);
    }
    if (failedCount > 0) {
      toast.error(`❌ ${failedCount} registro(s) não puderam ser sincronizados. Tente novamente mais tarde.`);
    }

    // Clean up old synced records
    await clearSyncedRecords();
  }, [syncing, updatePendingCount]);

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      toast.success('🌐 Conexão restaurada! Sincronizando registros...');
      syncPendingRecords();
    };

    const handleOffline = () => {
      setOnline(false);
      toast.warning('📴 Você está offline. Os registros serão salvos localmente.');
    };

    const removeOnlineListener = addOnlineListener(handleOnline);
    
    window.addEventListener('offline', handleOffline);
    
    // Initial sync check
    updatePendingCount();
    if (isOnline()) {
      syncPendingRecords();
    }

    return () => {
      removeOnlineListener();
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncPendingRecords, updatePendingCount]);

  return {
    online,
    syncing,
    pendingCount,
    syncPendingRecords,
    updatePendingCount,
  };
}
