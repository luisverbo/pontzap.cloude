-- ============================================================================
-- FUNCIONÁRIO SEM HORÁRIO FIXO ("horário livre")
-- Bate ponto normalmente e as horas continuam sendo medidas, mas não existe
-- jornada prevista: não gera atraso, não entra no banco de horas automático,
-- não recebe alerta de esquecimento e o almoço é livre (ele almoça nos
-- condomínios, em horário variável).
-- ============================================================================

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS flexible_schedule BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.employees.flexible_schedule IS
  'true = sem jornada fixa: ignora atraso, banco de horas automático e lembrete de ponto.';
