import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendWhatsAppRequest {
  clockRecordId: string;
  type: "entry" | "lunch_out" | "lunch_in" | "exit";
  method?: "qr" | "gps";
}

interface NotificationRecipient {
  id: string;
  name: string;
  whatsapp: string;
  scope_type: "all" | "location";
  scope_id: string | null;
  receives_entry: boolean;
  receives_lunch_out: boolean;
  receives_lunch_in: boolean;
  receives_exit: boolean;
  receives_alerts: boolean;
}

interface EvolutionConfig {
  baseUrl: string;
  apiKey: string;
  instance: string;
}

const getClockTypeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    entry: "Entrada",
    lunch_out: "Saída para Almoço",
    lunch_in: "Retorno do Almoço",
    exit: "Saída",
  };
  return labels[type] || type;
};

const getMethodLabel = (method: string | undefined): string => {
  if (method === "qr") return "QR Code";
  return "Sem QR Code";
};

const getNotificationField = (type: string): keyof NotificationRecipient => {
  const fields: Record<string, keyof NotificationRecipient> = {
    entry: "receives_entry",
    lunch_out: "receives_lunch_out",
    lunch_in: "receives_lunch_in",
    exit: "receives_exit",
  };
  return fields[type] || "receives_entry";
};

const formatPhoneNumber = (phone: string): string => {
  const digits = phone.replace(/\D/g, "");
  if (!digits.startsWith("55")) {
    return `55${digits}`;
  }
  return digits;
};

const getEvolutionConfig = (): EvolutionConfig | null => {
  const baseUrl = Deno.env.get("EVOLUTION_API_URL");
  const apiKey = Deno.env.get("EVOLUTION_API_KEY");
  const instance = Deno.env.get("EVOLUTION_INSTANCE");

  if (baseUrl && apiKey && instance) {
    return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey, instance };
  }
  return null;
};

const sendEvolutionMessage = async (
  phone: string,
  message: string,
  config: EvolutionConfig
): Promise<boolean> => {
  const formattedPhone = formatPhoneNumber(phone);
  const url = `${config.baseUrl}/message/sendText/${config.instance}`;

  console.log(`Sending WhatsApp via Evolution API to ${formattedPhone}`);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": config.apiKey,
      },
      body: JSON.stringify({
        number: formattedPhone,
        text: message,
      }),
    });

    const result = await response.json();
    console.log("Evolution API response:", result);

    if (!response.ok) {
      console.error("Evolution API error:", result);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error sending WhatsApp message:", error);
    return false;
  }
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { clockRecordId, type, method }: SendWhatsAppRequest = await req.json();

    console.log(`Processing notification for clock record: ${clockRecordId}, type: ${type}, method: ${method}`);

    const { data: clockRecord, error: clockError } = await supabase
      .from("clock_records")
      .select(`*, employees!inner(id, user_id, company_id), locations!inner(id, name)`)
      .eq("id", clockRecordId)
      .single();

    if (clockError || !clockRecord) {
      console.error("Error fetching clock record:", clockError);
      return new Response(
        JSON.stringify({ error: "Clock record not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("name, email")
      .eq("id", clockRecord.employees.user_id)
      .single();

    let companyName = "PONTZAP";
    if (clockRecord.employees.company_id) {
      const { data: company } = await supabase
        .from("companies")
        .select("name")
        .eq("id", clockRecord.employees.company_id)
        .single();
      if (company) companyName = company.name;
    }

    const employeeName = profile?.name || "Funcionário";
    const locationName = clockRecord.locations?.name || "Local não identificado";
    const locationId = clockRecord.location_id;
    const clockMethod = method || clockRecord.method;
    const timestamp = new Date(clockRecord.timestamp);
    const formattedTime = timestamp.toLocaleTimeString("pt-BR", {
      hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
    });
    const formattedDate = timestamp.toLocaleDateString("pt-BR", {
      timeZone: "America/Sao_Paulo",
    });

    const { data: recipients, error: recipientsError } = await supabase
      .from("notification_recipients")
      .select("*");

    if (recipientsError) {
      console.error("Error fetching recipients:", recipientsError);
      return new Response(
        JSON.stringify({ error: "Error fetching recipients" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!recipients || recipients.length === 0) {
      console.log("No notification recipients configured");
      return new Response(
        JSON.stringify({ success: true, message: "No recipients to notify" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const evolutionConfig = getEvolutionConfig();
    if (!evolutionConfig) {
      console.error("Evolution API credentials not configured (EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE)");
      return new Response(
        JSON.stringify({ error: "Evolution API credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const notificationField = getNotificationField(type);
    const eligibleRecipients = recipients.filter((recipient: NotificationRecipient) => {
      if (!recipient[notificationField]) return false;
      if (recipient.scope_type === "all") return true;
      if (recipient.scope_type === "location" && recipient.scope_id === locationId) return true;
      return false;
    });

    console.log(`Found ${eligibleRecipients.length} eligible recipients`);

    const clockTypeLabel = getClockTypeLabel(type);
    const methodLabel = getMethodLabel(clockMethod);
    const message =
      `🕐 *PONTZAP - Registro de Ponto*\n\n` +
      `🏢 *Empresa:* ${companyName}\n` +
      `📋 *Tipo:* ${clockTypeLabel}\n` +
      `👤 *Funcionário:* ${employeeName}\n` +
      `📍 *Local:* ${locationName}\n` +
      `📅 *Data:* ${formattedDate}\n` +
      `⏰ *Horário:* ${formattedTime}\n` +
      `🔍 *Método:* ${methodLabel}`;

    const results = await Promise.all(
      eligibleRecipients.map(async (recipient: NotificationRecipient) => {
        const success = await sendEvolutionMessage(recipient.whatsapp, message, evolutionConfig);
        return { recipient: recipient.name, success };
      })
    );

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    console.log(`Notifications sent: ${successCount} success, ${failCount} failed`);

    return new Response(
      JSON.stringify({ success: true, sent: successCount, failed: failCount, details: results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in send-whatsapp function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
