-- Phase 4: manage the Evolution API (WhatsApp) connection from the PONTZAP
-- master panel instead of Supabase secrets.
CREATE TABLE IF NOT EXISTS public.evolution_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_url TEXT,
  api_key TEXT,
  instance TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.evolution_config ENABLE ROW LEVEL SECURITY;

-- Only master users manage the integration credentials
DROP POLICY IF EXISTS "Master users manage evolution_config" ON public.evolution_config;
CREATE POLICY "Master users manage evolution_config"
ON public.evolution_config FOR ALL
USING (public.is_master_user(auth.uid()))
WITH CHECK (public.is_master_user(auth.uid()));
