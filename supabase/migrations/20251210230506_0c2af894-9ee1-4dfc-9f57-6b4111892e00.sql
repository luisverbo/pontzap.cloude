-- Create function to get user's company_id from employees table
CREATE OR REPLACE FUNCTION public.get_user_company_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id
  FROM public.employees
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- Create function to check if user belongs to company
CREATE OR REPLACE FUNCTION public.user_belongs_to_company(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees
    WHERE user_id = _user_id
      AND company_id = _company_id
  )
$$;

-- Drop existing policies and recreate with company isolation for employees table
DROP POLICY IF EXISTS "Admins and managers can view all employees" ON public.employees;
DROP POLICY IF EXISTS "Admins can manage employees" ON public.employees;

CREATE POLICY "Admins and managers can view company employees" 
ON public.employees 
FOR SELECT 
USING (
  is_admin_or_manager(auth.uid()) 
  AND (company_id IS NULL OR company_id = get_user_company_id(auth.uid()))
);

CREATE POLICY "Admins can manage company employees" 
ON public.employees 
FOR ALL 
USING (
  has_role(auth.uid(), 'admin'::user_role) 
  AND (company_id IS NULL OR company_id = get_user_company_id(auth.uid()))
);

-- Update clock_records policies with company isolation
DROP POLICY IF EXISTS "Admins and managers can view all clock records" ON public.clock_records;
DROP POLICY IF EXISTS "Admins can manage clock records" ON public.clock_records;

CREATE POLICY "Admins and managers can view company clock records" 
ON public.clock_records 
FOR SELECT 
USING (
  is_admin_or_manager(auth.uid()) 
  AND EXISTS (
    SELECT 1 FROM employees e 
    WHERE e.id = clock_records.employee_id 
    AND (e.company_id IS NULL OR e.company_id = get_user_company_id(auth.uid()))
  )
);

CREATE POLICY "Admins can manage company clock records" 
ON public.clock_records 
FOR ALL 
USING (
  has_role(auth.uid(), 'admin'::user_role) 
  AND EXISTS (
    SELECT 1 FROM employees e 
    WHERE e.id = clock_records.employee_id 
    AND (e.company_id IS NULL OR e.company_id = get_user_company_id(auth.uid()))
  )
);

-- Update fixed_schedules policies with company isolation
DROP POLICY IF EXISTS "Admins and managers can view all schedules" ON public.fixed_schedules;
DROP POLICY IF EXISTS "Admins can manage fixed schedules" ON public.fixed_schedules;

CREATE POLICY "Admins and managers can view company schedules" 
ON public.fixed_schedules 
FOR SELECT 
USING (
  is_admin_or_manager(auth.uid()) 
  AND EXISTS (
    SELECT 1 FROM employees e 
    WHERE e.id = fixed_schedules.employee_id 
    AND (e.company_id IS NULL OR e.company_id = get_user_company_id(auth.uid()))
  )
);

CREATE POLICY "Admins can manage company schedules" 
ON public.fixed_schedules 
FOR ALL 
USING (
  has_role(auth.uid(), 'admin'::user_role) 
  AND EXISTS (
    SELECT 1 FROM employees e 
    WHERE e.id = fixed_schedules.employee_id 
    AND (e.company_id IS NULL OR e.company_id = get_user_company_id(auth.uid()))
  )
);

-- Update punctual_schedules policies with company isolation
DROP POLICY IF EXISTS "Admins and managers can view all punctual schedules" ON public.punctual_schedules;
DROP POLICY IF EXISTS "Admins can manage punctual schedules" ON public.punctual_schedules;

CREATE POLICY "Admins and managers can view company punctual schedules" 
ON public.punctual_schedules 
FOR SELECT 
USING (
  is_admin_or_manager(auth.uid()) 
  AND EXISTS (
    SELECT 1 FROM employees e 
    WHERE e.id = punctual_schedules.employee_id 
    AND (e.company_id IS NULL OR e.company_id = get_user_company_id(auth.uid()))
  )
);

CREATE POLICY "Admins can manage company punctual schedules" 
ON public.punctual_schedules 
FOR ALL 
USING (
  has_role(auth.uid(), 'admin'::user_role) 
  AND EXISTS (
    SELECT 1 FROM employees e 
    WHERE e.id = punctual_schedules.employee_id 
    AND (e.company_id IS NULL OR e.company_id = get_user_company_id(auth.uid()))
  )
);

-- Update lateness_alerts policies with company isolation
DROP POLICY IF EXISTS "Admins and managers can view all lateness alerts" ON public.lateness_alerts;
DROP POLICY IF EXISTS "Admins can manage lateness alerts" ON public.lateness_alerts;

