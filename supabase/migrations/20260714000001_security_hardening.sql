-- ============================================================================
-- ENDURECIMENTO DE SEGURANÇA (auditoria)
-- ============================================================================

-- 1) Ocorrências: um funcionário poderia INSERIR a ocorrência já com
--    status='approved' e um public_token próprio (a policy de INSERT não
--    restringe colunas), publicando para o condomínio SEM passar pela
--    aprovação do admin. O trigger força o estado inicial correto para
--    quem não é admin; aprovação continua sendo só via UPDATE (admin-only).
CREATE OR REPLACE FUNCTION public.guard_occurrence_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::user_role) OR public.is_master_user(auth.uid())) THEN
    NEW.status := CASE WHEN NEW.send_to_condo THEN 'pending_approval'::public.occurrence_status
                       ELSE 'internal'::public.occurrence_status END;
    NEW.public_token := NULL;
    NEW.approved_at := NULL;
    NEW.approved_by := NULL;
    NEW.review_note := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS guard_occurrence_before_insert ON public.occurrences;
CREATE TRIGGER guard_occurrence_before_insert
BEFORE INSERT ON public.occurrences
FOR EACH ROW EXECUTE FUNCTION public.guard_occurrence_insert();

-- 2) Ponto: fecha de vez o INSERT direto do funcionário em clock_records.
--    Todo ponto do funcionário passa pelo register-clock (horário do servidor,
--    cerca geográfica, NSR/hash). O registro manual do admin continua valendo
--    pela policy de admin. Idempotente — repete o lock de 20260706000001 caso
--    aquela migration nunca tenha sido aplicada.
DROP POLICY IF EXISTS "Employees can insert their own clock records" ON public.clock_records;
