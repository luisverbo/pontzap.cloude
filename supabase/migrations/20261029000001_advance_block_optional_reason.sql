-- ============================================================================
-- VALE / ADIANTAMENTO — ajustes
--  1) Motivo passa a ser OPCIONAL por padrão (a empresa ainda pode exigir).
--  2) Bloqueio por funcionário: liberado para todos por padrão; a empresa
--     bloqueia quem quiser. A trava é checada no banco, não só na tela.
-- ============================================================================

ALTER TABLE public.advance_config ALTER COLUMN require_reason SET DEFAULT false;

-- Empresas que salvaram a regra antes desta mudança herdaram "exigir motivo".
UPDATE public.advance_config SET require_reason = false WHERE require_reason = true;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS advance_blocked BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.employees.advance_blocked IS
  'true = a empresa bloqueou este funcionário de pedir vale/adiantamento pelo app.';

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
  SELECT company_id, pix_key, pix_key_type, pix_key_owner_name, advance_blocked
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

  IF v_emp.advance_blocked THEN
    RAISE EXCEPTION 'Pedidos de vale/adiantamento não estão liberados para você. Fale com a empresa.';
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
