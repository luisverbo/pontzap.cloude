-- Resolve an owner-admin's company even when they have no employees row.
-- get_user_company_id previously only looked at employees, so company owners
-- (companies.admin_user_id) resolved to NULL — breaking their company update,
-- anotações, espelho employer, etc. Add a fallback to admin_user_id.
CREATE OR REPLACE FUNCTION public.get_user_company_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT company_id FROM public.employees WHERE user_id = _user_id LIMIT 1),
    (SELECT id FROM public.companies WHERE admin_user_id = _user_id LIMIT 1)
  )
$$;
