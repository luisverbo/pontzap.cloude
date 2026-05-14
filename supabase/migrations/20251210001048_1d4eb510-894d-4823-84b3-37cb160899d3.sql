-- Add phone/WhatsApp field to profiles table so we can send messages to employees
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS phone text;