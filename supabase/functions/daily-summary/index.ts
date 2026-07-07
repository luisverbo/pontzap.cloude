import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function spNow(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
}

function spDateStr(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

async function resolveEvolution(supabase: any) {
  const { data } = await supabase.from("evolution_config").select("base_url, api_key, instance, is_active").eq("is_active", true).limit(1).maybeSingle();
  if (data?.base_url && data?.api_key && data?.instance) {
    return { baseUrl: String(data.base_url).replace(/\/$/, ""), apiKey: data.api_key, instance: data.instance };
  }
  const baseUrl = Deno.env.get("EVOLUTION_API_URL");
  const apiKey = Deno.env.get("EVOLUTION_API_KEY");
  const instance = Deno.env.get("EVOLUTION_INSTANCE");
  if (baseUrl && apiKey && instance) return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey, instance };
  return null;
}

function normalizePhone(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  return digits.startsWith("55") ? digits : `55${digits}`;
}

async function sendWhatsApp(cfg: { baseUrl: string; apiKey: string; instance: string }, phone: string, message: string) {
  try {
    await fetch(`${cfg.baseUrl}/message/sendText/${cfg.instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.apiKey },
      body: JSON.stringify({ number: normalizePhone(phone), text: message }),
    });
  } catch (e) {
    console.error("send failed:", e);
  }
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const now = spNow();
    const today = spDateStr(now);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    // Companies with the summary enabled and not sent yet today
    const { data: configs, error: cfgErr } = await supabase
      .from("daily_summary_config")
      .select("id, company_id, send_time, whatsapp, last_sent_date")
      .eq("enabled", true)
      .or(`last_sent_date.is.null,last_sent_date.neq.${today}`);

    if (cfgErr) throw cfgErr;
    if (!configs || configs.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const evolutionConfig = await resolveEvolution(supabase);
    if (!evolutionConfig) {
      return new Response(JSON.stringify({ error: "Evolution API não configurada" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let sent = 0;

    for (const cfg of configs) {
      const [h, m] = String(cfg.send_time).slice(0, 5).split(":").map(Number);
      const targetMinutes = h * 60 + m;
      // Fire once we're at/after the target time, within a 10-minute window
      // (covers the 5-min cron cadence with margin for a missed tick).
      if (nowMinutes < targetMinutes || nowMinutes > targetMinutes + 10) continue;

      const companyId = cfg.company_id;

      const { data: company } = await supabase.from("companies").select("name, phone").eq("id", companyId).maybeSingle();
      const targetPhone = cfg.whatsapp || company?.phone;
      if (!targetPhone) continue;

      const { data: employees } = await supabase
        .from("employees")
        .select("id, type, work_start_time, work_end_time, lunch_duration_minutes, valor_diaria")
        .eq("company_id", companyId)
        .eq("is_active", true);
      const empIds = (employees || []).map((e: any) => e.id);
      const empById: Record<string, any> = {};
      (employees || []).forEach((e: any) => { empById[e.id] = e; });

      let clockedIn = new Set<string>();
      let lateEmployeeIds = new Set<string>();
      let overtimeMinutes = 0;
      let folguistaCost = 0;

      if (empIds.length > 0) {
        const { data: records } = await supabase
          .from("clock_records")
          .select("employee_id, type, timestamp")
          .in("employee_id", empIds)
          .gte("timestamp", `${today}T00:00:00-03:00`)
          .lte("timestamp", `${today}T23:59:59-03:00`);

        const byEmp: Record<string, any[]> = {};
        (records || []).forEach((r: any) => {
          (byEmp[r.employee_id] = byEmp[r.employee_id] || []).push(r);
          if (r.type === "entry") clockedIn.add(r.employee_id);
        });

        const dayOfWeek = now.getDay();
        const { data: fixedSchedules } = await supabase
          .from("fixed_schedules")
          .select("employee_id, start_time, tolerance_minutes")
          .eq("day_of_week", dayOfWeek)
          .eq("works", true)
          .in("employee_id", empIds);
        const { data: punctualSchedules } = await supabase
          .from("punctual_schedules")
          .select("employee_id, start_time, tolerance_minutes")
          .eq("date", today)
          .in("employee_id", empIds);

        const scheduleByEmp: Record<string, { start: number; tol: number }> = {};
        (fixedSchedules || []).forEach((s: any) => {
          const [sh, sm] = s.start_time.split(":").map(Number);
          scheduleByEmp[s.employee_id] = { start: sh * 60 + sm, tol: s.tolerance_minutes || 15 };
        });
        (punctualSchedules || []).forEach((s: any) => {
          const [sh, sm] = s.start_time.split(":").map(Number);
          scheduleByEmp[s.employee_id] = { start: sh * 60 + sm, tol: s.tolerance_minutes || 15 };
        });

        for (const [empId, recs] of Object.entries(byEmp)) {
          const entry = recs.find((r) => r.type === "entry");
          const exit = recs.find((r) => r.type === "exit");
          const lunchOut = recs.find((r) => r.type === "lunch_out");
          const lunchIn = recs.find((r) => r.type === "lunch_in");
          const sched = scheduleByEmp[empId];
          const emp = empById[empId];

          if (entry && sched) {
            const entryTime = new Date(entry.timestamp);
            const entryMinutes = entryTime.getHours() * 60 + entryTime.getMinutes();
            if (entryMinutes > sched.start + sched.tol) lateEmployeeIds.add(empId);
          }

          if (entry && exit && emp?.work_start_time && emp?.work_end_time) {
            const [ewh, ewm] = String(emp.work_start_time).split(":").map(Number);
            const [eeh, eem] = String(emp.work_end_time).split(":").map(Number);
            const expected = eeh * 60 + eem - (ewh * 60 + ewm) - (emp.lunch_duration_minutes || 60);
            let worked = Math.round((new Date(exit.timestamp).getTime() - new Date(entry.timestamp).getTime()) / 60000);
            if (lunchOut && lunchIn) {
              worked -= Math.round((new Date(lunchIn.timestamp).getTime() - new Date(lunchOut.timestamp).getTime()) / 60000);
            }
            if (worked > expected) overtimeMinutes += worked - expected;
          }

          if (entry && emp?.type === "substitute" && emp?.valor_diaria) {
            folguistaCost += Number(emp.valor_diaria);
          }
        }
      }

      const total = (employees || []).length;
      const clockedCount = clockedIn.size;
      const lateCount = lateEmployeeIds.size;
      const overtimeH = Math.floor(overtimeMinutes / 60);
      const overtimeM = overtimeMinutes % 60;

      const lines = [
        `📊 *PONTZAP — Resumo do dia*`,
        `${company?.name || ""}`,
        ``,
        `✅ ${clockedCount} de ${total} bateram ponto`,
      ];
      if (lateCount > 0) lines.push(`⏰ ${lateCount} atraso${lateCount > 1 ? "s" : ""}`);
      if (overtimeMinutes > 0) lines.push(`⏱️ ${overtimeH}h${String(overtimeM).padStart(2, "0")} de horas extras`);
      if (folguistaCost > 0) lines.push(`💰 R$ ${folguistaCost.toFixed(2)} em diárias de folguistas hoje`);
      const pending = total - clockedCount;
      if (pending > 0) lines.push(`⚠️ ${pending} sem registro de entrada hoje`);
      lines.push(``, `_Enviado automaticamente às ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}_`);

      await sendWhatsApp(evolutionConfig, targetPhone, lines.join("\n"));

      await supabase.from("daily_summary_config").update({ last_sent_date: today }).eq("id", cfg.id);
      sent++;
    }

    return new Response(JSON.stringify({ ok: true, sent }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error("daily-summary error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
