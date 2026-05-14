-- Add observation column to lateness_alerts table
ALTER TABLE public.lateness_alerts 
ADD COLUMN observation text;