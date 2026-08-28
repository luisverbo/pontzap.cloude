-- ============================================================================
-- BANCO DE HORAS AUTOMÁTICO
-- Calcula crédito/débito comparando o que foi trabalhado (pontos batidos) com
-- a jornada prevista (escala pontual > escala fixa > horário do cadastro).
-- Os lançamentos automáticos usam kind='auto' e são recalculáveis: o cálculo
-- apaga os 'auto' do período antes de gravar de novo, então rodar duas vezes
-- nunca duplica. Lançamentos manuais e acertos nunca são tocados.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.hour_bank_config (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  -- Cálculo automático ligado/desligado
  enabled BOOLEAN NOT NULL DEFAULT false,
  -- Diferenças diárias menores que isto são ignoradas (min)
  tolerance_minutes INTEGER NOT NULL DEFAULT 10,
  -- Ao trabalhar em feriado, todo o tempo vira crédito
  credit_holidays BOOLEAN NOT NULL DEFAULT true,
  last_calculated_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.hour_bank_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage hour bank config" ON public.hour_bank_config;
CREATE POLICY "Admins manage hour bank config"
ON public.hour_bank_config FOR ALL
USING (
  (public.is_admin_or_manager(auth.uid()) AND company_id = public.get_user_company_id(auth.uid()))
  OR public.is_master_user(auth.uid())
)
WITH CHECK (
  (public.is_admin_or_manager(auth.uid()) AND company_id = public.get_user_company_id(auth.uid()))
  OR public.is_master_user(auth.uid())
);

-- Um único lançamento automático por funcionário/dia (base da idempotência).
CREATE UNIQUE INDEX IF NOT EXISTS idx_hour_bank_auto_unique
ON public.hour_bank_entries (employee_id, entry_date)
WHERE kind = 'auto';

CREATE INDEX IF NOT EXISTS idx_hour_bank_company_date
ON public.hour_bank_entries (company_id, entry_date);

-- ---------------------------------------------------------------------------
-- O banco de horas passa a ser informação interna: o funcionário não enxerga
-- mais o próprio saldo (decisão do cliente). Basta recriar esta policy para
-- voltar a exibir.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Employees view their own hour bank" ON public.hour_bank_entries;

-- ---------------------------------------------------------------------------
-- Cálculo automático toda madrugada (03:10 BRT = 06:10 UTC), processando o dia
-- anterior das empresas que ligaram a automação.
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('pontzap-hour-bank-calc')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pontzap-hour-bank-calc');

SELECT cron.schedule(
  'pontzap-hour-bank-calc',
  '10 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://hzedbdiznmlnlxnmtoho.supabase.co/functions/v1/hour-bank-calc',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);
