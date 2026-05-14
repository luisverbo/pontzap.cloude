-- Adicionar campo cycle_start_date para escalas 12x36
-- Este campo define a data inicial do ciclo para calcular dias de trabalho/folga

ALTER TABLE public.fixed_schedules 
ADD COLUMN IF NOT EXISTS cycle_start_date date DEFAULT NULL;

-- Adicionar comentário explicativo
COMMENT ON COLUMN public.fixed_schedules.cycle_start_date IS 'Data inicial do ciclo para escalas 12x36. Usado para calcular automaticamente os dias de trabalho e folga.';