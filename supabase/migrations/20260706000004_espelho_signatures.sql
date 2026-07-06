-- Phase 3 (compliance): employee digital signature/approval of the monthly
-- espelho de ponto. The employee confirms their time sheet for a given month;
-- the admin's espelho then shows it was electronically signed.

CREATE TABLE IF NOT EXISTS public.espelho_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, ano, mes)
);

ALTER TABLE public.espelho_signatures ENABLE ROW LEVEL SECURITY;

-- Employees sign their own months
DROP POLICY IF EXISTS "Employees sign their own espelho" ON public.espelho_signatures;
CREATE POLICY "Employees sign their own espelho"
ON public.espelho_signatures FOR INSERT
WITH CHECK (
  employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "Employees view their own espelho signatures" ON public.espelho_signatures;
CREATE POLICY "Employees view their own espelho signatures"
ON public.espelho_signatures FOR SELECT
USING (
  employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
);

-- Admins/managers view the signatures for their company
DROP POLICY IF EXISTS "Admins view company espelho signatures" ON public.espelho_signatures;
CREATE POLICY "Admins view company espelho signatures"
ON public.espelho_signatures FOR SELECT
USING (
  (public.is_admin_or_manager(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = espelho_signatures.employee_id
    AND e.company_id = public.get_user_company_id(auth.uid())
  ))
  OR public.is_master_user(auth.uid())
);
