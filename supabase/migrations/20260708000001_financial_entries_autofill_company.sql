-- Definitive fix for "Erro ao salvar entrada" (new row violates RLS on financial_entries):
-- auto-fill company_id server-side via a BEFORE INSERT trigger so it never depends on
-- the client sending it, and make the manage policy explicit about WITH CHECK so the
-- insert always passes the company check. Same pattern used for notification_recipients.

CREATE OR REPLACE FUNCTION public.set_financial_entry_company()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    NEW.company_id := public.get_user_company_id(auth.uid());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS set_company_before_insert ON public.financial_entries;
CREATE TRIGGER set_company_before_insert
BEFORE INSERT ON public.financial_entries
FOR EACH ROW
EXECUTE FUNCTION public.set_financial_entry_company();

-- Make the manage policy explicit about WITH CHECK (insert/update) as well as USING.
DROP POLICY IF EXISTS "Admins can manage company financial entries" ON public.financial_entries;
CREATE POLICY "Admins can manage company financial entries"
ON public.financial_entries FOR ALL
USING (
  (public.has_role(auth.uid(), 'admin'::user_role) AND company_id = public.get_user_company_id(auth.uid()))
  OR public.is_master_user(auth.uid())
)
WITH CHECK (
  (public.has_role(auth.uid(), 'admin'::user_role) AND company_id = public.get_user_company_id(auth.uid()))
  OR public.is_master_user(auth.uid())
);
