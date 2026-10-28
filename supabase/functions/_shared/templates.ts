// Templates do WhatsApp oficial (Meta Cloud API) — FONTE ÚNICA.
//
// A mesma definição é usada para CRIAR o template na Meta (whatsapp-templates)
// e para ENVIAR (sendNotification). Mudou um texto aqui? Rode "Criar/atualizar
// templates" no Painel Master — template já aprovado não é editado (a Meta
// exige nome novo), então altere o sufixo da versão no nome.
//
// Regras para a Meta classificar como UTILIDADE (e não marketing):
//  - mensagem ligada a um evento concreto (ponto, alerta, pedido, troca);
//  - nada de promoção, oferta, convite para comprar ou "conheça";
//  - o corpo não começa nem termina com variável;
//  - texto fixo suficiente em volta das variáveis.
//
// Botões são respostas rápidas (máx. 3, até 25 caracteres). O clique abre a
// janela de 24 h: a partir dali o sistema manda texto livre de graça.

export interface TemplateDef {
  name: string;
  /** Para que serve — aparece no Painel Master. */
  purpose: string;
  /** Quem recebe — aparece no Painel Master. */
  audience: string;
  body: string;
  examples: string[];
  footer?: string;
  /** Textos dos botões de resposta rápida, na ordem. */
  buttons?: string[];
}

export const TEMPLATE_LANGUAGE = "pt_BR";
const FOOTER = "PONTZAP · ponto eletrônico";

