// Avisa no WhatsApp sobre um pedido de vale/adiantamento.
//
//   requested → vai para o WhatsApp que a empresa determinou (advance_config
//               .notify_whatsapp; se vazio, o telefone da empresa)
//   approved / rejected / paid → vai para o funcionário
//
// O número de destino NUNCA vem do corpo da requisição: é sempre resolvido no
// servidor a partir da configuração da empresa, para que ninguém possa usar a
// função como disparador de mensagens.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveWhatsAppConfig, sendNotification, type TemplateSpec } from "../_shared/whatsapp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type NotificationType = "requested" | "approved" | "rejected" | "paid";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const money = (value: number): string =>
  `R$ ${Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const dateTime = (iso: string): string =>
  new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const PIX_TYPE_LABELS: Record<string, string> = {
  cpf: "CPF",
  cnpj: "CNPJ",
  phone: "Telefone",
  email: "E-mail",
  random: "Aleatória",
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autorizado (sem sessão)" }, 401);

    const { data: { user }, error: authError } = await admin.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authError || !user) return json({ error: "Sessão inválida" }, 401);

    const { requestId, notificationType }: {
      requestId?: string;
      notificationType?: NotificationType;
    } = await req.json();

    if (!requestId || !notificationType) {
      return json({ error: "requestId e notificationType são obrigatórios" }, 400);
    }

    const { data: request } = await admin
      .from("advance_requests")
      .select("*")
      .eq("id", requestId)
      .maybeSingle();

    if (!request) return json({ error: "Pedido não encontrado" }, 404);

    // --- Autorização: ou é o dono do pedido, ou manda na empresa dele ---
    const { data: employee } = await admin
      .from("employees")
      .select("user_id, company_id")
      .eq("id", request.employee_id)
      .maybeSingle();

    const isOwner = employee?.user_id === user.id;

    const { data: master } = await admin
      .from("master_users")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    let managesCompany = !!master;
    if (!managesCompany) {
      const { data: company } = await admin
        .from("companies")
        .select("id")
        .eq("id", request.company_id)
        .eq("admin_user_id", user.id)
        .maybeSingle();
      managesCompany = !!company;

      if (!managesCompany) {
        const { data: self } = await admin
          .from("employees")
          .select("company_id")
          .eq("user_id", user.id)
          .maybeSingle();
        const { data: role } = await admin
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .in("role", ["admin", "manager"])
          .maybeSingle();
        managesCompany = !!role && self?.company_id === request.company_id;
      }
    }

    if (!isOwner && !managesCompany) return json({ error: "Sem permissão" }, 403);
    // O aviso ao funcionário só parte de quem decidiu o pedido.
    if (notificationType !== "requested" && !managesCompany) {
      return json({ error: "Sem permissão" }, 403);
    }

    // --- Nome do funcionário e telefone dele ---
    const { data: profile } = employee?.user_id
      ? await admin.from("profiles").select("name, phone").eq("id", employee.user_id).maybeSingle()
      : { data: null };
    const employeeName = profile?.name || "Funcionário";

    // --- Destino ---
    const { data: config } = await admin
      .from("advance_config")
      .select("notify_whatsapp")
      .eq("company_id", request.company_id)
      .maybeSingle();

    const { data: company } = await admin
      .from("companies")
      .select("name, phone")
      .eq("id", request.company_id)
      .maybeSingle();

    const kindLabel = request.kind === "adiantamento" ? "Adiantamento" : "Vale";
    const amount = money(Number(request.approved_amount ?? request.amount));

    let to: string | null = null;
    let message = "";
    let spec: TemplateSpec;
    const kindLower = kindLabel.toLowerCase();

    if (notificationType === "requested") {
      to = config?.notify_whatsapp?.trim() || company?.phone?.trim() || null;

      const pixType = request.pix_key_type ? PIX_TYPE_LABELS[request.pix_key_type] ?? request.pix_key_type : null;
      const lines = [
        `💰 *PONTZAP — Pedido de ${kindLabel}*`,
        ``,
        `👤 *Funcionário:* ${employeeName}`,
        `💵 *Valor:* ${money(Number(request.amount))}`,
      ];
      if (Number(request.installments) > 1) {
        lines.push(`🧾 *Parcelas:* ${request.installments}x`);
      }
      if (request.reason) lines.push(`📝 *Motivo:* ${request.reason}`);
      lines.push(`🕐 *Pedido em:* ${dateTime(request.created_at)}`);
      lines.push(``);
      if (request.pix_key) {
        lines.push(`🔑 *Chave PIX${pixType ? ` (${pixType})` : ""}:*`);
        lines.push(request.pix_key);
        if (request.pix_key_owner_name) lines.push(`_Titular: ${request.pix_key_owner_name}_`);
        lines.push(``);
        lines.push(`⚠️ _Esta é a chave que o funcionário confirmou AGORA, no momento do pedido._`);
      } else {
        lines.push(`⚠️ *Sem chave PIX cadastrada.*`);
      }
      lines.push(``);
      lines.push(`Acesse o PONTZAP para aprovar ou recusar.`);
      message = lines.join("\n");
      spec = {
        template: "vale_solicitado",
        params: [
          kindLower,
          employeeName,
          money(Number(request.amount)),
          dateTime(request.created_at),
          request.pix_key ? `${request.pix_key}${pixType ? ` (${pixType})` : ""}` : "nenhuma chave cadastrada",
        ],
        // O detalhe completo (motivo, titular, parcelas) vai no botão.
        buttons: ["@details"],
      };
    } else {
      to = profile?.phone?.trim() || null;
      const companyName = company?.name || "a empresa";

      if (notificationType === "approved") {
        message = [
          `✅ *PONTZAP — ${kindLabel} aprovado*`,
          ``,
          `Seu pedido foi aprovado por ${companyName}.`,
          `💵 *Valor liberado:* ${amount}`,
          request.review_note ? `\n📝 *Observação:* ${request.review_note}` : "",
          ``,
          `Aguarde o pagamento na chave PIX cadastrada.`,
        ].filter(Boolean).join("\n");
        spec = { template: "vale_aprovado", params: [kindLower, companyName, amount] };
      } else if (notificationType === "rejected") {
        message = [
          `❌ *PONTZAP — ${kindLabel} recusado*`,
          ``,
          `Seu pedido de ${money(Number(request.amount))} não foi aprovado.`,
          request.review_note ? `\n📝 *Motivo:* ${request.review_note}` : "",
        ].filter(Boolean).join("\n");
        spec = {
          template: "vale_recusado",
          params: [kindLower, money(Number(request.amount)), request.review_note || "não informado"],
        };
      } else {
        message = [
          `💸 *PONTZAP — ${kindLabel} pago*`,
          ``,
          `${companyName} registrou o pagamento de ${amount}.`,
          request.pix_key ? `🔑 *Chave usada:* ${request.pix_key}` : "",
          ``,
          `Confira sua conta. Se a chave acima não for mais a sua, atualize no app imediatamente.`,
        ].filter(Boolean).join("\n");
        spec = {
          template: "vale_pago",
          params: [companyName, amount, kindLower, request.pix_key || "cadastrada no aplicativo"],
          buttons: [`paid:${request.id}:received`, `paid:${request.id}:not_received`],
        };
      }
    }

    if (!to) {
      const reason = notificationType === "requested"
        ? "Nenhum WhatsApp configurado para receber os pedidos"
        : "O funcionário não tem WhatsApp cadastrado";
      console.warn(reason);
      return json({ success: false, sent: false, reason });
    }

    const waConfig = await resolveWhatsAppConfig(admin);
    if (!waConfig) {
      return json({ success: false, sent: false, reason: "WhatsApp não configurado" });
    }

    const sent = await sendNotification(admin, waConfig, to, message, spec!);

    if (sent && notificationType === "requested") {
      await admin
        .from("advance_requests")
        .update({ notified_at: new Date().toISOString() })
        .eq("id", requestId);
    }

    return json({ success: true, sent });
  } catch (error: any) {
    console.error("Erro em advance-notify:", error);
    return json({ error: error?.message || "Erro desconhecido" }, 500);
  }
});
