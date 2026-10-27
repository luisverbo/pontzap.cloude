// Webhook da API oficial do WhatsApp (Meta Cloud API).
//
// Configure no painel de desenvolvedor da Meta:
//   URL de callback: https://<projeto>.supabase.co/functions/v1/whatsapp-meta
//   Token de verificação: o que aparece no Painel Master do PONTZAP
//   Campos: messages, message_template_status_update, template_category_update
//
// O que ele faz:
//  1. Registra a hora da última mensagem recebida de cada número → abre a
//     janela de 24 h em que mandamos texto livre de graça.
//  2. Trata os cliques nos botões dos templates:
//       ack                         → só abre a janela (nada a responder)
//       detail:<id>                 → manda o texto completo guardado
//       late:<alertId>:<resposta>   → registra a resposta ao alerta de atraso
//       paid:<pedidoId>:<status>    → funcionário confirma se o vale caiu
//  3. Atualiza o status de aprovação dos templates (aprovado/rejeitado).
//
// Responde 200 sempre — senão a Meta reenvia em loop.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveWhatsAppConfig, sendNotification, sendWhatsAppMessage } from "../_shared/whatsapp.ts";

const ok = () => new Response("ok", { status: 200 });

const LATE_LABELS: Record<string, string> = {
  on_way: "Estou a caminho",
  will_be_late: "Vou me atrasar",
  absent: "Vou faltar",
};

const lastDigits = (phone: string | null | undefined, n = 8) => (phone || "").replace(/\D/g, "").slice(-n);

