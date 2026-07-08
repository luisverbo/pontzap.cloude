-- Fix "Empresa não encontrada" on Minha Empresa: companies never had a SELECT
-- policy for the owning admin (only master users could SELECT, and only UPDATE
-- was granted to admins). This blocked both the company-details query and the
-- admin_user_id fallback used to resolve company_id for owner-admins with no
-- employees row.
DROP POLICY IF EXISTS "Admins can view their own company" ON public.companies;
CREATE POLICY "Admins can view their own company"
ON public.companies FOR SELECT
USING (
  id = public.get_user_company_id(auth.uid())
  OR admin_user_id = auth.uid()
  OR public.is_master_user(auth.uid())
);
