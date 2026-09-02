import { isNative } from './native';
import { supabase } from '@/integrations/supabase/client';

// Lembrete de ponto esquecido — 100% no aparelho, sem servidor:
// ao abrir o app agendamos notificações locais para os próximos 7 dias no
// horário da escala + tolerância + 5 min; quando o funcionário bate a entrada
// do dia, a notificação daquele dia é cancelada. Se ele não abrir o app por
// alguns dias, as já agendadas continuam valendo.

const HORIZON_DAYS = 7;

/** Deterministic 32-bit id per date so re-scheduling replaces, never duplicates. */
const idForDate = (d: Date): number =>
  parseInt(`${d.getFullYear() % 100}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}1`, 10);

export async function scheduleForgotAlerts(employeeId: string): Promise<void> {
  if (!isNative) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    let perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') {
      perm = await LocalNotifications.requestPermissions();
      if (perm.display !== 'granted') return;
    }

    // Horário livre não tem hora marcada para chegar — nada a lembrar.
    const { data: emp } = await supabase
      .from('employees')
      .select('flexible_schedule')
      .eq('id', employeeId)
      .maybeSingle();
    if ((emp as any)?.flexible_schedule) {
      const { notifications: old } = await LocalNotifications.getPending();
      if (old.length) await LocalNotifications.cancel({ notifications: old.map((n) => ({ id: n.id })) });
      return;
    }

    const [{ data: fixed }, { data: punctual }] = await Promise.all([
      supabase
        .from('fixed_schedules')
        .select('day_of_week, works, start_time, tolerance_minutes')
        .eq('employee_id', employeeId),
      supabase
        .from('punctual_schedules')
        .select('date, start_time, tolerance_minutes')
        .eq('employee_id', employeeId)
        .gte('date', new Date().toISOString().slice(0, 10)),
    ]);

    const fixedByDow = new Map((fixed || []).map((s: any) => [s.day_of_week, s]));
    const punctualByDate = new Map((punctual || []).map((s: any) => [s.date, s]));

    const notifications: any[] = [];
    const now = new Date();
    for (let i = 0; i < HORIZON_DAYS; i++) {
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      const dateStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
      const sched: any = punctualByDate.get(dateStr) || fixedByDow.get(day.getDay());
      if (!sched || sched.works === false || !sched.start_time) continue;

      const [h, m] = String(sched.start_time).split(':').map(Number);
      const fireAt = new Date(day);
      fireAt.setHours(h, m + Number(sched.tolerance_minutes ?? 15) + 5, 0, 0);
      if (fireAt <= now) continue;

      notifications.push({
        id: idForDate(day),
        title: 'Esqueceu de bater o ponto?',
        body: `Sua entrada era às ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} e ainda não registramos seu ponto hoje.`,
        schedule: { at: fireAt, allowWhileIdle: true },
      });
    }

    // Replace the whole horizon (ids are per-date, so this is idempotent)
    const { notifications: pending } = await LocalNotifications.getPending();
    if (pending.length) await LocalNotifications.cancel({ notifications: pending.map((n) => ({ id: n.id })) });
    if (notifications.length) await LocalNotifications.schedule({ notifications });
  } catch (e) {
    console.error('scheduleForgotAlerts:', e);
  }
}

/** Called right after a successful entry punch — silence today's reminder. */
export async function cancelTodayForgotAlert(): Promise<void> {
  if (!isNative) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.cancel({ notifications: [{ id: idForDate(new Date()) }] });
  } catch {
    /* ignore */
  }
}
