-- Phase 4: opt-in daily WhatsApp summary per company.
CREATE TABLE IF NOT EXISTS public.daily_summary_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  send_time TIME NOT NULL DEFAULT '18:00',
  whatsapp TEXT,                        -- number to send to; falls back to companies.phone if null
  last_sent_date DATE,                  -- guards against double-send within the same SP day
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id)
);

ALTER TABLE public.daily_summary_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage own daily summary config" ON public.daily_summary_config;
CREATE POLICY "Admins manage own daily summary config"
ON public.daily_summary_config FOR ALL
USING (
  (public.has_role(auth.uid(), 'admin'::user_role) AND company_id = public.get_user_company_id(auth.uid()))
  OR public.is_master_user(auth.uid())
)
WITH CHECK (
  (public.has_role(auth.uid(), 'admin'::user_role) AND company_id = public.get_user_company_id(auth.uid()))
  OR public.is_master_user(auth.uid())
);

-- pg_cron: fire every 5 minutes, the edge function itself decides whose
-- send_time (São Paulo) matches "now" and who hasn't been sent today yet.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('pontzap-daily-summary')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pontzap-daily-summary');

SELECT cron.schedule(
  'pontzap-daily-summary',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://hzedbdiznmlnlxnmtoho.supabase.co/functions/v1/daily-summary',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);
