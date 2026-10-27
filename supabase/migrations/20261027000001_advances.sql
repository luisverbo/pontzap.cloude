-- ============================================================================
-- VALE / ADIANTAMENTO
--
-- O funcionário pede pelo app; a empresa define as regras (se está liberado,
-- teto por pedido, quantos por mês, janela do mês); o pedido chega no WhatsApp
-- de quem a empresa determinar; o admin aprova, recusa e marca como pago.
--
-- CHAVE PIX COM HISTÓRICO
-- A chave fica na ficha do funcionário e TODA alteração é registrada em
-- employee_pix_history (quem mudou, quando, qual era antes). Além disso, cada
-- pedido CONGELA a chave vigente no momento do pedido. Assim fica provado qual
-- chave estava cadastrada — e por quem — na data de cada pagamento.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Chave PIX na ficha do funcionário
-- ---------------------------------------------------------------------------
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS pix_key TEXT,
  ADD COLUMN IF NOT EXISTS pix_key_type TEXT,            -- cpf | cnpj | phone | email | random
  ADD COLUMN IF NOT EXISTS pix_key_owner_name TEXT,      -- titular da conta (pode não ser o funcionário)
  ADD COLUMN IF NOT EXISTS pix_key_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pix_key_updated_by UUID,
  ADD COLUMN IF NOT EXISTS pix_key_confirmed_at TIMESTAMPTZ;  -- última confirmação do próprio funcionário

COMMENT ON COLUMN public.employees.pix_key_confirmed_at IS
  'Última vez que o PRÓPRIO funcionário confirmou que a chave está correta (pedido de vale exige confirmação).';

CREATE TABLE IF NOT EXISTS public.employee_pix_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  pix_key TEXT,
  pix_key_type TEXT,
  pix_key_owner_name TEXT,
  previous_pix_key TEXT,
  changed_by UUID,                 -- auth.uid() de quem salvou
  changed_by_self BOOLEAN NOT NULL DEFAULT false,  -- true = o próprio funcionário
  -- true = não houve mudança, o funcionário apenas confirmou que a chave é dele
  confirmation BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pix_history_employee
  ON public.employee_pix_history (employee_id, created_at DESC);

-- Marca autoria/data e registra o histórico sempre que a chave muda.
CREATE OR REPLACE FUNCTION public.track_employee_pix()
RETURNS TRIGGER AS $$
DECLARE
  v_changed BOOLEAN;
  v_self BOOLEAN;
  v_previous TEXT;
