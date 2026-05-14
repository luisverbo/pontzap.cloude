import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WelcomeEmailRequest {
  companyName: string;
  email: string;
  phone?: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { companyName, email, phone }: WelcomeEmailRequest = await req.json();

    if (!companyName || !email) {
      return new Response(
        JSON.stringify({ error: "Nome da empresa e email são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Sending welcome email to ${email} for company ${companyName}`);

    const loginUrl = "https://toosmart.com.br/auth";

    const emailResponse = await fetch("https://api.resend.com/emails", {
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
                Sua empresa foi cadastrada com sucesso no PONTZAP! Agora você pode gerenciar o controle de ponto dos seus funcionários de forma simples e eficiente.
              </p>
              
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

    const result = await emailResponse.json();
    console.log("Email sent successfully:", result);

    if (!emailResponse.ok) {
      throw new Error(result.message || "Failed to send email");
    }

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in send-company-welcome function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
