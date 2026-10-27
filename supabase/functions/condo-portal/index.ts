// Portal do Síndico — leitura pública por token + PIN.
//
// O síndico não tem usuário. Ele abre /portal/<token>, digita o PIN e esta
// função devolve SOMENTE o que a empresa liberou para aquele local. Toda a
// montagem acontece aqui, com a service role: o navegador do síndico nunca
// consulta o banco diretamente.
//
// Proteções: token de 48 hex (não adivinhável), PIN com bloqueio de 15 min
// após 5 erros, portal desativável a qualquer momento pela empresa.

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

const TZ = "America/Sao_Paulo";
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** YYYY-MM-DD do dia em São Paulo, deslocado em `offsetDays`. */
function spDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

/** Início (UTC ISO) de um dia civil de São Paulo. */
function spDayStartISO(dateStr: string): string {
  // São Paulo não tem mais horário de verão: UTC-3 fixo.
  return `${dateStr}T03:00:00.000Z`;
}

type ClockType = "entry" | "lunch_out" | "lunch_in" | "exit";

const STATUS_FROM_LAST: Record<ClockType, { status: string; label: string }> = {
  entry: { status: "on_duty", label: "No posto" },
  lunch_in: { status: "on_duty", label: "No posto" },
  lunch_out: { status: "break", label: "Em intervalo" },
  exit: { status: "done", label: "Turno encerrado" },
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const token = String(body?.token ?? "");
    const pin = String(body?.pin ?? "");

    if (token.length < 32) return json({ error: "Link inválido." }, 400);

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: portal } = await db
      .from("location_portals")
      .select("*")
      .eq("token", token)
      .maybeSingle();

    if (!portal || !portal.is_active) {
      return json({ error: "Este portal não está disponível." }, 404);
    }

    // --- PIN ---
    if (portal.locked_until && new Date(portal.locked_until) > new Date()) {
      const mins = Math.ceil((new Date(portal.locked_until).getTime() - Date.now()) / 60000);
      return json({ error: `Muitas tentativas. Tente de novo em ${mins} min.`, locked: true }, 429);
    }

    if (portal.pin_hash) {
      if (!pin) return json({ needs_pin: true }, 401);
      const ok = (await sha256Hex(`${token}:${pin}`)) === portal.pin_hash;
      if (!ok) {
        const attempts = (portal.failed_attempts ?? 0) + 1;
        const lock = attempts >= MAX_ATTEMPTS;
        await db.from("location_portals").update({
          failed_attempts: lock ? 0 : attempts,
          locked_until: lock ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : null,
        }).eq("id", portal.id);
        return json({
          error: lock
            ? `PIN incorreto. Bloqueado por ${LOCK_MINUTES} minutos.`
            : `PIN incorreto (${MAX_ATTEMPTS - attempts} tentativa(s) restante(s)).`,
          needs_pin: true,
        }, 401);
      }
    }

    await db.from("location_portals").update({
      failed_attempts: 0,
      locked_until: null,
      last_access_at: new Date().toISOString(),
      access_count: (portal.access_count ?? 0) + 1,
    }).eq("id", portal.id);

    // --- Cabeçalho ---
    const [{ data: loc }, { data: comp }] = await Promise.all([
      db.from("locations").select("name").eq("id", portal.location_id).maybeSingle(),
      db.from("companies").select("name, phone").eq("id", portal.company_id).maybeSingle(),
    ]);

    const out: Record<string, unknown> = {
      location_name: loc?.name ?? "Local",
      company_name: comp?.name ?? null,
      company_phone: comp?.phone ?? null,
      welcome_text: portal.welcome_text ?? null,
      generated_at: new Date().toISOString(),
      sections: {
        on_duty: !!portal.show_on_duty,
        times: !!portal.show_times,
        history_days: Number(portal.history_days ?? 0),
        occurrences: !!portal.show_occurrences,
        handovers: !!portal.show_handovers,
      },
    };

    // --- Nomes (só quando liberado) ---
    const nameByEmployee = new Map<string, string>();
    const anonByEmployee = new Map<string, string>();
    const resolveNames = async (employeeIds: string[]) => {
      const ids = [...new Set(employeeIds)].filter((id) => !nameByEmployee.has(id));
      if (!ids.length) return;
      const { data: emps } = await db.from("employees").select("id, user_id").in("id", ids);
      const userIds = (emps || []).map((e: any) => e.user_id).filter(Boolean);
      const { data: profs } = userIds.length
        ? await db.from("profiles").select("id, name").in("id", userIds)
        : { data: [] as any[] };
      const byUser = new Map((profs || []).map((p: any) => [p.id, p.name]));
      (emps || []).forEach((e: any) => nameByEmployee.set(e.id, byUser.get(e.user_id) || "Guardião"));
    };
    const displayName = (employeeId: string) => {
      if (portal.show_names) return nameByEmployee.get(employeeId) || "Guardião";
      if (!anonByEmployee.has(employeeId)) anonByEmployee.set(employeeId, `Guardião ${anonByEmployee.size + 1}`);
      return anonByEmployee.get(employeeId)!;
    };

    const today = spDate(0);

    // --- Quem está no posto agora / horários de hoje ---
    if (portal.show_on_duty || portal.show_times) {
      const { data: recs } = await db
        .from("clock_records")
        .select("employee_id, type, timestamp")
        .eq("location_id", portal.location_id)
        .gte("timestamp", spDayStartISO(today))
        .lt("timestamp", spDayStartISO(spDate(1)))
        .order("timestamp", { ascending: true });

      const byEmp = new Map<string, { type: ClockType; timestamp: string }[]>();
      (recs || []).forEach((r: any) => {
        if (!byEmp.has(r.employee_id)) byEmp.set(r.employee_id, []);
        byEmp.get(r.employee_id)!.push({ type: r.type, timestamp: r.timestamp });
      });

      // Guardiões fixos do local que ainda não bateram ponto hoje
      const { data: links } = await db
        .from("employee_locations")
        .select("employee_id, employees!inner(is_active, type)")
        .eq("location_id", portal.location_id);
      const expected = (links || [])
        .filter((l: any) => l.employees?.is_active && l.employees?.type !== "substitute")
        .map((l: any) => l.employee_id as string);

      const allIds = [...new Set([...byEmp.keys(), ...expected])];
      if (portal.show_names) await resolveNames(allIds);

      const people = allIds.map((id) => {
        const list = byEmp.get(id) || [];
        const last = list[list.length - 1];
        const st = last ? STATUS_FROM_LAST[last.type] : { status: "absent", label: "Ainda não chegou" };
        return {
          name: displayName(id),
          status: st.status,
          status_label: st.label,
          since: last?.timestamp ?? null,
          punches: portal.show_times
            ? list.map((r) => ({ type: r.type, at: r.timestamp }))
            : undefined,
        };
      });

      // Quem está no posto primeiro
      const order: Record<string, number> = { on_duty: 0, break: 1, absent: 2, done: 3 };
      people.sort((a, b) => order[a.status] - order[b.status]);
      out.today = { date: today, people };
    }

    // --- Histórico ---
    const historyDays = Number(portal.history_days ?? 0);
    if (historyDays > 0) {
      const from = spDate(-historyDays);
      const { data: recs } = await db
        .from("clock_records")
        .select("employee_id, type, timestamp")
        .eq("location_id", portal.location_id)
        .gte("timestamp", spDayStartISO(from))
        .lt("timestamp", spDayStartISO(today))
        .order("timestamp", { ascending: true });

      if (portal.show_names) await resolveNames((recs || []).map((r: any) => r.employee_id));

      const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
      const grouped = new Map<string, Map<string, { entry?: string; exit?: string; punches: number }>>();
      (recs || []).forEach((r: any) => {
        const day = dayFmt.format(new Date(r.timestamp));
        if (!grouped.has(day)) grouped.set(day, new Map());
        const perEmp = grouped.get(day)!;
        if (!perEmp.has(r.employee_id)) perEmp.set(r.employee_id, { punches: 0 });
        const e = perEmp.get(r.employee_id)!;
        e.punches++;
        if (r.type === "entry" && !e.entry) e.entry = r.timestamp;
        if (r.type === "exit") e.exit = r.timestamp;
      });

      out.history = [...grouped.entries()]
        .sort((a, b) => (a[0] < b[0] ? 1 : -1))
        .map(([day, perEmp]) => ({
          date: day,
          people: [...perEmp.entries()].map(([id, e]) => ({
            name: displayName(id),
            entry: portal.show_times ? e.entry ?? null : undefined,
            exit: portal.show_times ? e.exit ?? null : undefined,
            present: true,
          })),
        }));
    }

    // --- Ocorrências já aprovadas para o condomínio ---
    if (portal.show_occurrences) {
      const { data: occs } = await db
        .from("occurrences")
        .select("id, type_name, description, severity, occurred_at, public_token")
        .eq("location_id", portal.location_id)
        .eq("status", "approved")
        .order("occurred_at", { ascending: false })
        .limit(30);
      out.occurrences = (occs || []).map((o: any) => ({
        type_name: o.type_name,
        description: o.description,
        severity: o.severity,
        occurred_at: o.occurred_at,
        public_token: o.public_token,
      }));
    }

    // --- Passagens de turno ---
    if (portal.show_handovers) {
      const { data: hs } = await db
        .from("shift_handovers")
        .select("employee_id, note, audio_path, audio_seconds, created_at")
        .eq("location_id", portal.location_id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (portal.show_names) await resolveNames((hs || []).map((h: any) => h.employee_id));

      const items = [];
      for (const h of hs || []) {
        let audio_url: string | null = null;
        if (h.audio_path) {
          const { data: signed } = await db.storage
            .from("handover-audio")
            .createSignedUrl(h.audio_path, 3600);
          audio_url = signed?.signedUrl ?? null;
        }
        items.push({
          name: displayName(h.employee_id),
          note: h.note,
          audio_url,
          audio_seconds: h.audio_seconds,
          created_at: h.created_at,
        });
      }
      out.handovers = items;
    }

    return json(out);
  } catch (e) {
    console.error("condo-portal error:", e);
    return json({ error: "Erro ao carregar o portal." }, 500);
  }
});
