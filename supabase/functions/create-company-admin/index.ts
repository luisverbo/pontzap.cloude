import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateCompanyAdminRequest {
  companyId: string;
  companyName: string;
  email: string;
  phone?: string;
}

// Generate a random password
function generateRandomPassword(length: number = 10): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // This function creates an admin for ANY company, so it must be locked to MASTER users only.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: requestingUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !requestingUser) {
      return new Response(
        JSON.stringify({ error: "Token inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: masterData } = await supabaseAdmin
      .from("master_users")
      .select("id")
      .eq("user_id", requestingUser.id)
      .maybeSingle();

    if (!masterData) {
      return new Response(
        JSON.stringify({ error: "Apenas usuários master podem criar administradores de empresa" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { companyId, companyName, email, phone }: CreateCompanyAdminRequest = await req.json();

    if (!companyId || !companyName || !email) {
      return new Response(
        JSON.stringify({ error: "companyId, companyName e email são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Creating admin user for company ${companyName} (${companyId}) with email ${email}`);

    // Generate a random password
    const password = generateRandomPassword(10);

    // Check if user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === email);

    let userId: string;

    if (existingUser) {
      console.log(`User ${email} already exists, updating password`);
      userId = existingUser.id;
      
      // Update password
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
      });

      if (updateError) {
        throw new Error(`Erro ao atualizar usuário: ${updateError.message}`);
      }
    } else {
      // Create new user
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name: companyName },
      });

      if (createError) {
        throw new Error(`Erro ao criar usuário: ${createError.message}`);
      }

      userId = newUser.user.id;
      console.log(`Created new user with ID: ${userId}`);
    }

    // Update user role to admin
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

    // Create employee record for the admin
    const { data: existingEmployee } = await supabaseAdmin
      .from('employees')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (!existingEmployee) {
      await supabaseAdmin
        .from('employees')
        .insert({
          user_id: userId,
          company_id: companyId,
          type: 'fixed',
          is_active: true,
          invitation_accepted: true,
        });
    } else {
      await supabaseAdmin
        .from('employees')
        .update({ company_id: companyId })
        .eq('id', existingEmployee.id);
    }

    // Update company with admin_user_id
    await supabaseAdmin
      .from('companies')
      .update({ admin_user_id: userId })
      .eq('id', companyId);

    // Update profile with phone if provided
    if (phone) {
      await supabaseAdmin
        .from('profiles')
        .update({ phone })
        .eq('id', userId);
    }

    console.log(`Admin user configured successfully for company ${companyName}`);

    // Send welcome email with password
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (RESEND_API_KEY) {
      const loginUrl = "https://toosmart.com.br/auth";
      
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "PONTZAP <onboarding@resend.dev>",
          to: [email],
          subject: `Bem-vindo ao PONTZAP - ${companyName}`,
          html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin: 0; padding: 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8f9fb;">
            <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
              <div style="background: linear-gradient(135deg, #0891b2 0%, #06b6d4 100%); border-radius: 16px 16px 0 0; padding: 40px 30px; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">🕐 PONTZAP</h1>
                <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0; font-size: 14px;">Sistema de Controle de Ponto</p>
              </div>
              
              <div style="background: #ffffff; padding: 40px 30px; border-radius: 0 0 16px 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
                <h2 style="color: #1e293b; margin: 0 0 20px; font-size: 22px;">Olá, ${companyName}! 👋</h2>
                
                <p style="color: #64748b; line-height: 1.7; margin: 0 0 20px;">
                  Sua empresa foi cadastrada com sucesso no PONTZAP! Abaixo estão seus dados de acesso:
                </p>
                
                <div style="background: #f1f5f9; border-radius: 12px; padding: 20px; margin: 25px 0;">
                  <h3 style="color: #1e293b; margin: 0 0 15px; font-size: 16px;">🔐 Dados de Acesso:</h3>
                  <p style="color: #1e293b; margin: 5px 0;"><strong>Email:</strong> ${email}</p>
                  <p style="color: #1e293b; margin: 5px 0;"><strong>Senha:</strong> ${password}</p>
                  <p style="color: #dc2626; font-size: 13px; margin-top: 15px;">
                    ⚠️ Recomendamos que você altere sua senha após o primeiro login.
                  </p>
                </div>
                
                <div style="background: #f1f5f9; border-radius: 12px; padding: 20px; margin: 25px 0;">
                  <h3 style="color: #1e293b; margin: 0 0 15px; font-size: 16px;">✨ Próximos passos:</h3>
                  <ul style="color: #64748b; margin: 0; padding-left: 20px; line-height: 1.8;">
                    <li>Acesse o sistema com o link abaixo</li>
                    <li>Cadastre seus locais de trabalho</li>
                    <li>Adicione seus funcionários</li>
                    <li>Configure as escalas de trabalho</li>
                  </ul>
                </div>
                
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${loginUrl}" style="display: inline-block; background: linear-gradient(135deg, #0891b2 0%, #06b6d4 100%); color: #ffffff; text-decoration: none; padding: 14px 35px; border-radius: 10px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 15px rgba(8, 145, 178, 0.3);">
                    Acessar o Sistema
                  </a>
                </div>
                
                <div style="border-top: 1px solid #e2e8f0; margin-top: 30px; padding-top: 20px;">
                  <p style="color: #94a3b8; font-size: 13px; margin: 0; text-align: center;">
                    Este email foi enviado automaticamente pelo sistema PONTZAP.<br>
                    Em caso de dúvidas, entre em contato com nosso suporte.
                  </p>
                </div>
              </div>
            </div>
          </body>
          </html>
        `,
        }),
      });

      console.log(`Welcome email sent to ${email}`);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        userId,
        message: "Administrador criado e email enviado com sucesso" 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in create-company-admin function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);