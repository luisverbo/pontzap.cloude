import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendSwapNotificationRequest {
  swapId: string;
  notificationType: "requested" | "accepted" | "approved" | "rejected";
}

const formatPhoneNumber = (phone: string): string => {
  const digits = phone.replace(/\D/g, "");
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
  const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;

  console.log(`Sending WhatsApp message to ${formattedPhone}`);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    
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

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('pt-BR');
};

const formatTime = (timeStr: string): string => {
  return timeStr.slice(0, 5);
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { swapId, notificationType }: SendSwapNotificationRequest = await req.json();

    console.log(`Processing swap notification: ${swapId}, type: ${notificationType}`);

    // Get swap details with employee and location info
    const { data: swap, error: swapError } = await supabase
      .from("shift_swaps")
      .select(`
        *,
        requester:employees!shift_swaps_requester_employee_id_fkey(
          id,
          user_id,
          company_id
        ),
        target:employees!shift_swaps_target_employee_id_fkey(
          id,
          user_id,
          company_id
        ),
        location:locations(name)
      `)
      .eq("id", swapId)
      .single();

    if (swapError || !swap) {
      console.error("Error fetching swap:", swapError);
      return new Response(
        JSON.stringify({ error: "Swap not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get profiles for both employees
    const { data: requesterProfile } = await supabase
      .from("profiles")
      .select("name, phone")
      .eq("id", swap.requester.user_id)
      .single();

    const { data: targetProfile } = await supabase
      .from("profiles")
      .select("name, phone")
      .eq("id", swap.target.user_id)
      .single();

    const requesterName = requesterProfile?.name || "Funcionário";
    const targetName = targetProfile?.name || "Funcionário";
    const locationName = swap.location?.name || "Local não identificado";

    // Get notification recipients that receive alerts
    const { data: recipients } = await supabase
      .from("notification_recipients")
      .select("*")
      .eq("receives_alerts", true);

    // Get Z-API configuration
    const zapiConfig = await getZAPIConfig(supabase);
    if (!zapiConfig) {
      console.error("Z-API credentials not configured");
      return new Response(
        JSON.stringify({ error: "Z-API credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: { recipient: string; success: boolean }[] = [];

    // Build messages based on notification type
    if (notificationType === "requested") {
      // Notify target employee about swap request
      if (targetProfile?.phone) {
        const message = `🔄 *PONTZAP - Solicitação de Troca*\n\n` +
          `📍 *Local:* ${locationName}\n` +
          `👤 *Solicitante:* ${requesterName}\n` +
          `📅 *Quer trocar:* ${formatDate(swap.requester_date)} (${formatTime(swap.requester_start_time)}-${formatTime(swap.requester_end_time)})\n` +
          `📅 *Pelo seu dia:* ${formatDate(swap.target_date)} (${formatTime(swap.target_start_time)}-${formatTime(swap.target_end_time)})\n\n` +
          `Acesse o app para aceitar ou recusar.`;

        const success = await sendZAPIMessage(targetProfile.phone, message, zapiConfig);
        results.push({ recipient: targetName, success });
      }
    } else if (notificationType === "accepted") {
      // Notify requester that target accepted
      if (requesterProfile?.phone) {
        const message = `✅ *PONTZAP - Troca Aceita*\n\n` +
          `📍 *Local:* ${locationName}\n` +
          `👤 *${targetName}* aceitou sua troca!\n` +
          `📅 *Seu dia:* ${formatDate(swap.requester_date)}\n` +
          `📅 *Trocado por:* ${formatDate(swap.target_date)}\n\n` +
          `Aguardando aprovação do administrador.`;

        const success = await sendZAPIMessage(requesterProfile.phone, message, zapiConfig);
        results.push({ recipient: requesterName, success });
      }

      // Notify admins about pending approval
      if (recipients) {
        for (const recipient of recipients) {
          const message = `🔔 *PONTZAP - Troca Pendente*\n\n` +
            `📍 *Local:* ${locationName}\n` +
            `👤 *Solicitante:* ${requesterName}\n` +
            `👤 *Colega:* ${targetName}\n` +
            `📅 *Data troca:* ${formatDate(swap.requester_date)} ↔ ${formatDate(swap.target_date)}\n\n` +
            `A troca foi aceita pelo colega e aguarda sua aprovação.`;

          const success = await sendZAPIMessage(recipient.whatsapp, message, zapiConfig);
          results.push({ recipient: recipient.name, success });
        }
      }
    } else if (notificationType === "approved") {
      // Notify both employees about approval
      const approvalMessage = (employeeName: string, originalDate: string, newDate: string) =>
        `🎉 *PONTZAP - Troca Aprovada!*\n\n` +
        `📍 *Local:* ${locationName}\n` +
        `✅ Sua troca foi aprovada!\n` +
        `📅 *Você trabalhava:* ${formatDate(originalDate)}\n` +
        `📅 *Agora trabalha:* ${formatDate(newDate)}\n\n` +
        `As escalas foram atualizadas automaticamente.`;

      if (requesterProfile?.phone) {
        const success = await sendZAPIMessage(
          requesterProfile.phone,
          approvalMessage(requesterName, swap.requester_date, swap.target_date),
          zapiConfig
        );
        results.push({ recipient: requesterName, success });
      }

      if (targetProfile?.phone) {
        const success = await sendZAPIMessage(
          targetProfile.phone,
          approvalMessage(targetName, swap.target_date, swap.requester_date),
          zapiConfig
        );
        results.push({ recipient: targetName, success });
      }
    } else if (notificationType === "rejected") {
      // Notify requester about rejection
      if (requesterProfile?.phone) {
        const message = `❌ *PONTZAP - Troca Recusada*\n\n` +
          `📍 *Local:* ${locationName}\n` +
          `A sua solicitação de troca para ${formatDate(swap.requester_date)} foi recusada.\n\n` +
          `${swap.reason ? `*Motivo:* ${swap.reason}` : ''}`;

        const success = await sendZAPIMessage(requesterProfile.phone, message, zapiConfig);
        results.push({ recipient: requesterName, success });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    console.log(`Swap notifications sent: ${successCount} success, ${failCount} failed`);

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
    console.error("Error in send-swap-notification function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
