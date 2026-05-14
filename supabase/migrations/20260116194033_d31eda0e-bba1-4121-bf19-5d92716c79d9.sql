-- Add plan column to companies table
ALTER TABLE public.companies 
ADD COLUMN plan text NOT NULL DEFAULT 'essencial';

-- Add plan limits columns
ALTER TABLE public.companies 
ADD COLUMN max_employees integer NOT NULL DEFAULT 10,
ADD COLUMN max_locations integer NOT NULL DEFAULT 5;

-- Update existing companies with default plan values
UPDATE public.companies SET plan = 'essencial', max_employees = 10, max_locations = 5 WHERE plan IS NULL OR plan = 'essencial';

-- Create a function to check employee limit
CREATE OR REPLACE FUNCTION public.check_employee_limit()
RETURNS TRIGGER AS $$
DECLARE
  current_count integer;
  max_limit integer;
BEGIN
  -- Get current employee count for the company
  SELECT COUNT(*) INTO current_count
  FROM public.employees
  WHERE company_id = NEW.company_id AND is_active = true;
  
  -- Get the company's max employee limit
  SELECT max_employees INTO max_limit
  FROM public.companies
  WHERE id = NEW.company_id;
  
  -- Check if limit is reached (for new employees only)
  IF TG_OP = 'INSERT' AND current_count >= max_limit THEN
    RAISE EXCEPTION 'Limite de funcionários atingido. Seu plano permite até % funcionários.', max_limit;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for employee limit
DROP TRIGGER IF EXISTS check_employee_limit_trigger ON public.employees;
CREATE TRIGGER check_employee_limit_trigger
BEFORE INSERT ON public.employees
FOR EACH ROW
EXECUTE FUNCTION public.check_employee_limit();

-- Create a function to check location limit
CREATE OR REPLACE FUNCTION public.check_location_limit()
RETURNS TRIGGER AS $$
DECLARE
  current_count integer;
  max_limit integer;
BEGIN
  -- Get current location count for the company
  SELECT COUNT(*) INTO current_count
  FROM public.locations
  WHERE company_id = NEW.company_id;
  
  -- Get the company's max location limit
  SELECT max_locations INTO max_limit
  FROM public.companies
  WHERE id = NEW.company_id;
  
  -- Check if limit is reached (for new locations only)
  IF TG_OP = 'INSERT' AND current_count >= max_limit THEN
    RAISE EXCEPTION 'Limite de locais atingido. Seu plano permite até % locais.', max_limit;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for location limit
DROP TRIGGER IF EXISTS check_location_limit_trigger ON public.locations;
CREATE TRIGGER check_location_limit_trigger
BEFORE INSERT ON public.locations
FOR EACH ROW
EXECUTE FUNCTION public.check_location_limit();