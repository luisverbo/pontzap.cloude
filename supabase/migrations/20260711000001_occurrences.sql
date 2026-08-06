-- ============================================================================
-- LIVRO DE OCORRÊNCIAS
-- O guardião registra ocorrências (com foto) pelo app. Ele pode marcar
-- "enviar para a administração do condomínio" — nesse caso a ocorrência fica
-- aguardando aprovação do admin, e só depois de aprovada gera um link público
-- que o admin compartilha por WhatsApp.
-- ============================================================================

-- Tipos de ocorrência configuráveis por empresa
CREATE TABLE IF NOT EXISTS public.occurrence_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_occurrence_types_company ON public.occurrence_types(company_id);

-- Status da ocorrência:
--   internal          → só interna (o guardião não pediu envio ao condomínio)
--   pending_approval  → guardião pediu envio, aguardando o admin aprovar
--   approved          → aprovada, link público ativo
--   rejected          → admin recusou o envio (segue visível só internamente)
DO $$ BEGIN
  CREATE TYPE public.occurrence_status AS ENUM ('internal', 'pending_approval', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.occurrence_severity AS ENUM ('low', 'medium', 'high');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.occurrences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,

  -- Snapshot do nome do tipo: se o admin renomear/apagar o tipo depois, o
  -- histórico continua legível.
  type_id UUID REFERENCES public.occurrence_types(id) ON DELETE SET NULL,
  type_name TEXT NOT NULL,

  description TEXT NOT NULL,
  severity public.occurrence_severity NOT NULL DEFAULT 'low',
  photo_paths TEXT[] NOT NULL DEFAULT '{}',

  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  send_to_condo BOOLEAN NOT NULL DEFAULT false,
  status public.occurrence_status NOT NULL DEFAULT 'internal',

  -- Token do link público — preenchido só na aprovação.
  public_token TEXT UNIQUE,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  review_note TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_occurrences_company ON public.occurrences(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_occurrences_employee ON public.occurrences(employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_occurrences_status ON public.occurrences(company_id, status);

-- ---------------------------------------------------------------------------
-- Preenche company_id no servidor (mesmo padrão já usado nas outras tabelas,
-- evita o erro de RLS quando o cliente não manda o campo).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_occurrence_company()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    NEW.company_id := public.get_user_company_id(auth.uid());
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS set_company_before_insert ON public.occurrences;
CREATE TRIGGER set_company_before_insert
BEFORE INSERT OR UPDATE ON public.occurrences
FOR EACH ROW EXECUTE FUNCTION public.set_occurrence_company();

CREATE OR REPLACE FUNCTION public.set_occurrence_type_company()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    NEW.company_id := public.get_user_company_id(auth.uid());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS set_company_before_insert ON public.occurrence_types;
CREATE TRIGGER set_company_before_insert
BEFORE INSERT ON public.occurrence_types
FOR EACH ROW EXECUTE FUNCTION public.set_occurrence_type_company();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.occurrence_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.occurrences ENABLE ROW LEVEL SECURITY;

-- Tipos: todos da empresa leem (o guardião precisa da lista); só admin edita.
DROP POLICY IF EXISTS "Company members can view occurrence types" ON public.occurrence_types;
CREATE POLICY "Company members can view occurrence types"
ON public.occurrence_types FOR SELECT
USING (
  company_id = public.get_user_company_id(auth.uid())
  OR public.is_master_user(auth.uid())
);

DROP POLICY IF EXISTS "Admins can manage occurrence types" ON public.occurrence_types;
CREATE POLICY "Admins can manage occurrence types"
ON public.occurrence_types FOR ALL
USING (
  (public.has_role(auth.uid(), 'admin'::user_role) AND company_id = public.get_user_company_id(auth.uid()))
  OR public.is_master_user(auth.uid())
)
WITH CHECK (
  (public.has_role(auth.uid(), 'admin'::user_role) AND company_id = public.get_user_company_id(auth.uid()))
  OR public.is_master_user(auth.uid())
);

-- Ocorrências: o guardião vê e cria as DELE; admin/gestor vê todas da empresa.
DROP POLICY IF EXISTS "Employees can view their own occurrences" ON public.occurrences;
CREATE POLICY "Employees can view their own occurrences"
ON public.occurrences FOR SELECT
USING (
  employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  OR (public.is_admin_or_manager(auth.uid()) AND company_id = public.get_user_company_id(auth.uid()))
  OR public.is_master_user(auth.uid())
);

DROP POLICY IF EXISTS "Employees can create their own occurrences" ON public.occurrences;
CREATE POLICY "Employees can create their own occurrences"
ON public.occurrences FOR INSERT
WITH CHECK (
  employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  OR (public.has_role(auth.uid(), 'admin'::user_role) AND company_id = public.get_user_company_id(auth.uid()))
  OR public.is_master_user(auth.uid())
);

-- Só o admin aprova/edita/apaga (o guardião não pode auto-aprovar).
DROP POLICY IF EXISTS "Admins can manage company occurrences" ON public.occurrences;
CREATE POLICY "Admins can manage company occurrences"
ON public.occurrences FOR UPDATE
USING (
  (public.has_role(auth.uid(), 'admin'::user_role) AND company_id = public.get_user_company_id(auth.uid()))
  OR public.is_master_user(auth.uid())
)
WITH CHECK (
  (public.has_role(auth.uid(), 'admin'::user_role) AND company_id = public.get_user_company_id(auth.uid()))
  OR public.is_master_user(auth.uid())
);

DROP POLICY IF EXISTS "Admins can delete company occurrences" ON public.occurrences;
CREATE POLICY "Admins can delete company occurrences"
ON public.occurrences FOR DELETE
USING (
  (public.has_role(auth.uid(), 'admin'::user_role) AND company_id = public.get_user_company_id(auth.uid()))
  OR public.is_master_user(auth.uid())
);

-- ---------------------------------------------------------------------------
-- Bucket das fotos (mesmo padrão do clock-photos: leitura pública, caminho
-- baseado em UUID impossível de adivinhar).
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('occurrence-photos', 'occurrence-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated users can upload occurrence photos" ON storage.objects;
CREATE POLICY "Authenticated users can upload occurrence photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'occurrence-photos');

-- ---------------------------------------------------------------------------
-- Tipos padrão para as empresas que já existem (o admin pode editar depois).
-- ---------------------------------------------------------------------------
INSERT INTO public.occurrence_types (company_id, name, sort_order)
SELECT c.id, t.name, t.sort_order
FROM public.companies c
CROSS JOIN (VALUES
  ('Manutenção / Equipamento', 1),
  ('Produto químico', 2),
  ('Segurança', 3),
  ('Limpeza', 4),
  ('Comportamento de morador', 5),
  ('Acidente / Incidente', 6),
  ('Outros', 99)
) AS t(name, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.occurrence_types ot WHERE ot.company_id = c.id
);
