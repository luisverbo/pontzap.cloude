-- ============================================================================
-- PASSAGEM DE TURNO + PORTAL DO SÍNDICO
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Passagem de turno
-- Quem sai deixa texto e/ou áudio; quem entra vê antes de bater o ponto e
-- marca "ciente". Fica no histórico do local.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shift_handovers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  note TEXT,
  audio_path TEXT,                     -- bucket handover-audio (privado)
  audio_seconds INTEGER,
  acknowledged_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT handover_has_content CHECK (
    COALESCE(TRIM(note), '') <> '' OR audio_path IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_handovers_location
  ON public.shift_handovers (location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_handovers_company
  ON public.shift_handovers (company_id, created_at DESC);

-- company_id pelo local (fonte confiável), e o funcionário não consegue
-- gravar em nome de outro.
CREATE OR REPLACE FUNCTION public.guard_handover_insert()
RETURNS TRIGGER AS $$
BEGIN
  SELECT company_id INTO NEW.company_id FROM public.locations WHERE id = NEW.location_id;

  IF NOT (public.has_role(auth.uid(), 'admin'::user_role) OR public.is_master_user(auth.uid())) THEN
    SELECT id INTO NEW.employee_id FROM public.employees WHERE user_id = auth.uid();
    IF NEW.employee_id IS NULL THEN
      RAISE EXCEPTION 'Funcionário não encontrado.';
    END IF;
    NEW.acknowledged_by := NULL;
    NEW.acknowledged_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS guard_handover_before_insert ON public.shift_handovers;
CREATE TRIGGER guard_handover_before_insert
BEFORE INSERT ON public.shift_handovers
FOR EACH ROW EXECUTE FUNCTION public.guard_handover_insert();

ALTER TABLE public.shift_handovers ENABLE ROW LEVEL SECURITY;

-- Funcionário vê as passagens dos locais onde trabalha (e as próprias);
-- admin/gerente vê a empresa.
DROP POLICY IF EXISTS "View handovers" ON public.shift_handovers;
CREATE POLICY "View handovers"
ON public.shift_handovers FOR SELECT
USING (
  employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  OR location_id IN (
    SELECT el.location_id FROM public.employee_locations el
    JOIN public.employees e ON e.id = el.employee_id
    WHERE e.user_id = auth.uid()
  )
  OR (public.is_admin_or_manager(auth.uid()) AND company_id = public.get_user_company_id(auth.uid()))
  OR company_id IN (SELECT id FROM public.companies WHERE admin_user_id = auth.uid())
  OR public.is_master_user(auth.uid())
);

DROP POLICY IF EXISTS "Create handovers" ON public.shift_handovers;
CREATE POLICY "Create handovers"
ON public.shift_handovers FOR INSERT
WITH CHECK (
  EXISTS (SELECT 1 FROM public.employees WHERE user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin'::user_role)
  OR public.is_master_user(auth.uid())
);

-- "Ciente": qualquer funcionário do local. Admin pode editar/apagar.
DROP POLICY IF EXISTS "Acknowledge handovers" ON public.shift_handovers;
CREATE POLICY "Acknowledge handovers"
ON public.shift_handovers FOR UPDATE
USING (
  location_id IN (
    SELECT el.location_id FROM public.employee_locations el
    JOIN public.employees e ON e.id = el.employee_id
    WHERE e.user_id = auth.uid()
  )
  OR EXISTS (SELECT 1 FROM public.employees WHERE user_id = auth.uid() AND type = 'substitute')
  OR (public.has_role(auth.uid(), 'admin'::user_role) AND company_id = public.get_user_company_id(auth.uid()))
  OR company_id IN (SELECT id FROM public.companies WHERE admin_user_id = auth.uid())
  OR public.is_master_user(auth.uid())
);

DROP POLICY IF EXISTS "Admins delete handovers" ON public.shift_handovers;
CREATE POLICY "Admins delete handovers"
ON public.shift_handovers FOR DELETE
USING (
  (public.has_role(auth.uid(), 'admin'::user_role) AND company_id = public.get_user_company_id(auth.uid()))
  OR company_id IN (SELECT id FROM public.companies WHERE admin_user_id = auth.uid())
  OR public.is_master_user(auth.uid())
);

-- Áudio em bucket PRIVADO: só com login (ou link temporário gerado pelo
-- servidor para o portal). Caminho é UUID.
INSERT INTO storage.buckets (id, name, public)
VALUES ('handover-audio', 'handover-audio', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated upload handover audio" ON storage.objects;
CREATE POLICY "Authenticated upload handover audio"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'handover-audio');

DROP POLICY IF EXISTS "Authenticated read handover audio" ON storage.objects;
CREATE POLICY "Authenticated read handover audio"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'handover-audio');

-- ---------------------------------------------------------------------------
-- 2) Portal do Síndico
-- Um link + PIN por local. NADA é exibido por padrão: cada item é liberado
-- pela empresa. O portal é lido por uma função do servidor (condo-portal)
-- que monta só o que foi liberado — o síndico nunca consulta o banco.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.location_portals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  location_id UUID NOT NULL UNIQUE REFERENCES public.locations(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,          -- 48 hex, vai na URL
  pin_hash TEXT,                       -- sha256(token:pin); NULL = sem PIN
  is_active BOOLEAN NOT NULL DEFAULT true,
  -- O que o síndico pode ver (tudo desligado por padrão)
  show_on_duty BOOLEAN NOT NULL DEFAULT false,      -- quem está no posto agora
  show_times BOOLEAN NOT NULL DEFAULT false,        -- horários das batidas de hoje
  show_names BOOLEAN NOT NULL DEFAULT false,        -- nome do guardião (senão "Guardião")
  history_days INTEGER NOT NULL DEFAULT 0,          -- 0 = sem histórico
  show_occurrences BOOLEAN NOT NULL DEFAULT false,  -- ocorrências já aprovadas p/ condomínio
  show_handovers BOOLEAN NOT NULL DEFAULT false,    -- passagens de turno
  welcome_text TEXT,                                -- recado da empresa no topo
  -- Proteção contra tentativa de PIN
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_access_at TIMESTAMPTZ,
  access_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT portal_history_days_valid CHECK (history_days BETWEEN 0 AND 90)
);

CREATE OR REPLACE FUNCTION public.set_portal_company()
RETURNS TRIGGER AS $$
BEGIN
  SELECT company_id INTO NEW.company_id FROM public.locations WHERE id = NEW.location_id;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS set_portal_company_before_write ON public.location_portals;
CREATE TRIGGER set_portal_company_before_write
BEFORE INSERT OR UPDATE ON public.location_portals
FOR EACH ROW EXECUTE FUNCTION public.set_portal_company();

ALTER TABLE public.location_portals ENABLE ROW LEVEL SECURITY;

-- Só o admin da empresa mexe. O síndico não tem usuário — ele entra pela
-- função do servidor com token + PIN.
DROP POLICY IF EXISTS "Admins manage portals" ON public.location_portals;
CREATE POLICY "Admins manage portals"
ON public.location_portals FOR ALL
USING (
  (public.has_role(auth.uid(), 'admin'::user_role) AND (
    company_id = public.get_user_company_id(auth.uid())
    OR company_id IN (SELECT id FROM public.companies WHERE admin_user_id = auth.uid())
  ))
  OR public.is_master_user(auth.uid())
)
WITH CHECK (
  (public.has_role(auth.uid(), 'admin'::user_role) AND (
    company_id = public.get_user_company_id(auth.uid())
    OR company_id IN (SELECT id FROM public.companies WHERE admin_user_id = auth.uid())
  ))
  OR public.is_master_user(auth.uid())
);

-- Mudar o que o síndico vê entra na trilha de auditoria.
DROP TRIGGER IF EXISTS audit_location_portals ON public.location_portals;
CREATE TRIGGER audit_location_portals
AFTER INSERT OR UPDATE OR DELETE ON public.location_portals
FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
