-- Add daily rate field for substitute employees (folguistas)
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS valor_diaria NUMERIC(10,2);
