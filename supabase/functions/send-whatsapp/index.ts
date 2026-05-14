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
  // Remove all non-digits
  const digits = phone.replace(/\D/g, "");
  
  // Ensure it starts with country code (55 for Brazil)
  if (!digits.startsWith("55")) {
    return `55${digits}`;
  }
  return digits;
};

const getZAPIConfig = async (supabase: any): Promise<{ instanceId: string; token: string; clientToken: string | null } | null> => {
  // First try to get from database (master panel config)
  const { data: dbConfig } = await supabase
    .from("zapi_config")
    .select("instance_id, token, client_token, is_active")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (dbConfig && dbConfig.instance_id && dbConfig.token) {
    console.log("Using Z-API config from database");
    return {
      instanceId: dbConfig.instance_id,
      token: dbConfig.token,
      clientToken: dbConfig.client_token || null,
    };
  }

  // Fallback to environment variables
  const instanceId = Deno.env.get("ZAPI_INSTANCE_ID");
  const token = Deno.env.get("ZAPI_TOKEN");
  const clientToken = Deno.env.get("ZAPI_CLIENT_TOKEN");

  if (instanceId && token) {
    console.log("Using Z-API config from environment variables");
    return { instanceId, token, clientToken: clientToken || null };
  }

  return null;
};

const sendZAPIMessage = async (phone: string, message: string, zapiConfig: { instanceId: string; token: string; clientToken: string | null }): Promise<boolean> => {
  const { instanceId, token, clientToken } = zapiConfig;

  const formattedPhone = formatPhoneNumber(phone);
  // Z-API endpoint for sending text messages (correct endpoint: /send-text)
  const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;

  console.log(`Sending WhatsApp message to ${formattedPhone}`);
  console.log(`Z-API URL: ${url}`);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    
    // Add client token if available
    if (clientToken) {
      headers["Client-Token"] = clientToken;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        phone: formattedPhone,
        message: message,
      }),
    });

    const result = await response.json();
    console.log("Z-API response:", result);

    if (!response.ok || result.error) {
      console.error("Z-API error:", result);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error sending WhatsApp message:", error);
    return false;
  }
};

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { clockRecordId, type, method }: SendWhatsAppRequest = await req.json();

    console.log(`Processing notification for clock record: ${clockRecordId}, type: ${type}, method: ${method}`);

    // Get clock record with employee and location details
    const { data: clockRecord, error: clockError } = await supabase
      .from("clock_records")
      .select(`
        *,
        employees!inner(id, user_id, company_id),
        locations!inner(id, name)
      `)
      .eq("id", clockRecordId)
      .single();

    if (clockError || !clockRecord) {
      console.error("Error fetching clock record:", clockError);
      return new Response(
        JSON.stringify({ error: "Clock record not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get employee profile separately
    const { data: profile } = await supabase
      .from("profiles")
      .select("name, email")
      .eq("id", clockRecord.employees.user_id)
      .single();

    // Get company name if available
    let companyName = "PONTZAP";
    if (clockRecord.employees.company_id) {
      const { data: company } = await supabase
        .from("companies")
        .select("name")
        .eq("id", clockRecord.employees.company_id)
        .single();
      if (company) {
        companyName = company.name;
      }
    }

    const employeeName = profile?.name || "Funcionário";
    const locationName = clockRecord.locations?.name || "Local não identificado";
    const locationId = clockRecord.location_id;
    const clockMethod = method || clockRecord.method;
    const timestamp = new Date(clockRecord.timestamp);
    const formattedTime = timestamp.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
    const formattedDate = timestamp.toLocaleDateString("pt-BR", {
      timeZone: "America/Sao_Paulo",
    });

    // Get notification recipients
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

    // Get Z-API configuration
    const zapiConfig = await getZAPIConfig(supabase);
    if (!zapiConfig) {
      console.error("Z-API credentials not configured");
      return new Response(
        JSON.stringify({ error: "Z-API credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Filter recipients based on scope and notification type
    const notificationField = getNotificationField(type);
    const eligibleRecipients = recipients.filter((recipient: NotificationRecipient) => {
      // Check if recipient wants this type of notification
      if (!recipient[notificationField]) {
        return false;
      }

      // Check scope
      if (recipient.scope_type === "all") {
        return true;
      }

      if (recipient.scope_type === "location" && recipient.scope_id === locationId) {
        return true;
      }

      return false;
    });

    console.log(`Found ${eligibleRecipients.length} eligible recipients`);

    // Build message with company name and method
    const clockTypeLabel = getClockTypeLabel(type);
    const methodLabel = getMethodLabel(clockMethod);
    const message = `🕐 *PONTZAP - Registro de Ponto*\n\n` +
      `🏢 *Empresa:* ${companyName}\n` +
      `📋 *Tipo:* ${clockTypeLabel}\n` +
      `👤 *Funcionário:* ${employeeName}\n` +
      `📍 *Local:* ${locationName}\n` +
      `📅 *Data:* ${formattedDate}\n` +
      `⏰ *Horário:* ${formattedTime}\n` +
      `🔍 *Método:* ${methodLabel}`;

    // Send messages to all eligible recipients
    const results = await Promise.all(
      eligibleRecipients.map(async (recipient: NotificationRecipient) => {
        const success = await sendZAPIMessage(recipient.whatsapp, message, zapiConfig);
        return { recipient: recipient.name, success };
      })
    );

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    console.log(`Notifications sent: ${successCount} success, ${failCount} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        sent: successCount,
        failed: failCount,
        details: results,
      }),
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
