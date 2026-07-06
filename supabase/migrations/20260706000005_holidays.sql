-- Phase 3 (compliance): holiday calendar. Lets each company register holidays
-- so the espelho/reports can flag them instead of treating them as normal days.
CREATE TABLE IF NOT EXISTS public.holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, date)
);

ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

-- Everyone in the company can read the holidays
DROP POLICY IF EXISTS "Company members view holidays" ON public.holidays;
CREATE POLICY "Company members view holidays"
ON public.holidays FOR SELECT
USING (
  company_id = public.get_user_company_id(auth.uid())
  OR public.is_master_user(auth.uid())
);

-- Admins manage their company's holidays
DROP POLICY IF EXISTS "Admins manage company holidays" ON public.holidays;
CREATE POLICY "Admins manage company holidays"
ON public.holidays FOR ALL
USING (
  (public.has_role(auth.uid(), 'admin'::user_role) AND company_id = public.get_user_company_id(auth.uid()))
  OR public.is_master_user(auth.uid())
)
WITH CHECK (
  (public.has_role(auth.uid(), 'admin'::user_role) AND company_id = public.get_user_company_id(auth.uid()))
  OR public.is_master_user(auth.uid())
);
