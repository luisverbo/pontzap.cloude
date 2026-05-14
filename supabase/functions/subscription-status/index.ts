import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

interface KiwifySubscriptionWebhook {
  order_id: string;
  order_status: string;
  webhook_event_type: string;
  Customer: {
    email: string;
    CPF: string;
    full_name: string;
  };
  Subscription?: {
    id: string;
    status: string;
    next_payment?: string;
  };
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate webhook secret token
    const webhookSecret = '47hpf4d49yi';
    const headerSecret = req.headers.get('x-webhook-secret');
    const querySecret = new URL(req.url).searchParams.get('token');
    const providedSecret = headerSecret || querySecret;
    
    if (providedSecret !== webhookSecret) {
      console.error('Invalid or missing webhook secret');
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid webhook secret' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Initialize Supabase admin client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Parse request body
    const payload: KiwifySubscriptionWebhook = await req.json();
    console.log('Received subscription status webhook:', { 
      order_id: payload.order_id,
      event_type: payload.webhook_event_type,
      order_status: payload.order_status,
      customer_email: payload.Customer?.email,
      subscription_status: payload.Subscription?.status
    });

    const eventType = payload.webhook_event_type;
    const customerEmail = payload.Customer?.email;

    if (!customerEmail) {
      console.error('Missing customer email');
      return new Response(
        JSON.stringify({ error: 'Email do cliente não encontrado' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Find company by email
    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .select('id, name, status, payment_status')
      .eq('email', customerEmail)
      .maybeSingle();

    if (companyError || !company) {
      console.error('Company not found for email:', customerEmail);
      return new Response(
        JSON.stringify({ error: 'Empresa não encontrada para este email' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    let newStatus: string;
    let newPaymentStatus: string;
    let message: string;

    // Handle different subscription events
    switch (eventType) {
      case 'subscription_canceled':
      case 'order_refunded':
        // Subscription cancelled - block access
        newStatus = 'cancelled';
        newPaymentStatus = 'cancelled';
        message = 'Assinatura cancelada - acesso bloqueado';
        break;

      case 'subscription_late':
      case 'order_waiting_payment':
      case 'chargeback':
        // Payment overdue - block access
        newStatus = 'pending';
        newPaymentStatus = 'overdue';
        message = 'Pagamento atrasado - acesso bloqueado';
        break;

      case 'subscription_renewed':
      case 'order_approved':
        // Payment confirmed - reactivate access
        newStatus = 'active';
        newPaymentStatus = 'paid';
        message = 'Pagamento confirmado - acesso reativado';
        break;

      default:
        console.log('Ignoring event type:', eventType);
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: `Evento ${eventType} ignorado` 
          }),
          { 
            status: 200, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
    }

    // Update company status
    const updateData: Record<string, unknown> = {
      status: newStatus,
      payment_status: newPaymentStatus,
      updated_at: new Date().toISOString(),
    };

    // Update subscription end date if available
    if (payload.Subscription?.next_payment) {
      updateData.subscription_end_date = payload.Subscription.next_payment;
    }

    const { error: updateError } = await supabaseAdmin
      .from('companies')
      .update(updateData)
      .eq('id', company.id);

    if (updateError) {
      console.error('Error updating company status:', updateError);
      return new Response(
        JSON.stringify({ error: 'Erro ao atualizar status: ' + updateError.message }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('Company status updated:', {
      companyId: company.id,
      companyName: company.name,
      previousStatus: company.status,
      previousPaymentStatus: company.payment_status,
      newStatus,
      newPaymentStatus,
      eventType
    });

    return new Response(
      JSON.stringify({
        success: true,
        message,
        company_id: company.id,
        company_name: company.name,
        status: newStatus,
        payment_status: newPaymentStatus,
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(
      JSON.stringify({ error: 'Erro interno: ' + (error as Error).message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
