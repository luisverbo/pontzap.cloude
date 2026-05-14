-- Add notification_days column to financial_entries for expense due date notifications
ALTER TABLE public.financial_entries 
ADD COLUMN IF NOT EXISTS notification_days integer DEFAULT 1;

-- Add notification_sent column to track if notification was sent
ALTER TABLE public.financial_entries 
ADD COLUMN IF NOT EXISTS notification_sent boolean DEFAULT false;

COMMENT ON COLUMN public.financial_entries.notification_days IS 'Days before due date to send notification (negative for days after)';
COMMENT ON COLUMN public.financial_entries.notification_sent IS 'Whether notification has been sent for this entry';