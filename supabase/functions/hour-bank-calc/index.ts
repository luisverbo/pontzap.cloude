// Automatic hour-bank calculation.
//
// For each working day in the range it compares the minutes actually worked
// (from the punches) against the scheduled workday, and writes the difference
// as a credit (overtime) or debit (short) entry with kind='auto'.
//
// Rules (deliberate, documented for the admin):
//  - A day is only processed when there is BOTH an entry and an exit punch.
//    Days with no punches are skipped entirely, so holidays off, vacation,
//    sick leave or a day off never create a phantom debit.
//  - Folguistas (type='substitute') are excluded — they are paid per diária,
//    they have no fixed workday to compare against.
//  - Scheduled workday priority: punctual schedule > fixed schedule >
//    the employee's registered work_start_time/work_end_time.
//  - Lunch: the real interval is deducted when both lunch punches exist;
//    otherwise the registered lunch_duration_minutes is deducted, so skipping
//    the lunch punches can't silently earn an extra hour.
//  - Company holidays: nothing is expected, so everything worked is credit.
//  - Differences under the company tolerance are ignored.
//
// Idempotent: 'auto' entries in the range are deleted before reinserting, so
// recalculating never duplicates. Manual entries and settlements are untouched.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** "HH:MM[:SS]" -> minutes since midnight */
const toMinutes = (t: string | null | undefined): number | null => {
  if (!t) return null;
  const [h, m] = String(t).split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
};

