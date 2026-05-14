-- Adicionar campo para identificar registros manuais de ponto
ALTER TABLE public.clock_records 
ADD COLUMN is_manual BOOLEAN NOT NULL DEFAULT false;

-- Adicionar campo para registrar quem fez o registro manual
ALTER TABLE public.clock_records 
ADD COLUMN manual_registered_by UUID REFERENCES auth.users(id);

-- Adicionar campo para observação do registro manual
ALTER TABLE public.clock_records 
ADD COLUMN manual_observation TEXT;