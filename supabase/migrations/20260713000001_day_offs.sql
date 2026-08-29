-- ============================================================================
-- ESCALA DE FOLGAS
-- A folga semanal fixa (ex.: toda segunda) continua vindo de fixed_schedules
-- com works=false. Esta tabela é para as folgas ESCALADAS caso a caso:
--   sunday    → o domingo de folga do mês
--   extra     → folga extra concedida pela empresa
--   hour_bank → folga usando saldo do banco de horas (gera o débito)
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE public.day_off_kind AS ENUM ('sunday', 'extra', 'hour_bank');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.day_offs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  kind public.day_off_kind NOT NULL DEFAULT 'extra',
  notes TEXT,
  -- Lançamento do banco de horas criado junto (quando kind='hour_bank'),
  -- para que apagar a folga também desfaça o débito.
  hour_bank_entry_id UUID REFERENCES public.hour_bank_entries(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, date)
);

CREATE INDEX IF NOT EXISTS idx_day_offs_company_date ON public.day_offs (company_id, date);
CREATE INDEX IF NOT EXISTS idx_day_offs_employee_date ON public.day_offs (employee_id, date);

-- company_id preenchido no servidor (mesmo padrão das demais tabelas)
CREATE OR REPLACE FUNCTION public.set_day_off_company()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    NEW.company_id := public.get_user_company_id(auth.uid());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS set_company_before_insert ON public.day_offs;
CREATE TRIGGER set_company_before_insert
BEFORE INSERT ON public.day_offs
FOR EACH ROW EXECUTE FUNCTION public.set_day_off_company();

ALTER TABLE public.day_offs ENABLE ROW LEVEL SECURITY;

-- O funcionário vê as próprias folgas (diferente do banco de horas, aqui ele
-- PRECISA enxergar — é o dia em que ele não trabalha).
DROP POLICY IF EXISTS "Employees view their own day offs" ON public.day_offs;
CREATE POLICY "Employees view their own day offs"
ON public.day_offs FOR SELECT
USING (
  employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  OR (public.is_admin_or_manager(auth.uid()) AND company_id = public.get_user_company_id(auth.uid()))
  OR public.is_master_user(auth.uid())
);

-- Só a empresa escala/remove folgas
DROP POLICY IF EXISTS "Admins manage company day offs" ON public.day_offs;
CREATE POLICY "Admins manage company day offs"
ON public.day_offs FOR ALL
USING (
  (public.is_admin_or_manager(auth.uid()) AND company_id = public.get_user_company_id(auth.uid()))
  OR public.is_master_user(auth.uid())
)
WITH CHECK (
  (public.is_admin_or_manager(auth.uid()) AND company_id = public.get_user_company_id(auth.uid()))
  OR public.is_master_user(auth.uid())
);
