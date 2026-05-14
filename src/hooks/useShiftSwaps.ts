import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getImpersonatedCompanyId } from '@/components/ImpersonationBar';

export interface ShiftSwap {
  id: string;
  company_id: string | null;
  requester_employee_id: string;
  target_employee_id: string;
  location_id: string;
  requester_date: string;
  target_date: string;
  requester_start_time: string;
  requester_end_time: string;
  target_start_time: string;
  target_end_time: string;
  schedule_type: 'punctual' | 'fixed';
  status: 'pending' | 'accepted' | 'approved' | 'rejected' | 'cancelled';
  target_accepted_at: string | null;
  admin_approved_at: string | null;
  admin_approved_by: string | null;
  reason: string | null;
  created_at: string;
  updated_at: string;
  requester?: {
    id: string;
    user_id: string;
    profiles?: { name: string; email: string };
  };
  target?: {
    id: string;
    user_id: string;
    profiles?: { name: string; email: string };
  };
  location?: { name: string };
}

export function useShiftSwaps(employeeId?: string) {
  const [swaps, setSwaps] = useState<ShiftSwap[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSwaps = async () => {
    try {
      const impersonatedCompanyId = getImpersonatedCompanyId();
      
      let query = supabase
        .from('shift_swaps')
        .select(`
          *,
          requester:employees!shift_swaps_requester_employee_id_fkey(
            id,
            user_id,
            profiles(name, email)
          ),
          target:employees!shift_swaps_target_employee_id_fkey(
            id,
            user_id,
            profiles(name, email)
          ),
          location:locations(name)
        `)
        .order('created_at', { ascending: false });

      if (impersonatedCompanyId) {
        query = query.eq('company_id', impersonatedCompanyId);
      }

      if (employeeId) {
        query = query.or(`requester_employee_id.eq.${employeeId},target_employee_id.eq.${employeeId}`);
      }

      const { data, error } = await query;

      if (error) throw error;
      setSwaps((data as unknown as ShiftSwap[]) || []);
    } catch (error: any) {
      console.error('Error fetching shift swaps:', error);
      toast.error('Erro ao carregar trocas de escala');
    } finally {
      setLoading(false);
    }
  };

  const sendSwapNotification = async (swapId: string, notificationType: 'requested' | 'accepted' | 'approved' | 'rejected') => {
    try {
      await supabase.functions.invoke('send-swap-notification', {
        body: { swapId, notificationType }
      });
    } catch (error) {
      console.error('Error sending swap notification:', error);
    }
  };

  const createSwapRequest = async (swapData: {
    company_id: string | null;
    requester_employee_id: string;
    target_employee_id: string;
    location_id: string;
    requester_date: string;
    target_date: string;
    requester_start_time: string;
    requester_end_time: string;
    target_start_time: string;
    target_end_time: string;
    schedule_type: 'punctual' | 'fixed';
    reason?: string;
  }) => {
    try {
      const { data, error } = await supabase
        .from('shift_swaps')
        .insert(swapData)
        .select()
        .single();

      if (error) throw error;
      toast.success('Solicitação de troca enviada!');
      
      // Send notification to target employee
      if (data) {
        sendSwapNotification(data.id, 'requested');
      }
      
      await fetchSwaps();
      return true;
    } catch (error: any) {
      console.error('Error creating swap request:', error);
      toast.error('Erro ao solicitar troca');
      return false;
    }
  };

  const acceptSwap = async (swapId: string) => {
    try {
      const { error } = await supabase
        .from('shift_swaps')
        .update({
          status: 'accepted',
          target_accepted_at: new Date().toISOString(),
        })
        .eq('id', swapId);

      if (error) throw error;
      toast.success('Troca aceita! Aguardando aprovação do administrador.');
      
      // Send notification to requester and admins
      sendSwapNotification(swapId, 'accepted');
      
      await fetchSwaps();
      return true;
    } catch (error: any) {
      console.error('Error accepting swap:', error);
      toast.error('Erro ao aceitar troca');
      return false;
    }
  };

  const rejectSwap = async (swapId: string, reason?: string) => {
    try {
      const { error } = await supabase
        .from('shift_swaps')
        .update({
          status: 'rejected',
          reason: reason || 'Rejeitado pelo funcionário',
        })
        .eq('id', swapId);

      if (error) throw error;
      toast.success('Troca rejeitada.');
      
      // Send notification to requester
      sendSwapNotification(swapId, 'rejected');
      
      await fetchSwaps();
      return true;
    } catch (error: any) {
      console.error('Error rejecting swap:', error);
      toast.error('Erro ao rejeitar troca');
      return false;
    }
  };

  const cancelSwap = async (swapId: string) => {
    try {
      const { error } = await supabase
        .from('shift_swaps')
        .update({ status: 'cancelled' })
        .eq('id', swapId);

      if (error) throw error;
      toast.success('Solicitação cancelada.');
      await fetchSwaps();
      return true;
    } catch (error: any) {
      console.error('Error canceling swap:', error);
      toast.error('Erro ao cancelar troca');
      return false;
    }
  };

  const approveSwap = async (swapId: string, adminUserId: string) => {
    try {
      // Get swap details
      const swap = swaps.find(s => s.id === swapId);
      if (!swap) throw new Error('Troca não encontrada');

      // Update swap status
      const { error: swapError } = await supabase
        .from('shift_swaps')
        .update({
          status: 'approved',
          admin_approved_at: new Date().toISOString(),
          admin_approved_by: adminUserId,
        })
        .eq('id', swapId);

      if (swapError) throw swapError;

      // Update schedules based on schedule_type
      if (swap.schedule_type === 'punctual') {
        // Update punctual schedules
        const { error: reqError } = await supabase
          .from('punctual_schedules')
          .update({
            date: swap.target_date,
            start_time: swap.target_start_time,
            end_time: swap.target_end_time,
          })
          .eq('employee_id', swap.requester_employee_id)
          .eq('date', swap.requester_date)
          .eq('location_id', swap.location_id);

        if (reqError) console.error('Error updating requester schedule:', reqError);

        const { error: targetError } = await supabase
          .from('punctual_schedules')
          .update({
            date: swap.requester_date,
            start_time: swap.requester_start_time,
            end_time: swap.requester_end_time,
          })
          .eq('employee_id', swap.target_employee_id)
          .eq('date', swap.target_date)
          .eq('location_id', swap.location_id);

        if (targetError) console.error('Error updating target schedule:', targetError);
      } else {
        // For fixed schedules, create punctual schedule exceptions
        await supabase.from('punctual_schedules').insert({
          employee_id: swap.requester_employee_id,
          location_id: swap.location_id,
          date: swap.target_date,
          start_time: swap.target_start_time,
          end_time: swap.target_end_time,
          tolerance_minutes: 15,
        });

        await supabase.from('punctual_schedules').insert({
          employee_id: swap.target_employee_id,
          location_id: swap.location_id,
          date: swap.requester_date,
          start_time: swap.requester_start_time,
          end_time: swap.requester_end_time,
          tolerance_minutes: 15,
        });
      }

      toast.success('Troca aprovada! As escalas foram atualizadas.');
      
      // Send notification to both employees
      sendSwapNotification(swapId, 'approved');
      
      await fetchSwaps();
      return true;
    } catch (error: any) {
      console.error('Error approving swap:', error);
      toast.error('Erro ao aprovar troca');
      return false;
    }
  };

  const adminRejectSwap = async (swapId: string, reason?: string) => {
    try {
      const { error } = await supabase
        .from('shift_swaps')
        .update({
          status: 'rejected',
          reason: reason || 'Rejeitado pelo administrador',
        })
        .eq('id', swapId);

      if (error) throw error;
      toast.success('Troca rejeitada.');
      
      // Send notification to requester
      sendSwapNotification(swapId, 'rejected');
      
      await fetchSwaps();
      return true;
    } catch (error: any) {
      console.error('Error rejecting swap:', error);
      toast.error('Erro ao rejeitar troca');
      return false;
    }
  };

  useEffect(() => {
    fetchSwaps();
  }, [employeeId]);

  return {
    swaps,
    loading,
    createSwapRequest,
    acceptSwap,
    rejectSwap,
    cancelSwap,
    approveSwap,
    adminRejectSwap,
    refetch: fetchSwaps,
  };
}
