-- Add column to track if employee invitation was accepted
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS invitation_accepted BOOLEAN DEFAULT false;

-- Update existing employees who have logged in (have a confirmed email in auth.users) to mark invitation as accepted
-- We'll handle this logic in the edge function and hooks