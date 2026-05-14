-- Create table for grouping work days by period (month/year)
CREATE TABLE public.anotacoes_periodo (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  folguista_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id),
  periodo_mes INTEGER NOT NULL CHECK (periodo_mes >= 1 AND periodo_mes <= 12),
  periodo_ano INTEGER NOT NULL CHECK (periodo_ano >= 2020 AND periodo_ano <= 2099),
  observacao TEXT,
  status TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'fechado')),
  financeiro_despesa_id UUID REFERENCES public.financial_entries(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(folguista_id, periodo_mes, periodo_ano)
);

-- Add periodo_id to anotacoes_folguista for linking work days to periods
ALTER TABLE public.anotacoes_folguista 
ADD COLUMN periodo_id UUID REFERENCES public.anotacoes_periodo(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE public.anotacoes_periodo ENABLE ROW LEVEL SECURITY;

-- RLS Policies for anotacoes_periodo
CREATE POLICY "Admins and managers can view company anotacoes_periodo"
ON public.anotacoes_periodo
FOR SELECT
USING (
  is_admin_or_manager(auth.uid()) 
  AND ((company_id IS NULL) OR (company_id = get_user_company_id(auth.uid())))
);

CREATE POLICY "Admins can manage company anotacoes_periodo"
ON public.anotacoes_periodo
FOR ALL
USING (
  has_role(auth.uid(), 'admin'::user_role) 
  AND ((company_id IS NULL) OR (company_id = get_user_company_id(auth.uid())))
);

CREATE POLICY "Employees can view their own anotacoes_periodo"
ON public.anotacoes_periodo
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM employees
    WHERE employees.id = anotacoes_periodo.folguista_id
    AND employees.user_id = auth.uid()
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_anotacoes_periodo_updated_at
BEFORE UPDATE ON public.anotacoes_periodo
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();