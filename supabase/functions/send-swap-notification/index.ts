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

interface EvolutionConfig {
  baseUrl: string;
  apiKey: string;
  instance: string;
}

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
      headers: { "Content-Type": "application/json", "apikey": config.apiKey },
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
    const evolutionConfig = getEvolutionConfig();
    if (!evolutionConfig) {
      console.error("Evolution API credentials not configured");
      return new Response(
        JSON.stringify({ error: "Evolution API credentials not configured" }),
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

        const success = await sendEvolutionMessage(targetProfile.phone, message, evolutionConfig);
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

        const success = await sendEvolutionMessage(requesterProfile.phone, message, evolutionConfig);
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

          const success = await sendEvolutionMessage(recipient.whatsapp, message, evolutionConfig);
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
        const success = await sendEvolutionMessage(
          requesterProfile.phone,
          approvalMessage(requesterName, swap.requester_date, swap.target_date),
          evolutionConfig
        );
        results.push({ recipient: requesterName, success });
      }

      if (targetProfile?.phone) {
        const success = await sendEvolutionMessage(
          targetProfile.phone,
          approvalMessage(targetName, swap.target_date, swap.requester_date),
          evolutionConfig
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

        const success = await sendEvolutionMessage(requesterProfile.phone, message, evolutionConfig);
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
