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

  console.log(`Sending message to ${formattedPhone}`);

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
      body: JSON.stringify({ phone: formattedPhone, message }),
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

/**
 * Calcula se hoje é dia de trabalho para escala 12x36
 * Na escala 12x36: trabalha 12h, descansa 36h (1 dia trabalho, ~1.5 dias folga)
 * O ciclo é: Dia 1 = trabalha, Dia 2 = folga, Dia 3 = trabalha, Dia 4 = folga...
 * Ou seja, trabalha em dias ímpares do ciclo (1, 3, 5, 7...)
 */
const is12x36WorkDay = (cycleStartDate: string, today: Date): boolean => {
  const startDate = new Date(cycleStartDate);
  startDate.setHours(0, 0, 0, 0);
  
  const todayDate = new Date(today);
  todayDate.setHours(0, 0, 0, 0);
  
  // Calcular diferença em dias desde o início do ciclo
  const diffTime = todayDate.getTime() - startDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  // Na escala 12x36, o ciclo completo é de 2 dias (trabalha 1, folga 1)
  // Porém, como são 36h de descanso após 12h de trabalho:
  // Se começou dia 1: trabalha dia 1, folga dias 2-3 (parcialmente), trabalha dia 3 (tarde)
  // Simplificação comum: dias alternados
  // Dia 0 do ciclo = trabalha, Dia 1 = folga, Dia 2 = trabalha, etc.
  const dayInCycle = diffDays % 2;
  
  console.log(`12x36 check: cycleStart=${cycleStartDate}, today=${todayDate.toISOString()}, diffDays=${diffDays}, dayInCycle=${dayInCycle}`);
  
  // Se diffDays é negativo (data de hoje é antes do início do ciclo), não trabalha
  if (diffDays < 0) {
    console.log("12x36: Today is before cycle start, not a work day");
    return false;
  }
  
  // Trabalha nos dias pares do ciclo (0, 2, 4, ...) - ou seja, dia do início do ciclo e a cada 2 dias
  return dayInCycle === 0;
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Validate secret header for cron job authentication
  const cronSecret = Deno.env.get("CRON_SECRET");
  const authHeader = req.headers.get("x-cron-secret");
  
  if (cronSecret && authHeader !== cronSecret) {
    console.error("Unauthorized: Invalid cron secret");
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Use São Paulo timezone
    const now = new Date();
    const spTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const currentTime = spTime.toTimeString().slice(0, 5); // HH:MM
    const today = spTime.toISOString().split("T")[0]; // YYYY-MM-DD
    const dayOfWeek = spTime.getDay(); // 0=Sunday, 1=Monday, etc.

    console.log(`Checking lateness at ${currentTime} on ${today} (day ${dayOfWeek}) - São Paulo time`);

    // Get fixed schedules for today (includes all schedule types: regular, 12x36, summer, rotating)
    const { data: fixedSchedules, error: fixedError } = await supabase
      .from("fixed_schedules")
      .select("*, employees!inner(id, user_id, is_active, schedule_type)")
      .eq("day_of_week", dayOfWeek)
      .eq("works", true)
      .eq("employees.is_active", true);

    if (fixedError) {
      console.error("Error fetching fixed schedules:", fixedError);
    }

    // Get punctual schedules for today (substitutes/folguistas - these OVERRIDE fixed schedules)
    const { data: punctualSchedules, error: punctualError } = await supabase
      .from("punctual_schedules")
      .select("*, employees!inner(id, user_id, is_active, schedule_type)")
      .eq("date", today)
      .eq("employees.is_active", true);

    if (punctualError) {
      console.error("Error fetching punctual schedules:", punctualError);
    }

    // Create a set of employee IDs who have punctual schedules today
    // These override fixed schedules
    const employeesWithPunctualSchedule = new Set(
      (punctualSchedules || []).map((s) => s.employee_id)
    );

    // Filter out fixed schedules for employees who have punctual schedules today
    const filteredFixedSchedules = (fixedSchedules || []).filter(
      (s) => !employeesWithPunctualSchedule.has(s.employee_id)
    );

    // Combine schedules - punctual schedules take priority
    const allSchedules = [
      ...filteredFixedSchedules.map((s) => ({ 
        ...s, 
        source_type: "fixed",
        employee_schedule_type: s.schedule_type || s.employees?.schedule_type || "regular"
      })),
      ...(punctualSchedules || []).map((s) => ({ 
        ...s, 
        source_type: "punctual",
        employee_schedule_type: "punctual" // Punctual/folguista schedules
      })),
    ];

    console.log(`Found ${allSchedules.length} schedules to check`);

    const alertsToSend: Array<{
      employeeId: string;
      employeeName: string;
      employeePhone: string | null;
      locationId: string;
      locationName: string;
      scheduledTime: string;
      toleranceMinutes: number;
    }> = [];

    for (const schedule of allSchedules) {
      const startTime = schedule.start_time.slice(0, 5); // HH:MM
      const tolerance = schedule.tolerance_minutes || 15;
      const scheduleType = schedule.employee_schedule_type || "regular";

      console.log(`Checking schedule for employee ${schedule.employee_id}: type=${scheduleType}, source=${schedule.source_type}`);

      // Para escala 12x36, verificar se hoje é dia de trabalho usando o ciclo
      if (scheduleType === "12x36") {
        // Verificar se há cycle_start_date definido
        if (schedule.cycle_start_date) {
          const isWorkDay = is12x36WorkDay(schedule.cycle_start_date, spTime);
          if (!isWorkDay) {
            console.log(`12x36: Employee ${schedule.employee_id} is on rest day (cycle-based), skipping`);
            continue;
          }
          console.log(`12x36: Employee ${schedule.employee_id} is on work day (cycle-based)`);
        } else {
          // Fallback: se não tem cycle_start_date, verificar se trabalhou ontem
          const yesterday = new Date(spTime);
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayStr = yesterday.toISOString().split("T")[0];
          
          const { data: yesterdayRecord } = await supabase
            .from("clock_records")
            .select("id")
            .eq("employee_id", schedule.employee_id)
            .eq("type", "entry")
            .gte("timestamp", `${yesterdayStr}T00:00:00`)
            .lte("timestamp", `${yesterdayStr}T23:59:59`)
            .maybeSingle();

          if (yesterdayRecord) {
            console.log(`12x36 (fallback): Employee ${schedule.employee_id} worked yesterday, skipping (rest day)`);
            continue;
          }
        }
      }

      // Calculate time BEFORE entry (tolerance BEFORE, not after)
      const [startHour, startMin] = startTime.split(":").map(Number);
      const startDate = new Date(spTime);
      startDate.setHours(startHour, startMin, 0, 0);
      
      // Alert time = scheduled time MINUS tolerance
      const alertDate = new Date(startDate.getTime() - tolerance * 60 * 1000);
      const alertTime = alertDate.toTimeString().slice(0, 5);

      // Calculate minutes from midnight for comparison
      const nowMinutes = spTime.getHours() * 60 + spTime.getMinutes();
      const alertMinutes = alertDate.getHours() * 60 + alertDate.getMinutes();
      const startMinutes = startHour * 60 + startMin;

      console.log(`Schedule: ${startTime}, type: ${scheduleType}, tolerance: ${tolerance}min, alert time: ${alertTime}, current: ${currentTime}`);
      console.log(`Time check: nowMinutes=${nowMinutes}, alertMinutes=${alertMinutes}, startMinutes=${startMinutes}`);

      // Check if we're in the alert window (from alert time up to scheduled start time)
      // This ensures we don't miss alerts if the cron job runs slightly late
      const isInAlertWindow = nowMinutes >= alertMinutes && nowMinutes < startMinutes;

      if (isInAlertWindow) {
        console.log(`Employee ${schedule.employee_id} is in alert window`);
        
        // Check if employee has already clocked in today
        const { data: clockRecord } = await supabase
          .from("clock_records")
          .select("id")
          .eq("employee_id", schedule.employee_id)
          .eq("location_id", schedule.location_id)
          .eq("type", "entry")
          .gte("timestamp", `${today}T00:00:00`)
          .lte("timestamp", `${today}T23:59:59`)
          .maybeSingle();

        if (clockRecord) {
          console.log(`Employee ${schedule.employee_id} already clocked in today, skipping`);
          continue;
        }

        // Check if we already sent an alert for this schedule today
        const { data: existingAlert } = await supabase
          .from("lateness_alerts")
          .select("id")
          .eq("employee_id", schedule.employee_id)
          .eq("location_id", schedule.location_id)
          .eq("schedule_date", today)
          .maybeSingle();

        if (existingAlert) {
          console.log(`Alert already sent for employee ${schedule.employee_id} today, skipping`);
          continue;
        }

        // Employee hasn't arrived yet and no alert sent, get their info
        const { data: profile } = await supabase
          .from("profiles")
          .select("name, phone")
          .eq("id", schedule.employees.user_id)
          .single();

        const { data: location } = await supabase
          .from("locations")
          .select("name")
          .eq("id", schedule.location_id)
          .single();

        alertsToSend.push({
          employeeId: schedule.employee_id,
          employeeName: profile?.name || "Funcionário",
          employeePhone: profile?.phone || null,
          locationId: schedule.location_id,
          locationName: location?.name || "Local",
          scheduledTime: startTime,
          toleranceMinutes: tolerance,
        });
        console.log(`Added employee ${profile?.name || schedule.employee_id} to alerts queue`);
      }
    }

    console.log(`Found ${alertsToSend.length} employees to alert`);

    if (alertsToSend.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No alerts needed" }),
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

    // Get notification recipients who receive alerts (excluding síndicos)
    const { data: recipients } = await supabase
      .from("notification_recipients")
      .select("*")
      .eq("receives_alerts", true);

    const results: Array<{ type: string; recipient: string; employee: string; success: boolean }> = [];

    // Get the app URL for the response link (use production domain)
    const appUrl = "https://toosmart.com.br";

    for (const alert of alertsToSend) {
      // Create the lateness alert record
      const { data: alertRecord, error: alertError } = await supabase
        .from("lateness_alerts")
        .insert({
          employee_id: alert.employeeId,
          location_id: alert.locationId,
          schedule_date: today,
          scheduled_time: alert.scheduledTime,
        })
        .select()
        .single();

      if (alertError) {
        console.error("Error creating alert record:", alertError);
        continue;
      }

      const responseUrl = `${appUrl}/responder/${alertRecord.id}`;

      // Send to notification recipients (admin/managers, not síndicos)
      if (recipients && recipients.length > 0) {
        const eligibleRecipients = recipients.filter((r: NotificationRecipient) => {
          // Exclude síndicos
          if (r.is_location_admin) return false;
          
          if (r.scope_type === "all") return true;
          if (r.scope_type === "location" && r.scope_id === alert.locationId) return true;
          return false;
        });

        const adminMessage = `⏰ *PONTZAP - Alerta de Entrada*\n\n` +
          `👤 *Funcionário:* ${alert.employeeName}\n` +
          `📍 *Local:* ${alert.locationName}\n` +
          `⏰ *Horário previsto:* ${alert.scheduledTime}\n\n` +
          `O funcionário está em cima da hora e ainda não chegou. Aguardando resposta dele.`;

        for (const recipient of eligibleRecipients) {
          const success = await sendZAPIMessage(recipient.whatsapp, adminMessage, zapiConfig);
          results.push({
            type: "admin_alert",
            recipient: recipient.name,
            employee: alert.employeeName,
            success,
          });
        }
      }

      // Send message directly to the employee if they have a phone number
      if (alert.employeePhone) {
        const employeeMessage = `⏰ *PONTZAP - Lembrete de Entrada*\n\n` +
          `Olá ${alert.employeeName}!\n\n` +
          `Você está em cima da hora de entrada às *${alert.scheduledTime}* em *${alert.locationName}*.\n\n` +
          `📱 *Por favor, responda clicando no link:*\n` +
          `👉 ${responseUrl}\n\n` +
          `_Informe se está a caminho ou se vai faltar._`;

        const employeeSuccess = await sendZAPIMessage(alert.employeePhone, employeeMessage, zapiConfig);
        results.push({
          type: "employee_alert",
          recipient: alert.employeeName,
          employee: alert.employeeName,
          success: employeeSuccess,
        });
        console.log(`Sent message to employee ${alert.employeeName}: ${employeeSuccess}`);
      } else {
        console.log(`Employee ${alert.employeeName} has no phone number registered`);
      }
    }

    console.log("Alert results:", results);

    return new Response(
      JSON.stringify({ success: true, alerts: results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in check-lateness function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