CREATE POLICY "Admins and managers can view company lateness alerts" 
ON public.lateness_alerts 
FOR SELECT 
USING (
  is_admin_or_manager(auth.uid()) 
  AND EXISTS (
    SELECT 1 FROM employees e 
    WHERE e.id = lateness_alerts.employee_id 
    AND (e.company_id IS NULL OR e.company_id = get_user_company_id(auth.uid()))
  )
);

CREATE POLICY "Admins can manage company lateness alerts" 
ON public.lateness_alerts 
FOR ALL 
USING (
  has_role(auth.uid(), 'admin'::user_role) 
  AND EXISTS (
    SELECT 1 FROM employees e 
    WHERE e.id = lateness_alerts.employee_id 
    AND (e.company_id IS NULL OR e.company_id = get_user_company_id(auth.uid()))
  )
);

-- Update employee_locations policies with company isolation
DROP POLICY IF EXISTS "Admins and managers can view employee_locations" ON public.employee_locations;
DROP POLICY IF EXISTS "Admins can manage employee_locations" ON public.employee_locations;

CREATE POLICY "Admins and managers can view company employee_locations" 
ON public.employee_locations 
FOR SELECT 
USING (
  is_admin_or_manager(auth.uid()) 
  AND EXISTS (
    SELECT 1 FROM employees e 
    WHERE e.id = employee_locations.employee_id 
    AND (e.company_id IS NULL OR e.company_id = get_user_company_id(auth.uid()))
  )
);

CREATE POLICY "Admins can manage company employee_locations" 
ON public.employee_locations 
FOR ALL 
USING (
  has_role(auth.uid(), 'admin'::user_role) 
  AND EXISTS (
    SELECT 1 FROM employees e 
    WHERE e.id = employee_locations.employee_id 
    AND (e.company_id IS NULL OR e.company_id = get_user_company_id(auth.uid()))
  )
);

-- Update locations policies with company isolation
DROP POLICY IF EXISTS "Admins can manage locations" ON public.locations;
DROP POLICY IF EXISTS "All authenticated users can view locations" ON public.locations;

CREATE POLICY "Users can view company locations" 
ON public.locations 
FOR SELECT 
USING (
  company_id IS NULL 
  OR company_id = get_user_company_id(auth.uid())
  OR is_master_user(auth.uid())
);

CREATE POLICY "Admins can manage company locations" 
ON public.locations 
FOR ALL 
USING (
  has_role(auth.uid(), 'admin'::user_role) 
  AND (company_id IS NULL OR company_id = get_user_company_id(auth.uid()))
);

-- Update financial_entries policies with company isolation
DROP POLICY IF EXISTS "Admins and managers can view financial entries" ON public.financial_entries;
DROP POLICY IF EXISTS "Admins can manage financial entries" ON public.financial_entries;

CREATE POLICY "Admins and managers can view company financial entries" 
ON public.financial_entries 
FOR SELECT 
USING (
  is_admin_or_manager(auth.uid()) 
  AND (company_id IS NULL OR company_id = get_user_company_id(auth.uid()))
);

CREATE POLICY "Admins can manage company financial entries" 
ON public.financial_entries 
FOR ALL 
USING (
  has_role(auth.uid(), 'admin'::user_role) 
  AND (company_id IS NULL OR company_id = get_user_company_id(auth.uid()))
);

-- Update profiles policies with company isolation for admins
DROP POLICY IF EXISTS "Admins and managers can view all profiles" ON public.profiles;

CREATE POLICY "Admins and managers can view company profiles" 
ON public.profiles 
FOR SELECT 
USING (
  auth.uid() = id
  OR (
    is_admin_or_manager(auth.uid()) 
    AND EXISTS (
      SELECT 1 FROM employees e 
      WHERE e.user_id = profiles.id 
      AND (e.company_id IS NULL OR e.company_id = get_user_company_id(auth.uid()))
    )
  )
  OR is_master_user(auth.uid())
);

-- Add company_id column to notification_recipients if not exists and add policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'notification_recipients' AND column_name = 'company_id'
  ) THEN
    ALTER TABLE public.notification_recipients ADD COLUMN company_id uuid REFERENCES public.companies(id);
  END IF;
END
$$;

-- Update notification_recipients policies with company isolation
DROP POLICY IF EXISTS "Admins and managers can view notification recipients" ON public.notification_recipients;
DROP POLICY IF EXISTS "Admins can manage notification recipients" ON public.notification_recipients;

CREATE POLICY "Admins and managers can view company notification recipients" 
ON public.notification_recipients 
FOR SELECT 
USING (
  is_admin_or_manager(auth.uid()) 
  AND (company_id IS NULL OR company_id = get_user_company_id(auth.uid()))
);

CREATE POLICY "Admins can manage company notification recipients" 
ON public.notification_recipients 
FOR ALL 
USING (
  has_role(auth.uid(), 'admin'::user_role) 
  AND (company_id IS NULL OR company_id = get_user_company_id(auth.uid()))
);