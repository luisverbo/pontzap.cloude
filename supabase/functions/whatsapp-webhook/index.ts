import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Haversine distance in meters
function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizePhone(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  return digits.startsWith("55") ? digits : `55${digits}`;
}

const CLOCK_LABELS: Record<string, string> = {
  entry: "Entrada",
  lunch_out: "Saída para Almoço",
  lunch_in: "Retorno do Almoço",
  exit: "Saída",
};

async function resolveEvolution(supabase: any): Promise<{ baseUrl: string; apiKey: string; instance: string } | null> {
  try {
    const { data } = await supabase
      .from("evolution_config")
      .select("base_url, api_key, instance, is_active")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (data && data.base_url && data.api_key && data.instance) {
      return { baseUrl: String(data.base_url).replace(/\/$/, ""), apiKey: data.api_key, instance: data.instance };
    }
  } catch (_e) { /* ignore */ }
  const baseUrl = Deno.env.get("EVOLUTION_API_URL");
  const apiKey = Deno.env.get("EVOLUTION_API_KEY");
  const instance = Deno.env.get("EVOLUTION_INSTANCE");
  if (baseUrl && apiKey && instance) return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey, instance };
  return null;
}

async function sendWhatsApp(supabase: any, phone: string, message: string) {
  const cfg = await resolveEvolution(supabase);
  if (!cfg) return;
  try {
    await fetch(`${cfg.baseUrl}/message/sendText/${cfg.instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.apiKey },
      body: JSON.stringify({ number: normalizePhone(phone), text: message }),
    });
  } catch (e) {
    console.error("Reply failed:", e);
  }
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Shared-secret check (the webhook URL carries ?token=...)
  const url = new URL(req.url);
  const secret = Deno.env.get("WHATSAPP_WEBHOOK_TOKEN");
  if (secret && url.searchParams.get("token") !== secret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: corsHeaders });
  }

  const ok = () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const payload = await req.json();
    // Evolution API: messages.upsert
    const event = payload?.event || payload?.type;
    if (event && !String(event).includes("messages.upsert")) return ok();

    const data = payload?.data || payload;
    if (data?.key?.fromMe) return ok(); // ignore our own messages

    const remoteJid: string = data?.key?.remoteJid || "";
    if (!remoteJid || remoteJid.includes("@g.us")) return ok(); // ignore groups
    const senderPhone = remoteJid.split("@")[0];

    const msg = data?.message || {};
    const text: string = (msg.conversation || msg.extendedTextMessage?.text || "").trim();
    const loc = msg.locationMessage || null;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Identify the employee by phone
    const normalized = normalizePhone(senderPhone);
    const last8 = normalized.slice(-8);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, name, phone")
      .not("phone", "is", null);
    const profile = (profiles || []).find(
      (p: any) => normalizePhone(p.phone).slice(-8) === last8
    );

    if (!profile) {
      await sendWhatsApp(supabase, senderPhone, "Não encontrei seu cadastro no PONTZAP. Fale com o administrador.");
      return ok();
    }

    // Use a plain select (not maybeSingle) so a duplicate employees row for the
    // same user never silently fails the lookup — prefer the active one.
    const { data: employeeRows, error: employeeQueryError } = await supabase
      .from("employees")
      .select("id, company_id, type, is_active")
      .eq("user_id", profile.id);

    if (employeeQueryError) {
      console.error("Employee lookup error:", employeeQueryError);
    }
    const employee =
      (employeeRows || []).find((e: any) => e.is_active) || (employeeRows || [])[0] || null;

    if (!employee) {
      await sendWhatsApp(
        supabase,
        senderPhone,
        `Olá ${profile.name.split(" ")[0]}! Este número está cadastrado no PONTZAP, mas não como funcionário — por isso não é possível bater ponto por ele (ex: contas de administrador não batem ponto).`
      );
      return ok();
    }

    if (!employee.is_active) {
      await sendWhatsApp(supabase, senderPhone, "Seu cadastro de funcionário está inativo. Fale com o administrador.");
      return ok();
    }

    // Need a location to validate the geofence
    if (!loc || typeof loc.degreesLatitude !== "number") {
      await sendWhatsApp(supabase, senderPhone,
        `Olá ${profile.name.split(" ")[0]}! Para bater o ponto, toque no 📎 e envie sua *Localização atual*. Registro o ponto automaticamente. ✅`
      );
      return ok();
    }

    const lat = loc.degreesLatitude;
    const lng = loc.degreesLongitude;

    // Find the nearest company location within radius
    let locQuery = supabase.from("locations").select("id, name, latitude, longitude, radius");
    if (employee.company_id) locQuery = locQuery.eq("company_id", employee.company_id);
    const { data: locations } = await locQuery;

    let best: { id: string; name: string; dist: number; radius: number } | null = null;
    for (const l of locations || []) {
      const dist = distanceMeters(lat, lng, (l as any).latitude, (l as any).longitude);
      const radius = (l as any).radius && (l as any).radius > 0 ? (l as any).radius : 100;
      if (!best || dist < best.dist) best = { id: (l as any).id, name: (l as any).name, dist, radius };
    }

    if (!best || best.dist > best.radius) {
      const d = best ? Math.round(best.dist) : 0;
      const dText = d > 1000 ? `${(d / 1000).toFixed(1)}km` : `${d}m`;
      await sendWhatsApp(supabase, senderPhone,
        best
          ? `Você está a ${dText} de "${best.name}", fora do raio permitido. Chegue ao local e envie a localização novamente.`
          : "Nenhum local de trabalho cadastrado para sua empresa."
      );
      return ok();
    }

    // Decide the punch type from today's records (SP local day)
    const spDay = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
    const { data: todays } = await supabase
      .from("clock_records")
      .select("type, timestamp")
      .eq("employee_id", employee.id)
      .gte("timestamp", `${spDay}T00:00:00-03:00`)
      .lte("timestamp", `${spDay}T23:59:59-03:00`);
    const types = new Set((todays || []).map((r: any) => r.type));

    // Allow explicit override via keyword, else auto-detect entry/exit
    const t = text.toLowerCase();
    let type: string;
    if (/almo[çc]o|almoco/.test(t) && !/volt|retorn/.test(t)) type = "lunch_out";
    else if (/volt|retorn/.test(t)) type = "lunch_in";
    else if (/sa[íi]|saida|fui|encerr/.test(t)) type = "exit";
    else if (/cheg|entr|inici/.test(t)) type = "entry";
    else type = !types.has("entry") ? "entry" : !types.has("exit") ? "exit" : "exit";

    if (types.has(type)) {
      await sendWhatsApp(supabase, senderPhone, `Você já registrou *${CLOCK_LABELS[type]}* hoje. ✅`);
      return ok();
    }

    // Insert the clock record (NSR + hash assigned by DB trigger)
    const timestamp = new Date().toISOString();
    const { data: record, error: insErr } = await supabase
      .from("clock_records")
      .insert({
        employee_id: employee.id,
        location_id: best.id,
        type,
        method: "gps",
        latitude: lat,
        longitude: lng,
        timestamp,
      })
      .select("id")
      .single();

    if (insErr) {
      const dup = /duplicad|duplicate/i.test(insErr.message || "");
      await sendWhatsApp(supabase, senderPhone, dup ? "Este ponto já foi registrado há instantes." : "Erro ao registrar o ponto. Tente novamente.");
      return ok();
    }

    // Folguista automation on entry
    if (type === "entry" && employee.type === "substitute") {
      try {
        const { data: rate } = await supabase.from("employees").select("valor_diaria").eq("id", employee.id).maybeSingle();
        const valor = (rate as any)?.valor_diaria ?? null;
        if (valor && valor > 0) {
          const [y, m] = spDay.split("-").map(Number);
          const { data: existing } = await supabase
            .from("anotacoes_folguista").select("id")
            .eq("folguista_id", employee.id).eq("data_trabalho", spDay).maybeSingle();
          if (!existing) {
            let periodoId: string | null = null;
            const { data: per } = await supabase.from("anotacoes_periodo").select("id")
              .eq("folguista_id", employee.id).eq("periodo_mes", m).eq("periodo_ano", y).maybeSingle();
            if (per) periodoId = per.id;
            else {
              const { data: np } = await supabase.from("anotacoes_periodo")
                .insert({ folguista_id: employee.id, periodo_mes: m, periodo_ano: y, company_id: employee.company_id, status: "a_pagar" })
                .select("id").single();
              periodoId = np?.id ?? null;
            }
            await supabase.from("anotacoes_folguista").insert({
              folguista_id: employee.id, data_trabalho: spDay, valor, status: "a_pagar",
              periodo_id: periodoId, local_id: best.id, company_id: employee.company_id,
            });
          }
        }
      } catch (e) {
        console.error("Folguista automation (whatsapp):", e);
      }
    }

    // Read the receipt (NSR) and confirm
    let nsr: number | null = null;
    try {
      const { data: r } = await supabase.from("clock_records").select("nsr").eq("id", record.id).maybeSingle();
      nsr = (r as any)?.nsr ?? null;
    } catch { /* ignore */ }

    const hora = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(new Date(timestamp));

    await sendWhatsApp(supabase, senderPhone,
      `✅ *${CLOCK_LABELS[type]}* registrada!\n\n📍 ${best.name}\n⏰ ${hora}\n📄 Comprovante NSR: ${nsr != null ? String(nsr).padStart(9, "0") : "-"}\n\n_PONTZAP_`
    );
    return ok();
  } catch (error) {
    console.error("whatsapp-webhook error:", error);
    return ok(); // always 200 so Evolution doesn't retry-storm
  }
});
