import { useState, useEffect, useCallback, useRef } from 'react';
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
  // Synchronous lock so a concurrent online-event + mount-effect can't double-flush
  const syncingRef = useRef(false);

  const updatePendingCount = useCallback(async () => {
    try {
      const records = await getPendingClockRecords();
      setPendingCount(records.length);
    } catch (error) {
      console.error('Error getting pending count:', error);
    }
  }, []);

  const syncPendingRecords = useCallback(async () => {
    if (!isOnline() || syncingRef.current) return;
    syncingRef.current = true;

    try {
      const pendingRecords = await getPendingClockRecords();
      if (pendingRecords.length === 0) return;

      setSyncing(true);
      let syncedCount = 0;
      let failedCount = 0;

      for (const record of pendingRecords) {
        try {
          // Flush through the server so the geofence/tenant checks still apply.
          // offlineTimestamp preserves the original punch time (server bounds it).
          const { data, error } = await supabase.functions.invoke('register-clock', {
            body: {
              type: record.type,
              locationId: record.location_id,
              method: record.method,
              latitude: record.latitude,
              longitude: record.longitude,
              offlineTimestamp: record.timestamp,
            },
          });

          if (error) {
            // With a Response context it's a business rejection (dup / geofence /
            // invalid) that will never succeed → drop it. Without context it's a
            // network/5xx error → keep it for the next retry.
            const ctx = (error as any).context;
            if (ctx) {
              let info: any = {};
              try { info = await ctx.json?.(); } catch { /* ignore */ }
              await deleteRecord(record.id);
              if (info?.duplicate) {
                syncedCount++;
              } else {
                failedCount++;
              }
            } else {
              failedCount++;
            }
            continue;
          }

          await deleteRecord(record.id);
          syncedCount++;

          // Send WhatsApp notification using the REAL server record id
          if (data?.recordId) {
            try {
              await supabase.functions.invoke('send-whatsapp', {
                body: {
                  clockRecordId: data.recordId,
                  type: record.type,
                  method: record.method,
                  offlineSync: true,
                },
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

      await updatePendingCount();

      if (syncedCount > 0) {
        toast.success(`✅ ${syncedCount} registro(s) sincronizado(s) com sucesso!`);
      }
      if (failedCount > 0) {
        toast.error(`❌ ${failedCount} registro(s) não puderam ser sincronizados. Tente novamente mais tarde.`);
      }

      // Clean up old synced records
      await clearSyncedRecords();
    } finally {
      setSyncing(false);
      syncingRef.current = false;
    }
  }, [updatePendingCount]);

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
