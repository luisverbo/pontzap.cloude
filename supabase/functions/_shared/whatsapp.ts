// Envio de WhatsApp com provedor configurável (Painel Master → evolution_config).
//
//  provider = 'evolution' (padrão)
//     POST {base_url}/message/sendText/{instance}
//     header apikey: {api_key}          body { number, text }
//
//  provider = 'webhook'  → agente próprio na VPS
//     POST {base_url}                    (URL completa do endpoint)
//     header Authorization: Bearer {api_key}
//     body { phone, message }
//
//  provider = 'meta'     → API oficial do WhatsApp (Cloud API)
//     POST https://graph.facebook.com/{versão}/{phone_number_id}/messages
//     header Authorization: Bearer {meta_access_token}
//     Mensagem iniciada pela empresa só pode ser TEMPLATE. Texto livre só
//     dentro da janela de 24 h depois que a pessoa escreveu/clicou.
//
// Trocar de provedor é só mudar o registro no painel — nenhuma função precisa
// ser reimplantada.
//
// Use sendNotification() para tudo que é AVISO (a empresa puxa a conversa):
// com 'meta' ele escolhe sozinho entre texto livre grátis (janela aberta) e
// template; com os outros provedores manda o texto de sempre.

import { TEMPLATES, TEMPLATE_LANGUAGE, sanitizeParam, type TemplateKey } from "./templates.ts";

export interface WhatsAppConfig {
  provider: "evolution" | "webhook" | "meta";
  baseUrl: string;
  apiKey: string;
  instance: string;
  meta?: {
    phoneNumberId: string;
    wabaId: string;
    token: string;
    version: string;
  };
}

/** 55 + DDD + número, só dígitos. */
export const formatPhoneNumber = (phone: string): string => {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("55") ? digits : `55${digits}`;
};

/** Config do painel primeiro; variáveis de ambiente como reserva. */
export const resolveWhatsAppConfig = async (supabase: any): Promise<WhatsAppConfig | null> => {
  try {
    // '*' para não quebrar se alguma coluna nova ainda não existir.
    const { data } = await supabase
      .from("evolution_config")
      .select("*")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (data?.provider === "meta") {
      if (data.meta_phone_number_id && data.meta_access_token) {
        return {
          provider: "meta",
          baseUrl: "",
          apiKey: "",
          instance: "",
          meta: {
            phoneNumberId: String(data.meta_phone_number_id).trim(),
            wabaId: String(data.meta_waba_id || "").trim(),
            token: String(data.meta_access_token).trim(),
            version: String(data.meta_api_version || "v21.0").trim(),
          },
        };
      }
    } else if (data?.base_url && data?.api_key) {
      const provider = (data.provider === "webhook" ? "webhook" : "evolution") as WhatsAppConfig["provider"];
      // O webhook usa a URL exata informada; a Evolution monta o caminho depois.
      if (provider === "webhook") {
        return { provider, baseUrl: String(data.base_url), apiKey: data.api_key, instance: "" };
      }
      if (data.instance) {
        return {
          provider,
          baseUrl: String(data.base_url).replace(/\/$/, ""),
          apiKey: data.api_key,
          instance: data.instance,
        };
      }
    }
  } catch (_e) {
    /* tabela pode não existir ainda / coluna provider ausente */
  }

  const baseUrl = Deno.env.get("EVOLUTION_API_URL");
  const apiKey = Deno.env.get("EVOLUTION_API_KEY");
  const instance = Deno.env.get("EVOLUTION_INSTANCE");
  if (baseUrl && apiKey && instance) {
    return { provider: "evolution", baseUrl: baseUrl.replace(/\/$/, ""), apiKey, instance };
  }
  return null;
};

// ---------------------------------------------------------------------------
// Meta Cloud API
// ---------------------------------------------------------------------------

export interface MetaResult {
  ok: boolean;
  status: number;
  data: any;
}

