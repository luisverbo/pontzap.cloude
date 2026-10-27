// Painel Master ↔ API oficial do WhatsApp (Meta Cloud API).
//
// Ações (POST { action, ... }):
//   info       → dados do número na Meta (nome aprovado, qualidade, status)
//   register   → ativa o número na Cloud API  { pin: "123456" }
//   templates  → status de cada template do PONTZAP na Meta
//   sync       → cria na Meta os templates que ainda não existem
//   test       → manda o template "hello_world" para um número  { phone }
//
// Só master users. O token da Meta nunca sai do servidor.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveWhatsAppConfig, metaRequest, formatPhoneNumber, type WhatsAppConfig } from "../_shared/whatsapp.ts";
import { TEMPLATES, TEMPLATE_LANGUAGE, buildCreatePayload } from "../_shared/templates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const metaError = (r: { status: number; data: any }) =>
  r.data?.error?.error_user_msg || r.data?.error?.message || `Erro ${r.status} na Meta`;

/** Lê todos os templates da WABA (paginado). */
async function listMetaTemplates(config: WhatsAppConfig) {
  const all: any[] = [];
  let path = `${config.meta!.wabaId}/message_templates?fields=id,name,status,category,language,rejected_reason&limit=100`;
  for (let page = 0; page < 10 && path; page++) {
    const r = await metaRequest(config, path);
    if (!r.ok) throw new Error(metaError(r));
    all.push(...(r.data?.data ?? []));
    const next: string | undefined = r.data?.paging?.next;
    path = next ? next.replace(/^https:\/\/graph\.facebook\.com\/v[\d.]+\//, "") : "";
  }
  return all;
}

/** Junta definição local + estado na Meta e grava o espelho. */
async function refreshTemplates(db: any, config: WhatsAppConfig) {
  const remote = await listMetaTemplates(config);
  const now = new Date().toISOString();
  const rows = Object.values(TEMPLATES).map((def) => {
    const r = remote.find((t) => t.name === def.name && t.language === TEMPLATE_LANGUAGE);
    return {
      name: def.name,
      language: TEMPLATE_LANGUAGE,
      requested_category: "UTILITY",
      category: r?.category ?? null,
      status: r?.status ?? "NOT_SUBMITTED",
      meta_id: r?.id ?? null,
      rejected_reason: r?.rejected_reason && r.rejected_reason !== "NONE" ? r.rejected_reason : null,
      last_synced_at: now,
      updated_at: now,
    };
  });
  await db.from("whatsapp_templates").upsert(rows, { onConflict: "name" });

  const { data: saved } = await db.from("whatsapp_templates").select("*");
  const byName = new Map((saved ?? []).map((s: any) => [s.name, s]));
  return Object.values(TEMPLATES).map((def) => ({
    name: def.name,
    purpose: def.purpose,
    audience: def.audience,
    body: def.body,
    buttons: def.buttons ?? [],
    ...(byName.get(def.name) ?? {}),
  }));
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Não autenticado." }, 401);
    const { data: userData, error: userErr } = await db.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Sessão inválida." }, 401);
    const { data: isMaster } = await db.rpc("is_master_user", { _user_id: userData.user.id });
    if (!isMaster) return json({ error: "Apenas usuários master." }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "info");

    const config = await resolveWhatsAppConfig(db);
    if (!config || config.provider !== "meta" || !config.meta) {
      return json({ error: "Salve primeiro a configuração da API oficial (provedor Meta)." }, 400);
    }
    const meta = config.meta;

    if (action === "info") {
      const r = await metaRequest(
        config,
        `${meta.phoneNumberId}?fields=display_phone_number,verified_name,name_status,quality_rating,code_verification_status,status,platform_type,messaging_limit_tier`,
      );
      if (!r.ok) return json({ error: metaError(r) }, 502);
      if (r.data?.display_phone_number) {
        await db.from("evolution_config")
          .update({ meta_display_phone: r.data.display_phone_number })
          .eq("provider", "meta");
      }
      return json({ phone: r.data });
    }

    if (action === "register") {
      const pin = String(body?.pin || "");
      if (!/^\d{6}$/.test(pin)) return json({ error: "O PIN deve ter 6 números." }, 400);
      const r = await metaRequest(config, `${meta.phoneNumberId}/register`, {
        body: { messaging_product: "whatsapp", pin },
      });
      if (!r.ok) return json({ error: metaError(r) }, 502);
      return json({ success: true });
    }

    if (!meta.wabaId && (action === "templates" || action === "sync")) {
      return json({ error: "Informe o ID da conta do WhatsApp Business (WABA) no painel." }, 400);
    }

    if (action === "templates") {
      return json({ templates: await refreshTemplates(db, config) });
    }

    if (action === "sync") {
      const remote = await listMetaTemplates(config);
      const results: { name: string; created: boolean; error?: string }[] = [];

      for (const def of Object.values(TEMPLATES)) {
        const exists = remote.some((t) => t.name === def.name && t.language === TEMPLATE_LANGUAGE);
        if (exists) { results.push({ name: def.name, created: false }); continue; }

        const r = await metaRequest(config, `${meta.wabaId}/message_templates`, {
          body: buildCreatePayload(def),
        });
        if (r.ok) {
          results.push({ name: def.name, created: true });
        } else {
          const error = metaError(r);
          results.push({ name: def.name, created: false, error });
          await db.from("whatsapp_templates").upsert({
            name: def.name, language: TEMPLATE_LANGUAGE, last_error: error, updated_at: new Date().toISOString(),
          }, { onConflict: "name" });
        }
      }

      const templates = await refreshTemplates(db, config);
      return json({ results, templates });
    }

    if (action === "test") {
      const phone = String(body?.phone || "");
      if (phone.replace(/\D/g, "").length < 10) return json({ error: "Informe o número com DDD." }, 400);
      // hello_world vem pronto em toda conta nova da Meta (inglês, aprovado).
      const r = await metaRequest(config, `${meta.phoneNumberId}/messages`, {
        body: {
          messaging_product: "whatsapp",
          to: formatPhoneNumber(phone),
          type: "template",
          template: { name: "hello_world", language: { code: "en_US" } },
        },
      });
      if (!r.ok) return json({ error: metaError(r) }, 502);
      return json({ success: true });
    }

    return json({ error: "Ação desconhecida." }, 400);
  } catch (e: any) {
    console.error("whatsapp-official error:", e);
    return json({ error: e?.message || "Erro inesperado." }, 500);
  }
});
