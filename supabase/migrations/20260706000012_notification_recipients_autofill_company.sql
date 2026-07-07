-- Definitive fix for "new row violates RLS on notification_recipients":
-- auto-fill company_id server-side so it never depends on the client sending it,
-- and the WITH CHECK policy always matches. A BEFORE INSERT trigger runs before
-- the RLS WITH CHECK is evaluated, so setting company_id here guarantees the row
-- passes the company check.

CREATE OR REPLACE FUNCTION public.set_notification_recipient_company()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    NEW.company_id := public.get_user_company_id(auth.uid());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS set_company_before_insert ON public.notification_recipients;
CREATE TRIGGER set_company_before_insert
BEFORE INSERT ON public.notification_recipients
FOR EACH ROW
EXECUTE FUNCTION public.set_notification_recipient_company();

-- Make the manage policy explicit about WITH CHECK (insert) as well as USING.
DROP POLICY IF EXISTS "Admins can manage company notification recipients" ON public.notification_recipients;
CREATE POLICY "Admins can manage company notification recipients"
ON public.notification_recipients FOR ALL
USING (
  (public.has_role(auth.uid(), 'admin'::user_role) AND company_id = public.get_user_company_id(auth.uid()))
  OR public.is_master_user(auth.uid())
)
WITH CHECK (
  (public.has_role(auth.uid(), 'admin'::user_role) AND company_id = public.get_user_company_id(auth.uid()))
  OR public.is_master_user(auth.uid())
);
