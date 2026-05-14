-- Create shift_swaps table for managing schedule exchanges between employees
CREATE TABLE public.shift_swaps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id),
  requester_employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  target_employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  requester_date DATE NOT NULL,
  target_date DATE NOT NULL,
  requester_start_time TIME NOT NULL DEFAULT '08:00:00',
  requester_end_time TIME NOT NULL DEFAULT '17:00:00',
  target_start_time TIME NOT NULL DEFAULT '08:00:00',
  target_end_time TIME NOT NULL DEFAULT '17:00:00',
  schedule_type TEXT NOT NULL DEFAULT 'punctual', -- 'punctual' or 'fixed'
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', 'approved', 'rejected', 'cancelled'
  target_accepted_at TIMESTAMP WITH TIME ZONE,
  admin_approved_at TIMESTAMP WITH TIME ZONE,
  admin_approved_by UUID,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.shift_swaps ENABLE ROW LEVEL SECURITY;

-- Employees can view swaps they're involved in
CREATE POLICY "Employees can view their own swaps"
ON public.shift_swaps
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM employees 
    WHERE employees.user_id = auth.uid() 
    AND (employees.id = shift_swaps.requester_employee_id OR employees.id = shift_swaps.target_employee_id)
  )
);

-- Employees can create swap requests
CREATE POLICY "Employees can create swap requests"
ON public.shift_swaps
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM employees 
    WHERE employees.user_id = auth.uid() 
    AND employees.id = shift_swaps.requester_employee_id
  )
);

-- Employees can update swaps they're target of (to accept/reject)
CREATE POLICY "Target employees can accept/reject swaps"
ON public.shift_swaps
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM employees 
    WHERE employees.user_id = auth.uid() 
    AND employees.id = shift_swaps.target_employee_id
  )
);

-- Requesters can cancel their own pending swaps
CREATE POLICY "Requesters can cancel their swaps"
ON public.shift_swaps
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM employees 
    WHERE employees.user_id = auth.uid() 
    AND employees.id = shift_swaps.requester_employee_id
  )
  AND status = 'pending'
);

-- Admins and managers can view company swaps
CREATE POLICY "Admins and managers can view company swaps"
ON public.shift_swaps
FOR SELECT
USING (
  is_admin_or_manager(auth.uid()) 
  AND (company_id IS NULL OR company_id = get_user_company_id(auth.uid()))
);

-- Admins can manage company swaps
CREATE POLICY "Admins can manage company swaps"
ON public.shift_swaps
FOR ALL
USING (
  has_role(auth.uid(), 'admin'::user_role) 
  AND (company_id IS NULL OR company_id = get_user_company_id(auth.uid()))
);

-- Create trigger for updated_at
CREATE TRIGGER update_shift_swaps_updated_at
BEFORE UPDATE ON public.shift_swaps
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();