BEGIN
  -- OLD não existe em INSERT, por isso os dois casos são separados.
  IF TG_OP = 'INSERT' THEN
    v_changed := true;
  ELSE
    v_changed :=
      COALESCE(NEW.pix_key, '') IS DISTINCT FROM COALESCE(OLD.pix_key, '')
      OR COALESCE(NEW.pix_key_type, '') IS DISTINCT FROM COALESCE(OLD.pix_key_type, '')
      OR COALESCE(NEW.pix_key_owner_name, '') IS DISTINCT FROM COALESCE(OLD.pix_key_owner_name, '');
  END IF;

  IF NOT v_changed OR COALESCE(NEW.pix_key, '') = '' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_previous := OLD.pix_key;
  END IF;

  v_self := NEW.user_id IS NOT NULL AND NEW.user_id = auth.uid();

  NEW.pix_key_updated_at := now();
  NEW.pix_key_updated_by := auth.uid();
  IF v_self THEN
    NEW.pix_key_confirmed_at := now();
  END IF;

  INSERT INTO public.employee_pix_history (
    company_id, employee_id, pix_key, pix_key_type, pix_key_owner_name,
    previous_pix_key, changed_by, changed_by_self
  ) VALUES (
    NEW.company_id, NEW.id, NEW.pix_key, NEW.pix_key_type, NEW.pix_key_owner_name,
    v_previous,
    auth.uid(), v_self
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS track_pix_before_write ON public.employees;
CREATE TRIGGER track_pix_before_write
BEFORE INSERT OR UPDATE OF pix_key, pix_key_type, pix_key_owner_name ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.track_employee_pix();

ALTER TABLE public.employee_pix_history ENABLE ROW LEVEL SECURITY;

-- Só leitura: o histórico é gravado pelo trigger (SECURITY DEFINER), nunca pela API.
DROP POLICY IF EXISTS "View pix history" ON public.employee_pix_history;
CREATE POLICY "View pix history"
ON public.employee_pix_history FOR SELECT
USING (
  employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  OR (public.is_admin_or_manager(auth.uid()) AND company_id = public.get_user_company_id(auth.uid()))
  OR public.is_master_user(auth.uid())
);

-- ---------------------------------------------------------------------------
-- A ficha do funcionário só é editável pelo admin (policy antiga, mantida).
-- Estas duas funções são a porta estreita para o PRÓPRIO funcionário cuidar da
-- sua chave PIX pelo app — e só dela.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_my_pix_key(
  p_key TEXT,
  p_type TEXT,
  p_owner_name TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id FROM public.employees WHERE user_id = auth.uid();
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Funcionário não encontrado.';
  END IF;
  IF COALESCE(TRIM(p_key), '') = '' THEN
    RAISE EXCEPTION 'Informe a chave PIX.';
  END IF;
  IF p_type NOT IN ('cpf', 'cnpj', 'phone', 'email', 'random') THEN
    RAISE EXCEPTION 'Tipo de chave PIX inválido.';
  END IF;

  -- O trigger track_employee_pix registra o histórico e a autoria.
  UPDATE public.employees
     SET pix_key = TRIM(p_key),
         pix_key_type = p_type,
         pix_key_owner_name = NULLIF(TRIM(COALESCE(p_owner_name, '')), '')
   WHERE id = v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Confirmação sem mudança: fica registrado que, naquela data, o próprio
-- funcionário disse que a chave cadastrada era a dele.
CREATE OR REPLACE FUNCTION public.confirm_my_pix_key()
RETURNS VOID AS $$
DECLARE
  v_emp RECORD;
BEGIN
  SELECT id, company_id, pix_key, pix_key_type, pix_key_owner_name
    INTO v_emp
    FROM public.employees
   WHERE user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Funcionário não encontrado.';
  END IF;
  IF COALESCE(v_emp.pix_key, '') = '' THEN
    RAISE EXCEPTION 'Nenhuma chave PIX cadastrada para confirmar.';
  END IF;

  UPDATE public.employees SET pix_key_confirmed_at = now() WHERE id = v_emp.id;

  INSERT INTO public.employee_pix_history (
    company_id, employee_id, pix_key, pix_key_type, pix_key_owner_name,
    changed_by, changed_by_self, confirmation
  ) VALUES (
    v_emp.company_id, v_emp.id, v_emp.pix_key, v_emp.pix_key_type, v_emp.pix_key_owner_name,
    auth.uid(), true, true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.set_my_pix_key(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_my_pix_key() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_my_pix_key(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_my_pix_key() TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) Regras da empresa
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.advance_config (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  allow_vale BOOLEAN NOT NULL DEFAULT true,
  allow_adiantamento BOOLEAN NOT NULL DEFAULT true,
  -- Teto por pedido em R$ (NULL = sem teto)
  max_amount NUMERIC(12,2),
  -- Teto somado no mês em R$ (NULL = sem teto)
  max_total_per_month NUMERIC(12,2),
  -- Quantos pedidos por mês (0 = sem limite)
  max_requests_per_month INTEGER NOT NULL DEFAULT 1,
  -- Carência em dias entre um pedido e o próximo (0 = sem carência)
  min_days_between INTEGER NOT NULL DEFAULT 0,
  -- Janela do mês em que é permitido pedir (NULL/NULL = qualquer dia)
  window_day_from INTEGER,
  window_day_to INTEGER,
  require_reason BOOLEAN NOT NULL DEFAULT true,
  max_installments INTEGER NOT NULL DEFAULT 1,
  -- WhatsApp que recebe o pedido (vazio = telefone da empresa)
  notify_whatsapp TEXT,
  -- Texto livre com as regras, exibido para o funcionário no app
  rules_text TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT advance_window_valid CHECK (
    (window_day_from IS NULL AND window_day_to IS NULL)
    OR (window_day_from BETWEEN 1 AND 31 AND window_day_to BETWEEN 1 AND 31)
  )
);

ALTER TABLE public.advance_config ENABLE ROW LEVEL SECURITY;

-- O funcionário PRECISA ler a config (é o que libera e limita o formulário).
DROP POLICY IF EXISTS "View company advance config" ON public.advance_config;
CREATE POLICY "View company advance config"
ON public.advance_config FOR SELECT
USING (
  company_id = public.get_user_company_id(auth.uid())
  OR company_id IN (SELECT id FROM public.companies WHERE admin_user_id = auth.uid())
  OR public.is_master_user(auth.uid())
);

DROP POLICY IF EXISTS "Admins manage advance config" ON public.advance_config;
CREATE POLICY "Admins manage advance config"
ON public.advance_config FOR ALL
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

-- ---------------------------------------------------------------------------
-- 3) Pedidos
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.advance_kind AS ENUM ('vale', 'adiantamento');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.advance_status AS ENUM ('pending', 'approved', 'rejected', 'paid', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.advance_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  kind public.advance_kind NOT NULL DEFAULT 'vale',
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  installments INTEGER NOT NULL DEFAULT 1 CHECK (installments >= 1),
  reason TEXT,

  -- Chave PIX CONGELADA no momento do pedido: é a prova de qual chave estava
  -- valendo quando o pagamento foi pedido.
  pix_key TEXT,
  pix_key_type TEXT,
  pix_key_owner_name TEXT,

  status public.advance_status NOT NULL DEFAULT 'pending',
  approved_amount NUMERIC(12,2),      -- a empresa pode liberar menos do que foi pedido
  review_note TEXT,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  paid_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Lançamento criado no Financeiro ao marcar como pago
  financial_entry_id UUID REFERENCES public.financial_entries(id) ON DELETE SET NULL,
  notified_at TIMESTAMPTZ,            -- quando o WhatsApp do pedido saiu
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_advances_company
  ON public.advance_requests (company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_advances_employee
  ON public.advance_requests (employee_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Preenche company_id e a chave PIX no servidor, trava o estado inicial e
-- aplica as regras da empresa. Validar aqui (e não no front) é o que impede
-- um pedido fora das regras.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_advance_request()
RETURNS TRIGGER AS $$
DECLARE
  v_emp RECORD;
  v_cfg RECORD;
  v_is_admin BOOLEAN;
  v_day INTEGER;
  v_count INTEGER;
  v_total NUMERIC;
  v_last TIMESTAMPTZ;
BEGIN
  SELECT company_id, pix_key, pix_key_type, pix_key_owner_name
    INTO v_emp
    FROM public.employees
   WHERE id = NEW.employee_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Funcionário não encontrado.';
  END IF;

  NEW.company_id := v_emp.company_id;

  -- A chave vem SEMPRE da ficha — o front não escolhe o que gravar aqui.
  NEW.pix_key := v_emp.pix_key;
  NEW.pix_key_type := v_emp.pix_key_type;
  NEW.pix_key_owner_name := v_emp.pix_key_owner_name;

  v_is_admin := public.has_role(auth.uid(), 'admin'::user_role)
                OR public.is_master_user(auth.uid());

  IF NOT v_is_admin THEN
    NEW.status := 'pending';
    NEW.approved_amount := NULL;
    NEW.review_note := NULL;
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.paid_at := NULL;
    NEW.paid_by := NULL;
    NEW.financial_entry_id := NULL;
    NEW.notified_at := NULL;
  END IF;

  -- O admin lança em nome do funcionário sem passar pelos limites.
  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_cfg FROM public.advance_config WHERE company_id = NEW.company_id;

  IF NOT FOUND OR NOT v_cfg.enabled THEN
    RAISE EXCEPTION 'A empresa não liberou pedidos de vale/adiantamento.';
  END IF;

  IF NEW.kind = 'vale' AND NOT v_cfg.allow_vale THEN
    RAISE EXCEPTION 'A empresa não aceita pedidos de vale.';
  END IF;
  IF NEW.kind = 'adiantamento' AND NOT v_cfg.allow_adiantamento THEN
    RAISE EXCEPTION 'A empresa não aceita pedidos de adiantamento.';
  END IF;

  IF COALESCE(NEW.pix_key, '') = '' THEN
    RAISE EXCEPTION 'Cadastre sua chave PIX antes de pedir.';
  END IF;

  IF v_cfg.require_reason AND COALESCE(TRIM(NEW.reason), '') = '' THEN
    RAISE EXCEPTION 'Informe o motivo do pedido.';
  END IF;

  IF v_cfg.max_amount IS NOT NULL AND NEW.amount > v_cfg.max_amount THEN
    RAISE EXCEPTION 'Valor acima do limite por pedido (R$ %).', v_cfg.max_amount;
  END IF;

  IF NEW.installments > v_cfg.max_installments THEN
    RAISE EXCEPTION 'A empresa permite no máximo % parcela(s).', v_cfg.max_installments;
  END IF;

  -- Janela do mês. Se "de" > "até", a janela atravessa a virada do mês
  -- (ex.: do dia 25 ao dia 5).
  IF v_cfg.window_day_from IS NOT NULL AND v_cfg.window_day_to IS NOT NULL THEN
    v_day := EXTRACT(DAY FROM (now() AT TIME ZONE 'America/Sao_Paulo'))::INTEGER;
    IF v_cfg.window_day_from <= v_cfg.window_day_to THEN
      IF v_day < v_cfg.window_day_from OR v_day > v_cfg.window_day_to THEN
        RAISE EXCEPTION 'Pedidos são aceitos do dia % ao dia % de cada mês.',
          v_cfg.window_day_from, v_cfg.window_day_to;
      END IF;
    ELSE
      IF v_day < v_cfg.window_day_from AND v_day > v_cfg.window_day_to THEN
        RAISE EXCEPTION 'Pedidos são aceitos do dia % ao dia % de cada mês.',
          v_cfg.window_day_from, v_cfg.window_day_to;
      END IF;
    END IF;
  END IF;

  -- Pedidos recusados/cancelados não consomem a cota do mês.
  SELECT COUNT(*), COALESCE(SUM(COALESCE(approved_amount, amount)), 0), MAX(created_at)
    INTO v_count, v_total, v_last
    FROM public.advance_requests
   WHERE employee_id = NEW.employee_id
     AND status IN ('pending', 'approved', 'paid')
     AND date_trunc('month', created_at AT TIME ZONE 'America/Sao_Paulo')
         = date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo');

  IF v_cfg.max_requests_per_month > 0 AND v_count >= v_cfg.max_requests_per_month THEN
    RAISE EXCEPTION 'Você já usou seus % pedido(s) deste mês.', v_cfg.max_requests_per_month;
  END IF;

  IF v_cfg.max_total_per_month IS NOT NULL
     AND v_total + NEW.amount > v_cfg.max_total_per_month THEN
    RAISE EXCEPTION 'O total do mês ficaria acima do limite de R$ % (você já tem R$ % em aberto).',
      v_cfg.max_total_per_month, v_total;
  END IF;

  IF v_cfg.min_days_between > 0 AND v_last IS NOT NULL
     AND v_last > now() - (v_cfg.min_days_between || ' days')::INTERVAL THEN
    RAISE EXCEPTION 'É preciso esperar % dia(s) entre um pedido e o próximo.', v_cfg.min_days_between;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS guard_advance_before_insert ON public.advance_requests;
CREATE TRIGGER guard_advance_before_insert
BEFORE INSERT ON public.advance_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_advance_request();

ALTER TABLE public.advance_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View own advances" ON public.advance_requests;
CREATE POLICY "View own advances"
ON public.advance_requests FOR SELECT
USING (
  employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  OR (public.is_admin_or_manager(auth.uid()) AND company_id = public.get_user_company_id(auth.uid()))
  OR company_id IN (SELECT id FROM public.companies WHERE admin_user_id = auth.uid())
  OR public.is_master_user(auth.uid())
);

DROP POLICY IF EXISTS "Create own advances" ON public.advance_requests;
CREATE POLICY "Create own advances"
ON public.advance_requests FOR INSERT
WITH CHECK (
  employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  OR (public.has_role(auth.uid(), 'admin'::user_role) AND (
    company_id = public.get_user_company_id(auth.uid())
    OR company_id IN (SELECT id FROM public.companies WHERE admin_user_id = auth.uid())
  ))
  OR public.is_master_user(auth.uid())
);

-- Aprovar / recusar / marcar como pago é do admin. O funcionário só pode
-- cancelar o PRÓPRIO pedido enquanto estiver pendente (o WITH CHECK garante
-- que ele não consegue se auto-aprovar).
DROP POLICY IF EXISTS "Review advances" ON public.advance_requests;
CREATE POLICY "Review advances"
ON public.advance_requests FOR UPDATE
USING (
  (public.has_role(auth.uid(), 'admin'::user_role) AND (
    company_id = public.get_user_company_id(auth.uid())
    OR company_id IN (SELECT id FROM public.companies WHERE admin_user_id = auth.uid())
  ))
  OR public.is_master_user(auth.uid())
  OR (status = 'pending' AND employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()))
)
WITH CHECK (
  (public.has_role(auth.uid(), 'admin'::user_role) AND (
    company_id = public.get_user_company_id(auth.uid())
    OR company_id IN (SELECT id FROM public.companies WHERE admin_user_id = auth.uid())
  ))
  OR public.is_master_user(auth.uid())
  OR (status = 'cancelled' AND employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()))
);

DROP POLICY IF EXISTS "Admins delete advances" ON public.advance_requests;
CREATE POLICY "Admins delete advances"
ON public.advance_requests FOR DELETE
USING (
  (public.has_role(auth.uid(), 'admin'::user_role) AND (
    company_id = public.get_user_company_id(auth.uid())
    OR company_id IN (SELECT id FROM public.companies WHERE admin_user_id = auth.uid())
  ))
  OR public.is_master_user(auth.uid())
);

-- Dinheiro entra na trilha de auditoria.
DROP TRIGGER IF EXISTS audit_advance_requests ON public.advance_requests;
CREATE TRIGGER audit_advance_requests
AFTER INSERT OR UPDATE OR DELETE ON public.advance_requests
FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
