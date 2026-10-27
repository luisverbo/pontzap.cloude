-- ============================================================================
-- WHATSAPP — API OFICIAL DA META (Cloud API)
--
-- Novo provedor 'meta' ao lado de 'evolution' e 'webhook'. Trocar de provedor
-- continua sendo só um clique no Painel Master.
--
-- Economia: mensagem iniciada pela empresa só pode ser TEMPLATE (pago). Mas
-- quando a pessoa responde/clica num botão, abre-se uma janela de 24 h em que
-- texto livre e templates utilitários são GRÁTIS. Por isso guardamos a última
-- mensagem recebida de cada número (whatsapp_contacts) e, com a janela aberta,
-- o sistema manda texto livre em vez de template.
-- ============================================================================

ALTER TABLE public.evolution_config
  ADD COLUMN IF NOT EXISTS meta_phone_number_id TEXT,
  ADD COLUMN IF NOT EXISTS meta_waba_id TEXT,
  ADD COLUMN IF NOT EXISTS meta_access_token TEXT,
  ADD COLUMN IF NOT EXISTS meta_app_secret TEXT,      -- valida a assinatura do webhook
  ADD COLUMN IF NOT EXISTS meta_verify_token TEXT,    -- usado só na verificação do webhook
  ADD COLUMN IF NOT EXISTS meta_api_version TEXT NOT NULL DEFAULT 'v21.0',
  ADD COLUMN IF NOT EXISTS meta_display_phone TEXT;

COMMENT ON COLUMN public.evolution_config.provider IS
  'evolution = Evolution API; webhook = agente próprio; meta = API oficial do WhatsApp (Cloud API).';

-- ---------------------------------------------------------------------------
-- Janela de atendimento: última mensagem RECEBIDA de cada número.
-- Só o servidor lê/escreve (sem policies = nenhum acesso pela API pública).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_contacts (
  phone TEXT PRIMARY KEY,               -- 55 + DDD + número, só dígitos
  profile_name TEXT,
  last_inbound_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_contacts ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- "Ver detalhes": o template leva um resumo curto e um botão; quando a pessoa
-- toca, a janela abre e mandamos o texto completo daqui — de graça.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_details_created ON public.whatsapp_details (created_at);
ALTER TABLE public.whatsapp_details ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Templates: espelho do que está na Meta (status de aprovação).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  name TEXT PRIMARY KEY,
  language TEXT NOT NULL DEFAULT 'pt_BR',
  category TEXT,                         -- o que a Meta aprovou (pode mudar a nossa)
  requested_category TEXT,               -- o que pedimos (UTILITY)
  status TEXT,                           -- APPROVED | PENDING | REJECTED | PAUSED | DISABLED | NOT_SUBMITTED
  meta_id TEXT,
  rejected_reason TEXT,
  last_error TEXT,
  last_synced_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Master views whatsapp templates" ON public.whatsapp_templates;
CREATE POLICY "Master views whatsapp templates"
ON public.whatsapp_templates FOR SELECT
USING (public.is_master_user(auth.uid()));

-- ---------------------------------------------------------------------------
-- Vale pago: o funcionário confirma pelo botão se o dinheiro caiu.
-- (Prova extra, além da chave congelada no pedido.)
-- ---------------------------------------------------------------------------
ALTER TABLE public.advance_requests
  ADD COLUMN IF NOT EXISTS employee_receipt TEXT,          -- received | not_received
  ADD COLUMN IF NOT EXISTS employee_receipt_at TIMESTAMPTZ;

-- Limpeza: detalhes com mais de 30 dias não servem para mais nada.
CREATE OR REPLACE FUNCTION public.purge_whatsapp_details()
RETURNS VOID AS $$
  DELETE FROM public.whatsapp_details WHERE created_at < now() - INTERVAL '30 days';
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;
