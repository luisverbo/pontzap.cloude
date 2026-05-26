import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationRecipient {
  id: string;
  name: string;
  whatsapp: string;
  scope_type: "all" | "location";
  scope_id: string | null;
  receives_alerts: boolean;
  is_location_admin: boolean;
}

const formatPhoneNumber = (phone: string): string => {
  const digits = phone.replace(/\D/g, "");
  if (!digits.startsWith("55")) {
    return `55${digits}`;
  }
  return digits;
};

const sendEvolutionMessage = async (phone: string, message: string): Promise<boolean> => {
  const baseUrl = Deno.env.get("EVOLUTION_API_URL");
  const apiKey = Deno.env.get("EVOLUTION_API_KEY");
  const instance = Deno.env.get("EVOLUTION_INSTANCE");

  if (!baseUrl || !apiKey || !instance) {
    console.error("Evolution API credentials not configured");
    return false;
  }

  const formattedPhone = formatPhoneNumber(phone);
  const url = `${baseUrl.replace(/\/$/, "")}/message/sendText/${instance}`;

  console.log(`Sending response notification via Evolution API to ${formattedPhone}`);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": apiKey },
      body: JSON.stringify({ number: formattedPhone, text: message }),
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

// HMAC signature validation for secure public links
const validateSignature = async (alertId: string, signature: string): Promise<boolean> => {
  const secret = Deno.env.get("ALERT_SIGNING_SECRET");
  if (!secret) {
    console.warn("ALERT_SIGNING_SECRET not configured - allowing access for backward compatibility");
    return true;
  }
  
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(alertId));
    const bytes = new Uint8Array(signatureBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const expectedSignature = btoa(binary)
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    
    return signature === expectedSignature;
  } catch (error) {
    console.error("Error validating signature:", error);
    return false;
  }
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { alertId, responseType, sig, observation } = await req.json();

    if (!alertId || !responseType) {
      return new Response(
        JSON.stringify({ error: "Dados incompletos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(alertId)) {
      return new Response(
        JSON.stringify({ error: "ID do alerta inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate HMAC signature if provided
    if (sig) {
      const isValid = await validateSignature(alertId, sig);
      if (!isValid) {
        return new Response(
          JSON.stringify({ error: "Link inválido ou expirado" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Support both old and new response types
    const validResponses = ["on_way", "absent", "near_destination", "will_be_late", "will_not_work"];
    if (!validResponses.includes(responseType)) {
      return new Response(
        JSON.stringify({ error: "Tipo de resposta inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get alert info
    const { data: alert, error: alertError } = await supabase
      .from("lateness_alerts")
      .select("*, employees(user_id)")
      .eq("id", alertId)
      .maybeSingle();

    if (alertError || !alert) {
      console.error("Error fetching alert:", alertError);
      return new Response(
        JSON.stringify({ error: "Alerta não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if already responded
    if (alert.response_type) {
      return new Response(
        JSON.stringify({ error: "Este alerta já foi respondido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update the alert with the response and observation
    const updateData: Record<string, any> = {
      response_type: responseType,
      response_at: new Date().toISOString(),
    };
    
    // Save observation if provided
    if (observation && typeof observation === 'string') {
      updateData.observation = observation.trim();
    }
    
    const { error: updateError } = await supabase
      .from("lateness_alerts")
      .update(updateData)
      .eq("id", alertId);

    if (updateError) {
      console.error("Error updating alert:", updateError);
      throw new Error("Erro ao salvar resposta");
    }

    // Get employee and location info for notification
    const { data: profile } = await supabase
      .from("profiles")
      .select("name")
      .eq("id", alert.employees?.user_id)
      .single();

    const { data: location } = await supabase
      .from("locations")
      .select("name")
      .eq("id", alert.location_id)
      .single();

    const employeeName = profile?.name || "Funcionário";
    const locationName = location?.name || "Local";
    
    // Map response types to labels
    const responseLabels: Record<string, string> = {
      on_way: "✅ Estou a caminho",
      absent: "❌ Vou faltar",
      near_destination: "🚗 Estou próximo do destino",
      will_be_late: "⏰ Vou me atrasar",
      will_not_work: "❌ Não vou trabalhar",
    };
    const responseLabel = responseLabels[responseType] || responseType;

    // Get notification recipients who receive alerts (excluding síndicos)
    const { data: recipients } = await supabase
      .from("notification_recipients")
      .select("*")
      .eq("receives_alerts", true);

    if (recipients && recipients.length > 0) {
      const eligibleRecipients = recipients.filter((r: NotificationRecipient) => {
        // Exclude síndicos/location admins from response notifications
        if (r.is_location_admin) return false;
        
        if (r.scope_type === "all") return true;
        if (r.scope_type === "location" && r.scope_id === alert.location_id) return true;
        return false;
      });

      const now = new Date();
      let message = `📱 *PONTZAP - Resposta do Funcionário*\n\n` +
        `👤 *Funcionário:* ${employeeName}\n` +
        `📍 *Local:* ${locationName}\n` +
        `⏰ *Horário previsto:* ${alert.scheduled_time.slice(0, 5)}\n` +
        `📅 *Data:* ${now.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}\n\n` +
        `💬 *Resposta:* ${responseLabel}`;
      
      // Add observation if provided
      if (observation) {
        message += `\n📝 *Motivo:* ${observation}`;
      }

      // Send notifications
      for (const recipient of eligibleRecipients) {
        await sendEvolutionMessage(recipient.whatsapp, message);
      }

      // Mark as notified
      await supabase
        .from("lateness_alerts")
        .update({ response_notified: true })
        .eq("id", alertId);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in respond-lateness:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
