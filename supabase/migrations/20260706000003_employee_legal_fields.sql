-- Phase 3 (compliance): complete employee master data required by the espelho
-- de ponto and future AFD export (PIS, CPF, admission date, role, department).
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS pis TEXT,
  ADD COLUMN IF NOT EXISTS cpf TEXT,
  ADD COLUMN IF NOT EXISTS admission_date DATE,
  ADD COLUMN IF NOT EXISTS position TEXT,
  ADD COLUMN IF NOT EXISTS department TEXT;
