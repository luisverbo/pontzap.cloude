-- Add field to identify if recipient is a location admin/síndico
-- These recipients only receive clock-in notifications, NOT lateness alerts or employee responses
ALTER TABLE public.notification_recipients 
ADD COLUMN is_location_admin boolean NOT NULL DEFAULT false;

-- Add comment to explain the field
COMMENT ON COLUMN public.notification_recipients.is_location_admin IS 'If true, this recipient is a síndico/admin of the work location and should NOT receive lateness alerts or employee responses - only clock-in notifications (entry, lunch, exit)';