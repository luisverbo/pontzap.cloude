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
//     Sucesso = qualquer resposta 2xx.
//
// Trocar de provedor é só mudar o registro no painel — nenhuma função precisa
// ser reimplantada.

export interface WhatsAppConfig {
  provider: "evolution" | "webhook";
  baseUrl: string;
  apiKey: string;
  instance: string;
}

/** 55 + DDD + número, só dígitos. */
export const formatPhoneNumber = (phone: string): string => {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("55") ? digits : `55${digits}`;
};

/** Config do painel primeiro; variáveis de ambiente como reserva. */
export const resolveWhatsAppConfig = async (supabase: any): Promise<WhatsAppConfig | null> => {
  try {
    const { data } = await supabase
      .from("evolution_config")
      .select("provider, base_url, api_key, instance, is_active")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (data?.base_url && data?.api_key) {
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

export const sendWhatsAppMessage = async (
  phone: string,
  message: string,
  config: WhatsAppConfig,
): Promise<boolean> => {
  const to = formatPhoneNumber(phone);

  try {
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
