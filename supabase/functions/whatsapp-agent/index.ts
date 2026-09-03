// Ponte entre o Painel Master e o agente de WhatsApp na VPS.
//
// O painel roda em HTTPS e o agente costuma ficar em HTTP puro — o navegador
// bloqueia essa mistura (mixed content). Esta função faz a chamada pelo
// servidor, então o painel nunca fala direto com a VPS.
//
// Ações:
//   status → { connected, qr }  (qr = data URL PNG, quando desconectado)
//   logout → encerra a sessão e força um QR novo (trocar de número)
//
// Só master users. O token do agente nunca sai daqui.
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
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Só master user opera a conexão do WhatsApp
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Não autenticado." }, 401);

    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Sessão inválida." }, 401);

    const { data: isMaster } = await supabase.rpc("is_master_user", { _user_id: userData.user.id });
    if (!isMaster) return json({ error: "Apenas usuários master." }, 403);

    const body = await req.json().catch(() => ({}));
    const action: string = body?.action === "logout" ? "logout" : "status";

    const { data: cfg } = await supabase
      .from("evolution_config")
      .select("provider, base_url, api_key, is_active")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (!cfg?.base_url || !cfg?.api_key) {
      return json({ error: "Nenhuma conexão de WhatsApp configurada." }, 400);
    }
    if (cfg.provider !== "webhook") {
      return json({ error: "Disponível apenas no provedor 'Meu agente (VPS)'." }, 400);
    }

    // base_url é a URL de envio (…/send); o status fica na raiz do agente
    const base = String(cfg.base_url).replace(/\/send\/?$/i, "").replace(/\/$/, "");

    const res = await fetch(`${base}/${action}`, {
      method: action === "logout" ? "POST" : "GET",
      headers: { Authorization: `Bearer ${cfg.api_key}` },
      signal: AbortSignal.timeout(15000),
    });

    const text = await res.text();
    if (!res.ok) {
      return json({ error: `O agente respondeu ${res.status}: ${text.slice(0, 200)}` }, 502);
    }

    try {
      return json(JSON.parse(text));
    } catch {
      return json({ error: "Resposta inesperada do agente. Ele está atualizado?" }, 502);
    }
  } catch (e) {
    const msg = String((e as any)?.message || e);
    // Rede/timeout: quase sempre agente parado, porta fechada ou URL errada
    return json(
      { error: `Não foi possível falar com o agente na VPS (${msg}). Confira se ele está rodando e se a porta está aberta.` },
      502,
    );
  }
});
