-- Add overtime compensation mode and tracking fields to employees
ALTER TABLE public.employees 
ADD COLUMN IF NOT EXISTS overtime_compensation_mode text DEFAULT 'cash' CHECK (overtime_compensation_mode IN ('cash', 'time_off')),
ADD COLUMN IF NOT EXISTS accumulated_overtime_minutes integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS time_off_days_taken numeric DEFAULT 0;

-- Add comment explaining the fields
COMMENT ON COLUMN public.employees.overtime_compensation_mode IS 'How overtime is compensated: cash (payment) or time_off (compensatory time)';
COMMENT ON COLUMN public.employees.accumulated_overtime_minutes IS 'Total accumulated overtime minutes for time-off compensation';
COMMENT ON COLUMN public.employees.time_off_days_taken IS 'Number of compensatory days off already taken';