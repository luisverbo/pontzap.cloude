-- ============================================================================
-- JUSTIFICATIVA DE FALTA
-- O funcionário justifica uma falta pelo app (motivo + foto do atestado);
-- o admin aprova ou recusa. Falta justificada não vira desconto.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE public.justification_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.absence_justifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  reason TEXT NOT NULL,
  photo_paths TEXT[] NOT NULL DEFAULT '{}',   -- atestado / comprovante
  status public.justification_status NOT NULL DEFAULT 'pending',
  review_note TEXT,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, date)
);

CREATE INDEX IF NOT EXISTS idx_justifications_company ON public.absence_justifications (company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_justifications_employee ON public.absence_justifications (employee_id, date DESC);

-- company_id no servidor + estado inicial travado (funcionário não se auto-aprova)
CREATE OR REPLACE FUNCTION public.set_justification_company()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    NEW.company_id := public.get_user_company_id(auth.uid());
  END IF;
  IF NOT (public.has_role(auth.uid(), 'admin'::user_role) OR public.is_master_user(auth.uid())) THEN
    NEW.status := 'pending';
    NEW.review_note := NULL;
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS set_company_before_insert ON public.absence_justifications;
CREATE TRIGGER set_company_before_insert
BEFORE INSERT ON public.absence_justifications
FOR EACH ROW EXECUTE FUNCTION public.set_justification_company();

ALTER TABLE public.absence_justifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employees view their own justifications" ON public.absence_justifications;
CREATE POLICY "Employees view their own justifications"
ON public.absence_justifications FOR SELECT
USING (
  employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  OR (public.is_admin_or_manager(auth.uid()) AND company_id = public.get_user_company_id(auth.uid()))
  OR public.is_master_user(auth.uid())
);

DROP POLICY IF EXISTS "Employees create their own justifications" ON public.absence_justifications;
CREATE POLICY "Employees create their own justifications"
ON public.absence_justifications FOR INSERT
WITH CHECK (
  employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  OR (public.has_role(auth.uid(), 'admin'::user_role) AND company_id = public.get_user_company_id(auth.uid()))
  OR public.is_master_user(auth.uid())
);

-- Aprovar/recusar/excluir é do admin
DROP POLICY IF EXISTS "Admins manage company justifications" ON public.absence_justifications;
CREATE POLICY "Admins manage company justifications"
ON public.absence_justifications FOR UPDATE
USING (
  (public.has_role(auth.uid(), 'admin'::user_role) AND company_id = public.get_user_company_id(auth.uid()))
  OR public.is_master_user(auth.uid())
)
WITH CHECK (
  (public.has_role(auth.uid(), 'admin'::user_role) AND company_id = public.get_user_company_id(auth.uid()))
  OR public.is_master_user(auth.uid())
);

DROP POLICY IF EXISTS "Admins delete company justifications" ON public.absence_justifications;
CREATE POLICY "Admins delete company justifications"
ON public.absence_justifications FOR DELETE
USING (
  (public.has_role(auth.uid(), 'admin'::user_role) AND company_id = public.get_user_company_id(auth.uid()))
  OR public.is_master_user(auth.uid())
);

-- Fotos do atestado: mesmo padrão dos outros buckets (caminho UUID)
INSERT INTO storage.buckets (id, name, public)
VALUES ('justification-photos', 'justification-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated users can upload justification photos" ON storage.objects;
CREATE POLICY "Authenticated users can upload justification photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'justification-photos');
