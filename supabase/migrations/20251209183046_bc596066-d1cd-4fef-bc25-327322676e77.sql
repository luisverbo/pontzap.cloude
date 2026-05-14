-- Create employee_locations junction table
CREATE TABLE public.employee_locations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(employee_id, location_id)
);

-- Enable RLS
ALTER TABLE public.employee_locations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage employee_locations"
ON public.employee_locations
FOR ALL
USING (has_role(auth.uid(), 'admin'::user_role));

CREATE POLICY "Admins and managers can view employee_locations"
ON public.employee_locations
FOR SELECT
USING (is_admin_or_manager(auth.uid()));

CREATE POLICY "Employees can view their own location assignments"
ON public.employee_locations
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM employees 
  WHERE employees.id = employee_locations.employee_id 
  AND employees.user_id = auth.uid()
));

-- Create trigger to ensure only one primary location per employee
CREATE OR REPLACE FUNCTION public.ensure_single_primary_location()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_primary = true THEN
    UPDATE public.employee_locations 
    SET is_primary = false 
    WHERE employee_id = NEW.employee_id AND id != NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER ensure_single_primary_location_trigger
AFTER INSERT OR UPDATE ON public.employee_locations
FOR EACH ROW
EXECUTE FUNCTION public.ensure_single_primary_location();