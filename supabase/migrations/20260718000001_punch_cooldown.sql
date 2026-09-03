-- Intervalo mínimo entre duas batidas seguidas do mesmo funcionário.
-- Evita o toque acidental: quem acabou de registrar a Entrada não consegue
-- apertar Saída por engano no segundo seguinte. 0 desliga a trava.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS punch_cooldown_minutes INTEGER NOT NULL DEFAULT 15;

COMMENT ON COLUMN public.companies.punch_cooldown_minutes IS
  'Minutos que o funcionário precisa esperar entre uma batida e a próxima (0 = sem trava).';
