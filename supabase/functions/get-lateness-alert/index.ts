import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// HMAC signature validation for secure public links
const validateSignature = async (alertId: string, signature: string): Promise<boolean> => {
  const secret = Deno.env.get("ALERT_SIGNING_SECRET");
  if (!secret) {
    console.warn("ALERT_SIGNING_SECRET not configured - allowing access for backward compatibility");
    return true; // Allow if secret not configured (backward compatibility)
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
    const url = new URL(req.url);
    const alertId = url.searchParams.get("alertId");
    const signature = url.searchParams.get("sig");

    if (!alertId) {
      return new Response(
        JSON.stringify({ error: "ID do alerta não fornecido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate UUID format to prevent injection
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(alertId)) {
      return new Response(
        JSON.stringify({ error: "ID do alerta inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate HMAC signature if provided
    if (signature) {
      const isValid = await validateSignature(alertId, signature);
      if (!isValid) {
        return new Response(
          JSON.stringify({ error: "Link inválido ou expirado" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch the alert with employee and location info
    const { data: alert, error: alertError } = await supabase
      .from("lateness_alerts")
      .select(`
        id,
        schedule_date,
        scheduled_time,
        response_type,
        response_at,
        employee_id,
        location_id
      `)
      .eq("id", alertId)
      .maybeSingle();

    if (alertError) {
      console.error("Error fetching alert:", alertError);
      throw new Error("Erro ao buscar alerta");
    }

    if (!alert) {
      return new Response(
        JSON.stringify({ error: "Alerta não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get employee name
    const { data: employee } = await supabase
      .from("employees")
      .select("user_id")
      .eq("id", alert.employee_id)
      .single();

    let employeeName = "Funcionário";
    if (employee?.user_id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", employee.user_id)
        .single();
      
      if (profile?.name) {
        employeeName = profile.name;
      }
    }

    // Get location name
    const { data: location } = await supabase
      .from("locations")
      .select("name")
      .eq("id", alert.location_id)
      .single();

    const response = {
      id: alert.id,
      employeeName,
      locationName: location?.name || "Local",
      scheduledTime: alert.scheduled_time,
      scheduleDate: alert.schedule_date,
      alreadyResponded: !!alert.response_type,
      responseType: alert.response_type,
    };

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in get-lateness-alert:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);