const money = (v: number) =>
  `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Comparação em tempo constante para a assinatura. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

serve(async (req: Request): Promise<Response> => {
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: cfgRow } = await db
    .from("evolution_config")
    .select("*")
    .limit(1)
    .maybeSingle();

  // ---- Verificação do webhook (a Meta chama uma vez, ao salvar a URL) ----
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge") ?? "";
    if (mode === "subscribe" && token && cfgRow?.meta_verify_token && token === cfgRow.meta_verify_token) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  }

  if (req.method !== "POST") return ok();

  const raw = await req.text();

  // ---- Assinatura: garante que quem chamou foi mesmo a Meta ----
  if (cfgRow?.meta_app_secret) {
    const header = req.headers.get("x-hub-signature-256") || "";
    const expected = `sha256=${await hmacHex(String(cfgRow.meta_app_secret), raw)}`;
    if (!safeEqual(header, expected)) {
      console.warn("whatsapp-meta: assinatura inválida — ignorado");
      return new Response("invalid signature", { status: 401 });
    }
  }

  let payload: any;
  try { payload = JSON.parse(raw); } catch { return ok(); }

  const config = await resolveWhatsAppConfig(db);

  const reply = async (to: string, text: string) => {
    if (config) await sendWhatsAppMessage(to, text, config);
  };

  try {
    for (const entry of payload?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        const field = change?.field;
        const value = change?.value ?? {};

        // ---------- Status de template ----------
        if (field === "message_template_status_update") {
          if (value.message_template_name) {
            await db.from("whatsapp_templates").upsert({
              name: value.message_template_name,
              status: value.event ?? null,
              rejected_reason: value.reason && value.reason !== "NONE" ? value.reason : null,
              meta_id: value.message_template_id ? String(value.message_template_id) : undefined,
              updated_at: new Date().toISOString(),
            }, { onConflict: "name" });
          }
          continue;
        }

        if (field === "template_category_update") {
          if (value.message_template_name) {
            await db.from("whatsapp_templates")
              .update({ category: value.new_category ?? null, updated_at: new Date().toISOString() })
              .eq("name", value.message_template_name);
          }
          continue;
        }

        if (field !== "messages") continue;

        for (const st of value.statuses ?? []) {
          if (st.status === "failed") {
            console.error("WhatsApp não entregou:", st.recipient_id, JSON.stringify(st.errors ?? []));
          }
        }

        const profileName = value.contacts?.[0]?.profile?.name ?? null;

        for (const msg of value.messages ?? []) {
          const from = String(msg.from || "").replace(/\D/g, "");
          if (!from) continue;

          // Abre/renova a janela de 24 h deste número.
          await db.from("whatsapp_contacts").upsert({
            phone: from,
            profile_name: profileName,
            last_inbound_at: new Date(Number(msg.timestamp) * 1000 || Date.now()).toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: "phone" });

          const buttonPayload: string | null =
            msg.type === "button" ? msg.button?.payload ?? null
            : msg.type === "interactive" ? msg.interactive?.button_reply?.id ?? null
            : null;

          if (!buttonPayload || buttonPayload === "ack") continue;

          // ---------- Ver detalhes ----------
          if (buttonPayload.startsWith("detail:")) {
            const id = buttonPayload.slice("detail:".length);
            const { data: det } = await db
              .from("whatsapp_details")
              .select("id, phone, body")
              .eq("id", id)
              .maybeSingle();
            // Só entrega para o mesmo número que recebeu o aviso.
            if (det && lastDigits(det.phone) === lastDigits(from)) {
              await reply(from, det.body);
              await db.from("whatsapp_details").update({ delivered_at: new Date().toISOString() }).eq("id", id);
            } else {
              await reply(from, "Esses detalhes não estão mais disponíveis. Consulte o painel do PONTZAP.");
            }
            continue;
          }

          // ---------- Resposta ao alerta de atraso ----------
          if (buttonPayload.startsWith("late:")) {
            const [, alertId, responseType] = buttonPayload.split(":");
            const { data: alert } = await db
              .from("lateness_alerts")
              .select("id, response_type, employees(user_id)")
              .eq("id", alertId)
              .maybeSingle();
            if (!alert) { await reply(from, "Não encontrei este alerta."); continue; }

            const { data: prof } = await db
              .from("profiles")
              .select("phone")
              .eq("id", (alert as any).employees?.user_id)
              .maybeSingle();
            if (lastDigits(prof?.phone) !== lastDigits(from)) {
              console.warn("late: telefone não confere com o funcionário do alerta");
              continue;
            }
            if (alert.response_type) {
              await reply(from, "Você já respondeu este alerta. ✅");
              continue;
            }

            const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/respond-lateness`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              },
              body: JSON.stringify({ alertId, responseType }),
            });
            await reply(
              from,
              res.ok
                ? `Obrigado! Sua resposta *${LATE_LABELS[responseType] ?? responseType}* foi enviada para a empresa. ✅`
                : "Não consegui registrar sua resposta agora. Avise a empresa por aqui mesmo.",
            );
            continue;
          }

          // ---------- Funcionário confirma se o vale caiu ----------
          if (buttonPayload.startsWith("paid:")) {
            const [, requestId, receipt] = buttonPayload.split(":");
            if (receipt !== "received" && receipt !== "not_received") continue;

            const { data: request } = await db
              .from("advance_requests")
              .select("id, company_id, employee_id, kind, amount, approved_amount, pix_key, employee_receipt")
              .eq("id", requestId)
              .maybeSingle();
            if (!request) continue;

            const { data: emp } = await db
              .from("employees")
              .select("user_id")
              .eq("id", request.employee_id)
              .maybeSingle();
            const { data: prof } = emp?.user_id
              ? await db.from("profiles").select("name, phone").eq("id", emp.user_id).maybeSingle()
              : { data: null };
            if (lastDigits(prof?.phone) !== lastDigits(from)) {
              console.warn("paid: telefone não confere com o funcionário do pedido");
              continue;
            }

            await db.from("advance_requests").update({
              employee_receipt: receipt,
              employee_receipt_at: new Date().toISOString(),
            }).eq("id", requestId);

            if (receipt === "received") {
              await reply(from, "Obrigado pela confirmação! Registramos que você recebeu o pagamento. ✅");
              continue;
            }

            await reply(from, "Entendido. Avisamos a empresa que o valor não caiu — ela vai conferir o comprovante.");

            // Avisa a empresa
            const [{ data: advCfg }, { data: company }] = await Promise.all([
              db.from("advance_config").select("notify_whatsapp").eq("company_id", request.company_id).maybeSingle(),
              db.from("companies").select("phone").eq("id", request.company_id).maybeSingle(),
            ]);
            const to = advCfg?.notify_whatsapp?.trim() || company?.phone?.trim();
            if (to && config) {
              const kind = request.kind === "adiantamento" ? "adiantamento" : "vale";
              const value = money(Number(request.approved_amount ?? request.amount));
              const name = prof?.name || "O funcionário";
              await sendNotification(db, config, to,
                `⚠️ *PONTZAP — Pagamento não recebido*\n\n` +
                `👤 ${name} informou que *não recebeu* o ${kind} de ${value}.\n` +
                `🔑 Chave Pix usada: ${request.pix_key || "-"}\n\n` +
                `Confira o comprovante da transferência no seu banco.`,
                { template: "vale_nao_recebido", params: [name, value, kind, request.pix_key || "-"], buttons: ["ack"] },
              );
            }
            continue;
          }
        }
      }
    }
  } catch (e) {
    console.error("whatsapp-meta error:", e);
  }

  return ok();
});