/** Chamada genérica à Graph API com o token da configuração. */
export async function metaRequest(
  config: WhatsAppConfig,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<MetaResult> {
  const meta = config.meta!;
  const url = `https://graph.facebook.com/${meta.version}/${path.replace(/^\//, "")}`;
  const res = await fetch(url, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: {
      Authorization: `Bearer ${meta.token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

const metaErrorText = (r: MetaResult) =>
  `${r.status} ${r.data?.error?.code ?? ""} ${r.data?.error?.message ?? ""}`.trim();

async function sendMetaText(config: WhatsAppConfig, to: string, body: string): Promise<boolean> {
  const r = await metaRequest(config, `${config.meta!.phoneNumberId}/messages`, {
    body: {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: true, body: body.slice(0, 4096) },
    },
  });
  if (!r.ok) console.error("Meta: falha no texto:", metaErrorText(r));
  return r.ok;
}

async function sendMetaTemplate(
  config: WhatsAppConfig,
  to: string,
  key: TemplateKey,
  params: unknown[],
  buttonPayloads: string[],
): Promise<boolean> {
  const def = TEMPLATES[key];
  const components: unknown[] = [
    { type: "body", parameters: params.map((p) => ({ type: "text", text: sanitizeParam(p) })) },
  ];
  (def.buttons ?? []).forEach((_text, index) => {
    components.push({
      type: "button",
      sub_type: "quick_reply",
      index: String(index),
      parameters: [{ type: "payload", payload: buttonPayloads[index] ?? "ack" }],
    });
  });

  const r = await metaRequest(config, `${config.meta!.phoneNumberId}/messages`, {
    body: {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "template",
      template: { name: def.name, language: { code: TEMPLATE_LANGUAGE }, components },
    },
  });
  if (!r.ok) console.error(`Meta: falha no template ${def.name}:`, metaErrorText(r));
  return r.ok;
}

/**
 * Janela de atendimento aberta? (a pessoa escreveu/clicou nas últimas 24 h)
 * Margem de 30 min para não mandar texto livre com a janela fechando.
 */
async function isWindowOpen(supabase: any, phone: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("whatsapp_contacts")
      .select("last_inbound_at")
      .eq("phone", phone)
      .maybeSingle();
    if (!data?.last_inbound_at) return false;
    return Date.now() - new Date(data.last_inbound_at).getTime() < (23 * 60 + 30) * 60 * 1000;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Texto livre. Com 'meta' só funciona dentro da janela de 24 h — use para
 * RESPONDER quem acabou de escrever. Para avisos, use sendNotification().
 */
export const sendWhatsAppMessage = async (
  phone: string,
  message: string,
  config: WhatsAppConfig,
): Promise<boolean> => {
  const to = formatPhoneNumber(phone);

  try {
    if (config.provider === "meta") return await sendMetaText(config, to, message);

    const isWebhook = config.provider === "webhook";
    const url = isWebhook ? config.baseUrl : `${config.baseUrl}/message/sendText/${config.instance}`;

    console.log(`Enviando WhatsApp via ${config.provider} para ${to}`);

    const response = await fetch(url, {
      method: "POST",
      headers: isWebhook
        ? { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` }
        : { "Content-Type": "application/json", apikey: config.apiKey },
      body: JSON.stringify(
        isWebhook ? { phone: to, message } : { number: to, text: message },
      ),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(`Falha no envio (${config.provider}) ${response.status}:`, body.slice(0, 400));
      return false;
    }
    return true;
  } catch (error) {
    console.error("Erro ao enviar WhatsApp:", error);
    return false;
  }
};

export interface TemplateSpec {
  template: TemplateKey;
  /** Valores de {{1}}, {{2}}… na ordem. */
  params: unknown[];
  /**
   * Payload de cada botão, na ordem dos botões do template. Use "@details"
   * para o botão "Ver detalhes": o texto completo é guardado e enviado de
   * graça quando a pessoa tocar.
   */
  buttons?: string[];
}

/**
 * Envia um AVISO. `text` é a mensagem completa de sempre; `spec` diz qual
 * template usar quando o provedor é a API oficial.
 *
 * Com 'meta':
 *   - janela aberta → manda `text` como texto livre (grátis);
 *   - janela fechada → manda o template (pago), cujo botão reabre a janela.
 * Com os demais provedores: manda `text`.
 */
export async function sendNotification(
  supabase: any,
  config: WhatsAppConfig,
  phone: string,
  text: string,
  spec: TemplateSpec,
): Promise<boolean> {
  if (config.provider !== "meta") return sendWhatsAppMessage(phone, text, config);

  const to = formatPhoneNumber(phone);
  try {
    if (await isWindowOpen(supabase, to)) {
      const sent = await sendMetaText(config, to, text);
      if (sent) return true;
      // Janela pode ter fechado nesse meio-tempo — cai para o template.
    }

    let payloads = spec.buttons ?? [];
    if (payloads.includes("@details")) {
      const { data } = await supabase
        .from("whatsapp_details")
        .insert({ phone: to, body: text })
        .select("id")
        .single();
      payloads = payloads.map((p) => (p === "@details" ? `detail:${data?.id ?? ""}` : p));
    }

    return await sendMetaTemplate(config, to, spec.template, spec.params, payloads);
  } catch (error) {
    console.error("Erro ao enviar aviso pela API oficial:", error);
    return false;
  }
}
