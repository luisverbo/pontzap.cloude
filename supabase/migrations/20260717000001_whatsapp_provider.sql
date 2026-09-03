-- Provedor de WhatsApp configurável no Painel Master.
--   'evolution' (padrão) → Evolution API, como já era
--   'webhook'            → agente próprio (ex.: rodando na sua VPS)
--
-- No modo webhook os campos são reaproveitados:
--   base_url = URL completa do endpoint de envio (ex.: https://sua-vps:3001/send)
--   api_key  = token enviado no header Authorization: Bearer
--   instance = ignorado
ALTER TABLE public.evolution_config
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'evolution';

COMMENT ON COLUMN public.evolution_config.provider IS
  'evolution = Evolution API; webhook = agente próprio (base_url é a URL completa, api_key vai como Bearer).';
