-- Add requires_lunch column to punctual_schedules
ALTER TABLE public.punctual_schedules 
ADD COLUMN requires_lunch boolean NOT NULL DEFAULT true;

-- Add requires_lunch column to fixed_schedules
ALTER TABLE public.fixed_schedules 
ADD COLUMN requires_lunch boolean NOT NULL DEFAULT true;

-- Add comment to explain the column
COMMENT ON COLUMN public.punctual_schedules.requires_lunch IS 'Whether the employee needs to clock lunch breaks for this schedule';
COMMENT ON COLUMN public.fixed_schedules.requires_lunch IS 'Whether the employee needs to clock lunch breaks for this schedule';