-- Phase 4: real hour bank (banco de horas) as a dated ledger of credits/debits,
-- replacing the single accumulated number.
CREATE TABLE IF NOT EXISTS public.hour_bank_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL DEFAULT current_date,
  minutes INTEGER NOT NULL,               -- positive = credit (extra), negative = debit
  description TEXT,
  kind TEXT NOT NULL DEFAULT 'manual',    -- manual | settlement
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hour_bank_employee ON public.hour_bank_entries (employee_id);

ALTER TABLE public.hour_bank_entries ENABLE ROW LEVEL SECURITY;

-- Admins/managers manage their company's entries
DROP POLICY IF EXISTS "Admins manage company hour bank" ON public.hour_bank_entries;
CREATE POLICY "Admins manage company hour bank"
ON public.hour_bank_entries FOR ALL
USING (
  (public.is_admin_or_manager(auth.uid()) AND company_id = public.get_user_company_id(auth.uid()))
  OR public.is_master_user(auth.uid())
)
WITH CHECK (
  (public.is_admin_or_manager(auth.uid()) AND company_id = public.get_user_company_id(auth.uid()))
  OR public.is_master_user(auth.uid())
);

-- Employees view their own balance
DROP POLICY IF EXISTS "Employees view their own hour bank" ON public.hour_bank_entries;
CREATE POLICY "Employees view their own hour bank"
ON public.hour_bank_entries FOR SELECT
USING (
  employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
);
