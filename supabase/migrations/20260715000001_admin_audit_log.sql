-- ============================================================================
-- TRILHA DE AUDITORIA
-- Registra quem alterou o quê em registros sensíveis (ponto manual, banco de
-- horas, folgas): proteção do empregador em disputa trabalhista. Gravada por
-- trigger no banco — impossível de esquecer ou burlar pelo front.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  user_id UUID,                -- quem fez (auth.uid(); NULL = servidor/automação)
  action TEXT NOT NULL,        -- INSERT | UPDATE | DELETE
  table_name TEXT NOT NULL,
  record_id UUID,
  details JSONB,               -- snapshot relevante (antes/depois)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_company_date ON public.admin_audit_log (company_id, created_at DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Só o admin da empresa (e master) LÊ. Ninguém escreve por API — apenas os
-- triggers (SECURITY DEFINER). Sem policy de INSERT/UPDATE/DELETE de propósito.
DROP POLICY IF EXISTS "Admins view company audit log" ON public.admin_audit_log;
CREATE POLICY "Admins view company audit log"
ON public.admin_audit_log FOR SELECT
USING (
  (public.has_role(auth.uid(), 'admin'::user_role) AND company_id = public.get_user_company_id(auth.uid()))
  OR public.is_master_user(auth.uid())
);

-- ---------------------------------------------------------------------------
-- Função genérica de trilha
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.write_audit_log()
RETURNS TRIGGER AS $$
DECLARE
  v_company UUID;
  v_details JSONB;
  v_record UUID;
BEGIN
  -- Automação do servidor (service role) não entra na trilha de ADMIN;
  -- interessa a ação humana.
  IF auth.uid() IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_company := OLD.company_id;
    v_record := OLD.id;
    v_details := jsonb_build_object('antes', to_jsonb(OLD));
  ELSIF TG_OP = 'UPDATE' THEN
    v_company := NEW.company_id;
    v_record := NEW.id;
    v_details := jsonb_build_object('antes', to_jsonb(OLD), 'depois', to_jsonb(NEW));
  ELSE
    v_company := NEW.company_id;
    v_record := NEW.id;
    v_details := jsonb_build_object('depois', to_jsonb(NEW));
  END IF;

  INSERT INTO public.admin_audit_log (company_id, user_id, action, table_name, record_id, details)
  VALUES (v_company, auth.uid(), TG_OP, TG_TABLE_NAME, v_record, v_details);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Banco de horas: toda escrita humana
DROP TRIGGER IF EXISTS audit_hour_bank ON public.hour_bank_entries;
CREATE TRIGGER audit_hour_bank
AFTER INSERT OR UPDATE OR DELETE ON public.hour_bank_entries
FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

-- Folgas: escalar/alterar/remover
DROP TRIGGER IF EXISTS audit_day_offs ON public.day_offs;
CREATE TRIGGER audit_day_offs
AFTER INSERT OR UPDATE OR DELETE ON public.day_offs
FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

-- ---------------------------------------------------------------------------
-- Ponto: clock_records não tem company_id — versão dedicada que o resolve pelo
-- funcionário. Registra ponto manual do admin e qualquer edição/exclusão.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.write_audit_log_clock()
RETURNS TRIGGER AS $$
DECLARE
  v_company UUID;
  v_emp UUID;
  v_details JSONB;
  v_record UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_emp := COALESCE(NEW.employee_id, OLD.employee_id);
  SELECT company_id INTO v_company FROM public.employees WHERE id = v_emp;

  IF TG_OP = 'DELETE' THEN
    v_record := OLD.id;
    v_details := jsonb_build_object('antes', to_jsonb(OLD));
  ELSIF TG_OP = 'UPDATE' THEN
    v_record := NEW.id;
    v_details := jsonb_build_object('antes', to_jsonb(OLD), 'depois', to_jsonb(NEW));
  ELSE
    v_record := NEW.id;
    v_details := jsonb_build_object('depois', to_jsonb(NEW));
  END IF;

  INSERT INTO public.admin_audit_log (company_id, user_id, action, table_name, record_id, details)
  VALUES (v_company, auth.uid(), TG_OP, 'clock_records', v_record, v_details);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS audit_clock_records ON public.clock_records;
CREATE TRIGGER audit_clock_records
AFTER INSERT OR UPDATE OR DELETE ON public.clock_records
FOR EACH ROW EXECUTE FUNCTION public.write_audit_log_clock();
