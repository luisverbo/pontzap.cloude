-- Quem cobre a folga (folguista) é opcional: a folga é escalada primeiro e o
-- folguista costuma ser arrumado só alguns dias antes. Fica nulo até lá.
ALTER TABLE public.day_offs
  ADD COLUMN IF NOT EXISTS substitute_id UUID REFERENCES public.employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_day_offs_substitute ON public.day_offs (substitute_id);
