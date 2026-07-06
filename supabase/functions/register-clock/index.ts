import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ClockType = "entry" | "lunch_out" | "lunch_in" | "exit";

interface RegisterClockRequest {
  type: ClockType;
  locationId: string;
  method: "gps" | "qr";
  latitude?: number;
  longitude?: number;
  // Only used when flushing a punch that was stored offline. The server still
  // validates it, but preserves the original punch time instead of using now().
  offlineTimestamp?: string;
}

// Haversine distance in meters
function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Calendar date (YYYY-MM-DD) and month/year in São Paulo local time
function saoPauloDate(d: Date): { dateStr: string; month: number; year: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  const [y, m] = parts.split("-").map(Number);
  return { dateStr: parts, month: m, year: y };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 1. Authenticate the caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autorizado" }, 401);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ error: "Token inválido" }, 401);

    const body: RegisterClockRequest = await req.json();
    const { type, locationId, method, latitude, longitude, offlineTimestamp } = body;

    if (!type || !locationId || !method) {
      return json({ error: "type, locationId e method são obrigatórios" }, 400);
    }

    // 2. Resolve the employee from the authenticated user (never from the client).
    //    valor_diaria is fetched lazily below so a not-yet-applied migration can
    //    never break the core clock-in flow.
    const { data: employee, error: empError } = await supabase
      .from("employees")
      .select("id, company_id, type, is_active")
      .eq("user_id", user.id)
      .maybeSingle();

    if (empError || !employee) return json({ error: "Funcionário não encontrado" }, 404);
    if (!employee.is_active) return json({ error: "Funcionário inativo" }, 403);

    // 3. Resolve the location and enforce tenant boundary
    const { data: location, error: locError } = await supabase
      .from("locations")
      .select("id, name, latitude, longitude, radius, company_id")
      .eq("id", locationId)
      .maybeSingle();

    if (locError || !location) return json({ error: "Local não encontrado" }, 404);

    if (
      employee.company_id &&
      location.company_id &&
      employee.company_id !== location.company_id
    ) {
      return json({ error: "Local não pertence à sua empresa" }, 403);
    }

    // 4. Geofence — enforced server-side whenever we received coordinates.
    //    Substitutes (folguistas) may use ANY of the company's locations, but
    //    must still be physically present at the one they punch.
    if (typeof latitude === "number" && typeof longitude === "number") {
      const radius = location.radius && location.radius > 0 ? location.radius : 100;
      const dist = Math.round(
        distanceMeters(latitude, longitude, location.latitude, location.longitude)
      );
      if (dist > radius) {
        const distText = dist > 1000 ? `${(dist / 1000).toFixed(1)}km` : `${dist}m`;
        return json(
          {
            error: `Você está a ${distText} do local "${location.name}". Raio permitido: ${radius}m.`,
            outsideRadius: true,
            distance: dist,
          },
          422
        );
      }
    } else if (method === "gps") {
      return json({ error: "Localização (GPS) necessária para este registro" }, 400);
    }

    // 5. Timestamp — the server decides it. Offline flushes may pass the original
    //    punch time, but it is bounded (no future, no older than 7 days).
    let timestamp = new Date().toISOString();
    if (offlineTimestamp) {
      const ts = new Date(offlineTimestamp);
      const now = Date.now();
      if (!isNaN(ts.getTime()) && ts.getTime() <= now + 60_000 && ts.getTime() >= now - 7 * 24 * 3600_000) {
        timestamp = ts.toISOString();
      }
    }

    // 6. Insert the clock record
    const { data: record, error: insertError } = await supabase
      .from("clock_records")
      .insert({
        employee_id: employee.id,
        location_id: location.id,
        type,
        method,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        timestamp,
      })
      .select("id, nsr, record_hash")
      .single();

    if (insertError) {
      // Duplicate guard trigger raises here
      const msg = insertError.message || "";
      if (/duplicad|duplicate/i.test(msg)) {
        return json({ error: "Este ponto já foi registrado", duplicate: true }, 409);
      }
      console.error("Insert error:", insertError);
      return json({ error: "Erro ao registrar ponto" }, 500);
    }

    // 7. Folguista automation — on ENTRY, auto-create the daily payment record,
    //    with the value derived from the DB (never the client) and the São Paulo
    //    local date. Done server-side so it actually persists (RLS-safe).
    let anotacaoCreated = false;

    if (type === "entry" && employee.type === "substitute") {
      // Fetch the daily rate lazily and defensively (column may not exist yet)
      let valorDiaria: number | null = null;
      try {
        const { data: rate } = await supabase
          .from("employees")
          .select("valor_diaria")
          .eq("id", employee.id)
          .maybeSingle();
        valorDiaria = (rate as { valor_diaria?: number | null } | null)?.valor_diaria ?? null;
      } catch (_e) {
        valorDiaria = null;
      }

      if (valorDiaria && valorDiaria > 0) {
      try {
        const { dateStr, month, year } = saoPauloDate(new Date(timestamp));

        // Dedup: only one paid day per folguista per calendar day
        const { data: existing } = await supabase
          .from("anotacoes_folguista")
          .select("id")
          .eq("folguista_id", employee.id)
          .eq("data_trabalho", dateStr)
          .maybeSingle();

        if (!existing) {
          // Find or create the month period
          let periodoId: string | null = null;
          const { data: periodo } = await supabase
            .from("anotacoes_periodo")
            .select("id")
            .eq("folguista_id", employee.id)
            .eq("periodo_mes", month)
            .eq("periodo_ano", year)
            .maybeSingle();

          if (periodo) {
            periodoId = periodo.id;
          } else {
            const { data: newPeriodo } = await supabase
              .from("anotacoes_periodo")
              .insert({
                folguista_id: employee.id,
                periodo_mes: month,
                periodo_ano: year,
                company_id: employee.company_id,
                status: "a_pagar",
              })
              .select("id")
              .single();
            periodoId = newPeriodo?.id ?? null;
          }

          const { error: anotacaoError } = await supabase
            .from("anotacoes_folguista")
            .insert({
              folguista_id: employee.id,
              data_trabalho: dateStr,
              valor: valorDiaria,
              status: "a_pagar",
              periodo_id: periodoId,
              local_id: location.id,
              company_id: employee.company_id,
            });

          if (anotacaoError) {
            console.error("Anotação error:", anotacaoError);
          } else {
            anotacaoCreated = true;
          }
        }
      } catch (e) {
        console.error("Folguista automation failed:", e);
      }
      } // end if (valorDiaria > 0)
    }

    return json({
      success: true,
      recordId: record.id,
      anotacaoCreated,
      // Comprovante de ponto (Portaria 671)
      receipt: {
        nsr: (record as { nsr?: number | null }).nsr ?? null,
        hash: (record as { record_hash?: string | null }).record_hash ?? null,
        timestamp,
        type,
        locationName: location.name,
      },
    });
  } catch (error: unknown) {
    console.error("register-clock error:", error);
    return json({ error: (error as Error).message || "Erro interno" }, 500);
  }
});