/** YYYY-MM-DD list between two dates (inclusive) */
const dateRange = (start: string, end: string): string[] => {
  const out: string[] = [];
  const d = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  while (d <= last) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const companyId: string | null = body?.companyId ?? null;
    let startDate: string | null = body?.startDate ?? null;
    let endDate: string | null = body?.endDate ?? null;

    // Targeting one company is an admin action from the panel, so it requires a
    // valid login for that very company. The no-companyId path is the nightly
    // cron: it only touches companies that opted in, and returns just counts.
    if (companyId) {
      const authHeader = req.headers.get("Authorization") || "";
      const token = authHeader.replace(/^Bearer\s+/i, "");
      if (!token) return json({ error: "Não autenticado." }, 401);

      const { data: userData, error: userErr } = await supabase.auth.getUser(token);
      if (userErr || !userData?.user) return json({ error: "Sessão inválida." }, 401);
      const uid = userData.user.id;

      const { data: isMaster } = await supabase.rpc("is_master_user", { _user_id: uid });
      if (!isMaster) {
        const { data: allowed } = await supabase.rpc("is_admin_or_manager", { _user_id: uid });
        const { data: userCompany } = await supabase.rpc("get_user_company_id", { _user_id: uid });
        if (!allowed || userCompany !== companyId) {
          return json({ error: "Sem permissão para esta empresa." }, 403);
        }
      }
    }

    // Default window: yesterday (the nightly cron case)
    if (!startDate || !endDate) {
      const nowSP = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
      nowSP.setDate(nowSP.getDate() - 1);
      const y = nowSP.toISOString().slice(0, 10);
      startDate = startDate || y;
      endDate = endDate || y;
    }

    // Which companies to process
    let configs: any[] = [];
    if (companyId) {
      const { data } = await supabase
        .from("hour_bank_config")
        .select("company_id, tolerance_minutes, credit_holidays, enabled")
        .eq("company_id", companyId)
        .maybeSingle();
      // An explicit request (admin pressing the button) runs even if the
      // scheduled automation is off for that company.
      configs = [data ?? { company_id: companyId, tolerance_minutes: 10, credit_holidays: true, enabled: true }];
    } else {
      const { data } = await supabase
        .from("hour_bank_config")
        .select("company_id, tolerance_minutes, credit_holidays, enabled")
        .eq("enabled", true);
      configs = data || [];
    }

    const days = dateRange(startDate!, endDate!);
    const results: any[] = [];

    for (const cfg of configs) {
      const cid = cfg.company_id;
      const tolerance = cfg.tolerance_minutes ?? 10;

      // Only fixed employees have a workday to compare against
      const { data: employees } = await supabase
        .from("employees")
        .select("id, type, work_start_time, work_end_time, lunch_duration_minutes, flexible_schedule")
        .eq("company_id", cid)
        .eq("is_active", true);

      // Folguistas (diária) e quem tem horário livre não têm jornada prevista
      // para comparar — ficam fora do banco de horas automático.
      const staff = (employees || []).filter(
        (e: any) => e.type !== "substitute" && !e.flexible_schedule,
      );
      const empIds = staff.map((e: any) => e.id);
      if (empIds.length === 0) {
        results.push({ company_id: cid, entries: 0, note: "sem funcionários fixos" });
        continue;
      }

      // Everything needed for the whole range, in bulk
      const [{ data: records }, { data: fixed }, { data: punctual }, { data: holidays }] = await Promise.all([
        supabase
          .from("clock_records")
          .select("employee_id, type, timestamp")
          .in("employee_id", empIds)
          .gte("timestamp", `${startDate}T00:00:00-03:00`)
          .lte("timestamp", `${endDate}T23:59:59-03:00`),
        supabase
          .from("fixed_schedules")
          .select("employee_id, day_of_week, works, start_time, end_time")
          .in("employee_id", empIds),
        supabase
          .from("punctual_schedules")
          .select("employee_id, date, start_time, end_time")
          .in("employee_id", empIds)
          .gte("date", startDate!)
          .lte("date", endDate!),
        supabase.from("holidays").select("date").eq("company_id", cid),
      ]);

      const holidaySet = new Set((holidays || []).map((h: any) => h.date));

      // Index punches by employee + local (São Paulo) date
      const byEmpDay: Record<string, any[]> = {};
      (records || []).forEach((r: any) => {
        const localDate = new Date(r.timestamp)
          .toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); // YYYY-MM-DD
        const key = `${r.employee_id}|${localDate}`;
        (byEmpDay[key] = byEmpDay[key] || []).push(r);
      });

      const fixedByEmpDow: Record<string, any> = {};
      (fixed || []).forEach((s: any) => { fixedByEmpDow[`${s.employee_id}|${s.day_of_week}`] = s; });
      const punctualByEmpDate: Record<string, any> = {};
      (punctual || []).forEach((s: any) => { punctualByEmpDate[`${s.employee_id}|${s.date}`] = s; });

      const toInsert: any[] = [];

      for (const emp of staff) {
        for (const day of days) {
          const punches = byEmpDay[`${emp.id}|${day}`] || [];
          const entry = punches.find((p) => p.type === "entry");
          const exit = punches.find((p) => p.type === "exit");
          // No complete pair → skip (day off, vacation, sick leave, open shift)
          if (!entry || !exit) continue;

          const lunchOut = punches.find((p) => p.type === "lunch_out");
          const lunchIn = punches.find((p) => p.type === "lunch_in");

          let worked = Math.round(
            (new Date(exit.timestamp).getTime() - new Date(entry.timestamp).getTime()) / 60000,
          );
          if (worked <= 0) continue; // inconsistent punches, don't guess

          const plannedLunch = emp.lunch_duration_minutes ?? 60;
          if (lunchOut && lunchIn) {
            worked -= Math.round(
              (new Date(lunchIn.timestamp).getTime() - new Date(lunchOut.timestamp).getTime()) / 60000,
            );
          } else {
            worked -= plannedLunch;
          }
          if (worked < 0) worked = 0;

          // Expected minutes for this day
          let expected = 0;
          const isHoliday = holidaySet.has(day);
          if (isHoliday && cfg.credit_holidays !== false) {
            expected = 0; // worked on a holiday → all credit
          } else {
            const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
            const p = punctualByEmpDate[`${emp.id}|${day}`];
            const f = fixedByEmpDow[`${emp.id}|${dow}`];
            let s: number | null = null;
            let e: number | null = null;
            if (p) {
              s = toMinutes(p.start_time); e = toMinutes(p.end_time);
            } else if (f) {
              if (f.works === false) { s = null; e = null; } // scheduled day off
              else { s = toMinutes(f.start_time); e = toMinutes(f.end_time); }
            } else {
              s = toMinutes(emp.work_start_time); e = toMinutes(emp.work_end_time);
            }
            if (s != null && e != null && e > s) {
              expected = e - s - plannedLunch;
              if (expected < 0) expected = 0;
            } else {
              expected = 0; // no schedule → treat everything worked as credit
            }
          }

          const diff = worked - expected;
          if (Math.abs(diff) < tolerance) continue;

          const hh = Math.floor(Math.abs(diff) / 60);
          const mm = Math.abs(diff) % 60;
          const human = `${hh}h${String(mm).padStart(2, "0")}`;
          const reason = isHoliday
            ? `Feriado trabalhado (+${human})`
            : diff > 0
              ? `Hora extra automática (+${human})`
              : `Horas a compensar (−${human})`;

          toInsert.push({
            employee_id: emp.id,
            company_id: cid,
            entry_date: day,
            minutes: diff,
            description: reason,
            kind: "auto",
          });
        }
      }

      // Idempotent replace of the automatic entries in this window
      await supabase
        .from("hour_bank_entries")
        .delete()
        .eq("company_id", cid)
        .eq("kind", "auto")
        .gte("entry_date", startDate!)
        .lte("entry_date", endDate!);

      if (toInsert.length > 0) {
        const { error: insErr } = await supabase.from("hour_bank_entries").insert(toInsert);
        if (insErr) throw insErr;
      }

      await supabase
        .from("hour_bank_config")
        .upsert(
          { company_id: cid, last_calculated_at: new Date().toISOString(), updated_at: new Date().toISOString() },
          { onConflict: "company_id" },
        );

      results.push({ company_id: cid, entries: toInsert.length, days: days.length });
    }

    return json({ ok: true, startDate, endDate, results });
  } catch (e) {
    console.error("hour-bank-calc error:", e);
    return json({ error: String((e as any)?.message || e) }, 500);
  }
});
