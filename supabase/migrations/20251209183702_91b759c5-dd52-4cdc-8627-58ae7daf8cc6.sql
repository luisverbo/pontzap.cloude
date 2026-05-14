-- Add work schedule configuration to employees
ALTER TABLE public.employees 
ADD COLUMN IF NOT EXISTS work_start_time time DEFAULT '08:00:00',
ADD COLUMN IF NOT EXISTS work_end_time time DEFAULT '17:00:00',
ADD COLUMN IF NOT EXISTS lunch_duration_minutes integer DEFAULT 60,
ADD COLUMN IF NOT EXISTS count_early_entry_as_extra boolean DEFAULT false;

-- Add index for faster duplicate detection
CREATE INDEX IF NOT EXISTS idx_clock_records_employee_timestamp 
ON public.clock_records (employee_id, timestamp);

-- Function to check for duplicate clock records (within 5 minutes)
CREATE OR REPLACE FUNCTION public.check_duplicate_clock_record()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.clock_records
    WHERE employee_id = NEW.employee_id
    AND type = NEW.type
    AND location_id = NEW.location_id
    AND timestamp BETWEEN NEW.timestamp - INTERVAL '5 minutes' AND NEW.timestamp + INTERVAL '5 minutes'
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) THEN
    RAISE EXCEPTION 'Registro duplicado detectado. Aguarde alguns minutos antes de registrar novamente.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to prevent duplicate records
DROP TRIGGER IF EXISTS prevent_duplicate_clock_record ON public.clock_records;
CREATE TRIGGER prevent_duplicate_clock_record
BEFORE INSERT ON public.clock_records
FOR EACH ROW
EXECUTE FUNCTION public.check_duplicate_clock_record();