export const TEMPLATES = {
  registro_ponto: {
    name: "pontzap_registro_ponto",
    purpose: "Aviso de batida de ponto (entrada, almoço, saída)",
    audience: "Destinatários de notificação da empresa",
    body:
      "Registro de ponto na empresa {{1}}.\n\n" +
      "Tipo: {{2}}\nFuncionário: {{3}}\nLocal: {{4}}\nData e hora: {{5}}\nMétodo: {{6}}\n\n" +
      "Toque em Ok para confirmar o recebimento deste registro.",
    examples: ["Aqualife Piscinas", "Entrada", "João da Silva", "Condomínio Alfa", "28/10/2026 07:58", "GPS"],
    footer: FOOTER,
    buttons: ["Ok, recebido"],
  },

  alerta_entrada: {
    name: "pontzap_alerta_entrada",
    purpose: "Funcionário em cima da hora e sem ponto",
    audience: "Gestores (não síndicos)",
    body:
      "Alerta de entrada: o funcionário {{1}} ainda não registrou o ponto no local {{2}}. " +
      "O horário previsto era {{3}}. Já pedimos que ele informe a situação, e a resposta chega por aqui.",
    examples: ["João da Silva", "Condomínio Alfa", "08:00"],
    footer: FOOTER,
    buttons: ["Ok, ciente"],
  },

  lembrete_entrada: {
    name: "pontzap_lembrete_entrada",
    purpose: "Pergunta ao funcionário atrasado — ele responde no botão",
    audience: "Funcionário",
    body:
      "Olá, {{1}}. Sua entrada no local {{2}} estava prevista para {{3}} e ainda não encontramos " +
      "o registro do seu ponto. Toque em uma das opções abaixo para informar a empresa.",
    examples: ["João", "Condomínio Alfa", "08:00"],
    footer: FOOTER,
    buttons: ["Estou a caminho", "Vou me atrasar", "Vou faltar"],
  },

  resposta_funcionario: {
    name: "pontzap_resposta_funcionario",
    purpose: "Resposta do funcionário ao alerta de entrada",
    audience: "Gestores (não síndicos)",
    body:
      "O funcionário {{1}} respondeu ao alerta de entrada no local {{2}}, previsto para {{3}}.\n\n" +
      "Resposta: {{4}}\nObservação: {{5}}\n\nAcompanhe no painel do PONTZAP.",
    examples: ["João da Silva", "Condomínio Alfa", "08:00", "Estou a caminho", "sem observação"],
    footer: FOOTER,
    buttons: ["Ok, ciente"],
  },

  resumo_diario: {
    // v1 foi reclassificado como MARKETING ("Toque em Ver detalhes para
    // receber…" soou como chamada de engajamento). O v2 é um relatório de
    // conta configurado pela própria empresa — utilidade clássica.
    name: "pontzap_resumo_diario_v2",
    purpose: "Relatório diário de ponto — números principais; o completo vem no botão",
    audience: "Dono da empresa",
    body:
      "Relatório de ponto do dia {{1}} da empresa {{2}}, gerado conforme a configuração do resumo diário.\n\n" +
      "Funcionários com entrada registrada: {{3}} de {{4}}\nAtrasos: {{5}}\nSem registro de entrada: {{6}}\n\n" +
      "O relatório completo está disponível no painel do PONTZAP.",
    examples: ["28/10/2026", "Aqualife Piscinas", "12", "14", "1", "2"],
    footer: FOOTER,
    buttons: ["Ver relatório completo"],
  },

  troca_solicitada: {
    name: "pontzap_troca_solicitada",
    purpose: "Colega pediu troca de turno",
    audience: "Funcionário convidado para a troca",
    body:
      "Pedido de troca de turno: {{1}} quer trocar o turno de {{2}} pelo seu turno de {{3}}, " +
      "no local {{4}}. Abra o aplicativo PONTZAP para aceitar ou recusar.",
    examples: ["Maria Souza", "30/10 (07:00-19:00)", "01/11 (07:00-19:00)", "Condomínio Alfa"],
    footer: FOOTER,
  },

  troca_aceita: {
    name: "pontzap_troca_aceita",
    purpose: "Colega aceitou a troca",
    audience: "Funcionário que pediu a troca",
    body:
      "Troca de turno aceita: {{1}} aceitou trocar o seu turno de {{2}} pelo turno de {{3}}, " +
      "no local {{4}}. A troca agora aguarda a aprovação da empresa.",
    examples: ["Maria Souza", "30/10", "01/11", "Condomínio Alfa"],
    footer: FOOTER,
  },

  troca_pendente: {
    name: "pontzap_troca_pendente",
    purpose: "Troca combinada entre funcionários, esperando aprovação",
    audience: "Gestores",
    body:
      "Troca de turno aguardando aprovação: {{1}} e {{2}} combinaram trocar os turnos de {{3}} e {{4}}, " +
      "no local {{5}}. Aprove ou recuse no painel do PONTZAP.",
    examples: ["João da Silva", "Maria Souza", "30/10", "01/11", "Condomínio Alfa"],
    footer: FOOTER,
    buttons: ["Ok, ciente"],
  },

  troca_aprovada: {
    name: "pontzap_troca_aprovada",
    purpose: "Empresa aprovou a troca",
    audience: "Os dois funcionários",
    body:
      "Sua troca de turno no local {{1}} foi aprovada. Você trabalharia em {{2}} e agora trabalha em {{3}}. " +
      "A escala já foi atualizada no aplicativo.",
    examples: ["Condomínio Alfa", "30/10", "01/11"],
    footer: FOOTER,
  },

  troca_recusada: {
    name: "pontzap_troca_recusada",
    purpose: "Empresa recusou a troca",
    audience: "Funcionário que pediu a troca",
    body:
      "Sua solicitação de troca do turno de {{1}}, no local {{2}}, foi recusada pela empresa. " +
      "Motivo informado: {{3}}. Em caso de dúvida, fale com a empresa.",
    examples: ["30/10", "Condomínio Alfa", "escala já fechada"],
    footer: FOOTER,
  },

  vale_solicitado: {
    // v1 foi rejeitado como INCORRECT_CATEGORY: valor + chave Pix no mesmo
    // texto pareceu cobrança. Agora o template só avisa que há uma
    // solicitação para analisar; valor e chave vão no "Ver detalhes".
    name: "pontzap_vale_solicitado_v2",
    purpose: "Funcionário pediu vale/adiantamento",
    audience: "WhatsApp definido nas regras de vale",
    body:
      "Nova solicitação registrada no PONTZAP: o funcionário {{1}} enviou uma solicitação de {{2}} " +
      "em {{3}}. A solicitação aguarda a sua análise no painel do PONTZAP.",
    examples: ["João da Silva", "vale", "28/10/2026 14:32"],
    footer: FOOTER,
    buttons: ["Ver detalhes"],
  },

  vale_aprovado: {
    name: "pontzap_vale_aprovado",
    purpose: "Vale aprovado",
    audience: "Funcionário",
    body:
      "Seu pedido de {{1}} foi aprovado pela empresa {{2}}. Valor liberado: {{3}}. " +
      "O pagamento será feito na chave Pix que você confirmou no aplicativo.",
    examples: ["vale", "Aqualife Piscinas", "R$ 600,00"],
    footer: FOOTER,
  },

  vale_recusado: {
    name: "pontzap_vale_recusado",
    purpose: "Vale recusado",
    audience: "Funcionário",
    body:
      "Seu pedido de {{1}} no valor de {{2}} não foi aprovado pela empresa. Motivo informado: {{3}}. " +
      "Em caso de dúvida, fale com a empresa.",
    examples: ["vale", "R$ 600,00", "limite do mês já utilizado"],
    footer: FOOTER,
  },

  vale_pago: {
    name: "pontzap_vale_pago",
    purpose: "Vale pago — funcionário confirma no botão se recebeu",
    audience: "Funcionário",
    body:
      "A empresa {{1}} registrou o pagamento de {{2}} referente ao seu pedido de {{3}}, na chave Pix {{4}}. " +
      "Confira sua conta e confirme abaixo se o valor foi recebido.",
    examples: ["Aqualife Piscinas", "R$ 600,00", "vale", "123.456.789-00"],
    footer: FOOTER,
    buttons: ["Recebi", "Não recebi"],
  },

  vale_nao_recebido: {
    name: "pontzap_vale_nao_recebido",
    purpose: "Funcionário avisou que o vale pago não caiu",
    audience: "WhatsApp definido nas regras de vale",
    body:
      "Atenção: {{1}} informou que não recebeu o pagamento de {{2}} referente ao pedido de {{3}}, " +
      "registrado na chave Pix {{4}}. Confira o comprovante da transferência no seu banco.",
    examples: ["João da Silva", "R$ 600,00", "vale", "123.456.789-00"],
    footer: FOOTER,
    buttons: ["Ok, ciente"],
  },
} satisfies Record<string, TemplateDef>;

export type TemplateKey = keyof typeof TEMPLATES;

/** Corpo do pedido de criação de template na Meta. */
export function buildCreatePayload(def: TemplateDef) {
  const components: unknown[] = [
    {
      type: "BODY",
      text: def.body,
      example: { body_text: [def.examples] },
    },
  ];
  if (def.footer) components.push({ type: "FOOTER", text: def.footer });
  if (def.buttons?.length) {
    components.push({
      type: "BUTTONS",
      buttons: def.buttons.map((text) => ({ type: "QUICK_REPLY", text })),
    });
  }
  return {
    name: def.name,
    language: TEMPLATE_LANGUAGE,
    category: "UTILITY",
    components,
  };
}

/**
 * A Meta recusa parâmetro vazio, com quebra de linha, tabulação ou mais de 4
 * espaços seguidos. Normaliza tudo antes de enviar.
 */
export function sanitizeParam(value: unknown): string {
  const s = String(value ?? "")
    .replace(/[\r\n\t]+/g, " · ")
    .replace(/ {2,}/g, " ")
    .trim();
  if (!s) return "-";
  return s.length > 300 ? `${s.slice(0, 297)}...` : s;
}
