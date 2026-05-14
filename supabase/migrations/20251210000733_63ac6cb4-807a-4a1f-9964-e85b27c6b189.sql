-- Create table to store lateness check requests and employee responses
CREATE TABLE public.lateness_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  schedule_date date NOT NULL,
  scheduled_time time NOT NULL,
  alert_sent_at timestamp with time zone NOT NULL DEFAULT now(),
  response_type text, -- 'on_way' or 'absent' or null if no response
  response_at timestamp with time zone,
  response_notified boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.lateness_alerts ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Admins and managers can view all lateness alerts"
ON public.lateness_alerts FOR SELECT
USING (is_admin_or_manager(auth.uid()));

CREATE POLICY "Admins can manage lateness alerts"
ON public.lateness_alerts FOR ALL
USING (has_role(auth.uid(), 'admin'::user_role));

CREATE POLICY "Employees can view their own alerts"
ON public.lateness_alerts FOR SELECT
USING (EXISTS (
  SELECT 1 FROM employees 
  WHERE employees.id = lateness_alerts.employee_id 
  AND employees.user_id = auth.uid()
));

CREATE POLICY "Employees can update their own alerts (respond)"
ON public.lateness_alerts FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM employees 
  WHERE employees.id = lateness_alerts.employee_id 
  AND employees.user_id = auth.uid()
));

-- Index for faster lookups
CREATE INDEX idx_lateness_alerts_employee_date ON public.lateness_alerts(employee_id, schedule_date);
CREATE INDEX idx_lateness_alerts_pending ON public.lateness_alerts(id) WHERE response_type IS NULL;