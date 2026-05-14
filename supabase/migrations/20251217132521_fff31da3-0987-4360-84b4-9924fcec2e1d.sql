-- Criar tabela de anotações de folguistas (dias trabalhados)
CREATE TABLE public.anotacoes_folguista (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  folguista_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  data_trabalho DATE NOT NULL,
  local_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  valor NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'a_pagar' CHECK (status IN ('a_pagar', 'pago')),
  observacao TEXT,
  financeiro_despesa_id UUID REFERENCES public.financial_entries(id) ON DELETE SET NULL,
  data_pagamento DATE,
  forma_pagamento TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.anotacoes_folguista ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins and managers can view company anotacoes" 
ON public.anotacoes_folguista 
FOR SELECT 
USING (
  is_admin_or_manager(auth.uid()) AND 
  ((company_id IS NULL) OR (company_id = get_user_company_id(auth.uid())))
);

CREATE POLICY "Admins can manage company anotacoes" 
ON public.anotacoes_folguista 
FOR ALL 
USING (
  has_role(auth.uid(), 'admin'::user_role) AND 
  ((company_id IS NULL) OR (company_id = get_user_company_id(auth.uid())))
);

-- Trigger para updated_at
CREATE TRIGGER update_anotacoes_folguista_updated_at
BEFORE UPDATE ON public.anotacoes_folguista
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index para performance
CREATE INDEX idx_anotacoes_folguista_company ON public.anotacoes_folguista(company_id);
CREATE INDEX idx_anotacoes_folguista_folguista ON public.anotacoes_folguista(folguista_id);
CREATE INDEX idx_anotacoes_folguista_status ON public.anotacoes_folguista(status);
CREATE INDEX idx_anotacoes_folguista_data ON public.anotacoes_folguista(data_trabalho);