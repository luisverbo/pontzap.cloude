// Public read-only view of an approved occurrence.
// The condominium administration opens this via the shared link — no login.
// Access is granted only by the unguessable public_token, and only while the
// occurrence is in the 'approved' status (revoking is just flipping the status).
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

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    let token = url.searchParams.get("token");
    if (!token && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      token = body?.token ?? null;
    }

    // A short token would be brute-forceable; ours are 32+ chars.
    if (!token || token.length < 16) {
      return json({ error: "Link inválido." }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: occ, error } = await supabase
      .from("occurrences")
      .select(
        "id, type_name, description, severity, photo_paths, occurred_at, created_at, status, location_id, company_id",
      )
      .eq("public_token", token)
      .maybeSingle();

    if (error) throw error;
    if (!occ || occ.status !== "approved") {
      return json({ error: "Ocorrência não encontrada ou não disponível." }, 404);
    }

    // Names for the header (kept in separate lookups so the public payload
    // stays limited to exactly what the condo should see).
    const [{ data: loc }, { data: comp }] = await Promise.all([
      occ.location_id
        ? supabase.from("locations").select("name").eq("id", occ.location_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("companies").select("name, phone").eq("id", occ.company_id).maybeSingle(),
    ]);

    const photos = (occ.photo_paths || []).map(
      (p: string) => supabase.storage.from("occurrence-photos").getPublicUrl(p).data.publicUrl,
    );

    return json({
      type_name: occ.type_name,
      description: occ.description,
      severity: occ.severity,
      occurred_at: occ.occurred_at,
      created_at: occ.created_at,
      location_name: loc?.name ?? null,
      company_name: comp?.name ?? null,
      company_phone: comp?.phone ?? null,
      photos,
    });
  } catch (e) {
    console.error("occurrence-public error:", e);
    return json({ error: "Erro ao carregar a ocorrência." }, 500);
  }
});
