-- Company legal/contact details for the espelho de ponto header (employer info).
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS cnpj TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS cep TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT;

-- Allow a company admin to view AND update their own company row (previously
-- only master users / read paths existed).
DROP POLICY IF EXISTS "Admins update their own company" ON public.companies;
CREATE POLICY "Admins update their own company"
ON public.companies FOR UPDATE
USING (
  (public.has_role(auth.uid(), 'admin'::user_role) AND id = public.get_user_company_id(auth.uid()))
  OR public.is_master_user(auth.uid())
)
WITH CHECK (
  (public.has_role(auth.uid(), 'admin'::user_role) AND id = public.get_user_company_id(auth.uid()))
  OR public.is_master_user(auth.uid())
);
