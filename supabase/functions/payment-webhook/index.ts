import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

interface KiwifyWebhookPayload {
  order_id: string;
  order_status: string;
  webhook_event_type: string;
  Product: {
    product_id: string;
    product_name: string;
  };
  Customer: {
    full_name: string;
    first_name: string;
    email: string;
    mobile: string;
    CPF: string;
    street?: string;
    number?: string;
    complement?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    zipcode?: string;
  };
  Subscription?: {
    id: string;
    start_date: string;
    next_payment: string;
    status: string;
    plan: {
      id: string;
      name: string;
      frequency: string;
      qty_charges: number;
    };
  };
  Commissions: {
    charge_amount: number;
    product_base_price: number;
  };
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate webhook secret token
    const webhookSecret = Deno.env.get('PAYMENT_WEBHOOK_SECRET');
    const providedSecret = req.headers.get('x-webhook-secret') || 
                          new URL(req.url).searchParams.get('token');
    
    if (!webhookSecret || providedSecret !== webhookSecret) {
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
    const payload: KiwifyWebhookPayload = await req.json();
    console.log('Received Kiwify webhook:', { 
      order_id: payload.order_id,
      event_type: payload.webhook_event_type,
      order_status: payload.order_status,
      customer_email: payload.Customer?.email,
      product_name: payload.Product?.product_name,
      plan_name: payload.Subscription?.plan?.name
    });

    // Only process approved orders
    if (payload.webhook_event_type !== 'order_approved' || payload.order_status !== 'paid') {
      console.log('Ignoring non-approved order event:', payload.webhook_event_type);
      return new Response(
        JSON.stringify({ success: true, message: 'Evento ignorado - não é aprovação de pedido' }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Validate required fields from Kiwify payload
    const customer = payload.Customer;
    const product = payload.Product;
    
    if (!customer?.email || !customer?.CPF || !customer?.full_name) {
      console.error('Missing required customer fields');
      return new Response(
        JSON.stringify({ 
          error: 'Campos obrigatórios faltando: email, CPF, full_name' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Clean CPF (remove special characters)
    const cleanDocument = customer.CPF.replace(/[^\d]/g, '');
    
    if (cleanDocument.length < 11) {
      return new Response(
        JSON.stringify({ error: 'CPF inválido' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Determine plan from product price or name
    const productPrice = payload.Commissions?.product_base_price || 0;
    const planName = payload.Subscription?.plan?.name || product.product_name || 'Plano Essencial';
    const subscriptionId = payload.Subscription?.id;
    const subscriptionStartDate = payload.Subscription?.start_date;
    const subscriptionNextPayment = payload.Subscription?.next_payment;
    
    // Determine plan limits based on price
    let planType = 'essencial';
    let maxEmployees = 10;
    let maxLocations = 5;
    
    // R$ 297 = Empresarial (40 funcionários, 20 locais)
    // R$ 197 = Profissional (20 funcionários, 10 locais)
    // R$ 97 = Essencial (10 funcionários, 5 locais)
    if (productPrice >= 29700 || planName.toLowerCase().includes('empresarial')) {
      planType = 'empresarial';
      maxEmployees = 40;
      maxLocations = 20;
    } else if (productPrice >= 19700 || planName.toLowerCase().includes('profissional')) {
      planType = 'profissional';
      maxEmployees = 20;
      maxLocations = 10;
    }
    
    console.log('Plan determined:', { planType, maxEmployees, maxLocations, productPrice, planName });

    // Check if user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === customer.email);

    let userId: string;

    if (existingUser) {
      console.log('User already exists, updating password');
      userId = existingUser.id;
      
      // Update password
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: cleanDocument,
      });
    } else {
      // Create new user
      console.log('Creating new user');
      const { data: newUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
        email: customer.email,
        password: cleanDocument,
        email_confirm: true,
        user_metadata: {
          name: customer.full_name,
        },
      });

      if (createUserError) {
        console.error('Error creating user:', createUserError);
        return new Response(
          JSON.stringify({ error: 'Erro ao criar usuário: ' + createUserError.message }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      userId = newUser.user.id;
    }

    // Create company name from customer name
    const companyName = `Empresa de ${customer.first_name || customer.full_name.split(' ')[0]}`;

    // Create or update company
    let companyId: string;
    
    const { data: existingCompany } = await supabaseAdmin
      .from('companies')
      .select('id')
      .eq('email', customer.email)
      .maybeSingle();

    if (existingCompany) {
      companyId = existingCompany.id;
      
      // Update company
      await supabaseAdmin
        .from('companies')
        .update({
          name: companyName,
          phone: customer.mobile || null,
          status: 'active',
          payment_status: 'paid',
          admin_user_id: userId,
          subscription_start_date: subscriptionStartDate || new Date().toISOString(),
          subscription_end_date: subscriptionNextPayment || null,
          plan: planType,
          max_employees: maxEmployees,
          max_locations: maxLocations,
        })
        .eq('id', companyId);
    } else {
      // Create new company
      const { data: newCompany, error: companyError } = await supabaseAdmin
        .from('companies')
        .insert({
          name: companyName,
          email: customer.email,
          phone: customer.mobile || null,
          status: 'active',
          payment_status: 'paid',
          admin_user_id: userId,
          subscription_start_date: subscriptionStartDate || new Date().toISOString(),
          subscription_end_date: subscriptionNextPayment || null,
          plan: planType,
          max_employees: maxEmployees,
          max_locations: maxLocations,
        })
        .select('id')
        .single();

      if (companyError) {
        console.error('Error creating company:', companyError);
        return new Response(
          JSON.stringify({ error: 'Erro ao criar empresa: ' + companyError.message }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      companyId = newCompany.id;
    }

    // Set user role as admin
    const { data: existingRole } = await supabaseAdmin
      .from('user_roles')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (existingRole) {
      await supabaseAdmin
        .from('user_roles')
        .update({ role: 'admin' })
        .eq('user_id', userId);
    } else {
      await supabaseAdmin
        .from('user_roles')
        .insert({ user_id: userId, role: 'admin' });
    }

    // Create or update employee record
    const { data: existingEmployee } = await supabaseAdmin
      .from('employees')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (existingEmployee) {
      await supabaseAdmin
        .from('employees')
        .update({
          company_id: companyId,
          is_active: true,
          invitation_accepted: true,
        })
        .eq('id', existingEmployee.id);
    } else {
      await supabaseAdmin
        .from('employees')
        .insert({
          user_id: userId,
          company_id: companyId,
          type: 'fixed',
          is_active: true,
          invitation_accepted: true,
        });
    }

    // Update profile
    await supabaseAdmin
      .from('profiles')
      .update({
        name: customer.full_name,
      phone: customer.mobile || null,
      })
      .eq('id', userId);

    console.log('User created/updated successfully:', {
      userId,
      companyId,
      email: customer.email,
      planName,
      subscriptionId
    });

    // Send welcome email with credentials
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const appUrl = Deno.env.get('SUPABASE_URL')?.replace('.supabase.co', '').replace('https://', '') || 'pontzap.lovable.app';
    
    if (resendApiKey) {
      try {
        const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #0d9488 0%, #14b8a6 100%); padding: 40px 30px; text-align: center;">
              <h1 style="color: #ffffff; font-size: 28px; margin: 0; font-weight: bold;">🎉 Bem-vindo ao PontZap!</h1>
              <p style="color: rgba(255,255,255,0.9); font-size: 16px; margin: 10px 0 0 0;">Seu sistema de ponto eletrônico está pronto</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Olá <strong>${customer.first_name || customer.full_name.split(' ')[0]}</strong>,
              </p>
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Sua assinatura do plano <strong style="color: #0d9488;">${planName}</strong> foi confirmada! 
                Agora você pode começar a usar o PontZap para gerenciar o ponto dos seus funcionários.
              </p>
              
              <!-- Credentials Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f0fdfa; border: 2px solid #0d9488; border-radius: 8px; margin: 30px 0;">
                <tr>
                  <td style="padding: 25px;">
                    <h3 style="color: #0d9488; font-size: 18px; margin: 0 0 15px 0;">🔐 Suas Credenciais de Acesso</h3>
                    <p style="color: #374151; font-size: 14px; margin: 0 0 10px 0;">
                      <strong>Email:</strong> ${customer.email}
                    </p>
                    <p style="color: #374151; font-size: 14px; margin: 0 0 10px 0;">
                      <strong>Senha temporária:</strong> ${cleanDocument}
                    </p>
                    <p style="color: #6b7280; font-size: 12px; margin: 15px 0 0 0; font-style: italic;">
                      ⚠️ Recomendamos alterar sua senha após o primeiro acesso.
                    </p>
                  </td>
                </tr>
              </table>
              
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <a href="https://pontzap.lovable.app/auth" 
                       style="display: inline-block; background: linear-gradient(135deg, #0d9488 0%, #14b8a6 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 16px; font-weight: bold; box-shadow: 0 4px 12px rgba(13, 148, 136, 0.3);">
                      Acessar PontZap →
                    </a>
                  </td>
                </tr>
              </table>
              
              <!-- Plan Info -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 8px; margin: 20px 0;">
                <tr>
                  <td style="padding: 20px;">
                    <h4 style="color: #374151; font-size: 14px; margin: 0 0 10px 0;">📋 Detalhes do seu plano:</h4>
                    <p style="color: #6b7280; font-size: 13px; margin: 0; line-height: 1.8;">
                      ✅ Até <strong>${maxEmployees} funcionários</strong><br>
                      ✅ Até <strong>${maxLocations} locais</strong><br>
                      ✅ Relatórios completos<br>
                      ✅ Notificações WhatsApp<br>
                      ✅ Suporte prioritário
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 25px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="color: #6b7280; font-size: 12px; margin: 0 0 10px 0;">
                Precisa de ajuda? Entre em contato conosco!
              </p>
              <p style="color: #9ca3af; font-size: 11px; margin: 0;">
                © ${new Date().getFullYear()} PontZap - Sistema de Ponto Eletrônico
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        `;

        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'PontZap <onboarding@resend.dev>',
            to: [customer.email],
            subject: '🎉 Bem-vindo ao PontZap! Suas credenciais de acesso',
            html: emailHtml,
          }),
        });

        if (emailResponse.ok) {
          console.log('Welcome email sent successfully to:', customer.email);
        } else {
          const emailError = await emailResponse.text();
          console.error('Error sending welcome email:', emailError);
        }
      } catch (emailError) {
        console.error('Error sending welcome email:', emailError);
        // Don't fail the webhook if email fails
      }
    } else {
      console.log('RESEND_API_KEY not configured, skipping welcome email');
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Usuário criado com sucesso',
        user_id: userId,
        company_id: companyId,
        email: customer.email,
        plan: planName,
        subscription_id: subscriptionId,
        temporary_password: 'CPF do cliente (apenas números)',
        email_sent: !!resendApiKey,
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
