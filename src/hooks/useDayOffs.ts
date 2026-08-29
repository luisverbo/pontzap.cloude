import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type DayOffKind = 'sunday' | 'extra' | 'hour_bank';

export interface DayOff {
  id: string;
  company_id: string;
  employee_id: string;
  date: string;
  kind: DayOffKind;
  notes: string | null;
  hour_bank_entry_id: string | null;
  created_at: string;
}

export const DAY_OFF_KINDS: Record<DayOffKind, { label: string; short: string; variant: 'info' | 'success' | 'warning' }> = {
  sunday: { label: 'Domingo de folga', short: 'Domingo', variant: 'info' },
  extra: { label: 'Folga extra', short: 'Extra', variant: 'success' },
  hour_bank: { label: 'Folga do banco de horas', short: 'Banco de horas', variant: 'warning' },
};

/**
 * Day offs the current user may see. RLS scopes it: an employee only gets
 * their own rows, an admin gets the whole company.
 */
export function useDayOffs(fromDate?: string) {
  const [dayOffs, setDayOffs] = useState<DayOff[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase.from('day_offs').select('*').order('date', { ascending: true });
      if (fromDate) q = q.gte('date', fromDate);
      const { data, error } = await q;
      if (error) throw error;
      setDayOffs((data || []) as unknown as DayOff[]);
    } catch (e) {
      console.error('Erro ao carregar folgas:', e);
    } finally {
      setLoading(false);
    }
  }, [fromDate]);

  useEffect(() => { refetch(); }, [refetch]);

  return { dayOffs, loading, refetch };
}

/**
 * The employee's recurring weekly day off, read from the fixed schedule
 * (works = false). Returns the weekday numbers, e.g. [1] for "every Monday".
 */
export async function fetchWeeklyDaysOff(employeeId: string): Promise<number[]> {
  const { data } = await supabase
    .from('fixed_schedules')
    .select('day_of_week, works')
    .eq('employee_id', employeeId);
  return (data || []).filter((s: any) => s.works === false).map((s: any) => s.day_of_week);
}
