-- Add email and phone columns to companies table
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS email text,
ADD COLUMN IF NOT EXISTS phone text,
ADD COLUMN IF NOT EXISTS admin_user_id uuid;