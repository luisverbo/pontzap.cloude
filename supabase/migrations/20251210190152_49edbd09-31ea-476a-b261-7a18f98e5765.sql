-- Add schedule_type to fixed_schedules to support different schedule patterns
ALTER TABLE public.fixed_schedules 
ADD COLUMN IF NOT EXISTS schedule_type text NOT NULL DEFAULT 'regular';

-- Add lunch break times for 12x36 schedules
ALTER TABLE public.fixed_schedules
ADD COLUMN IF NOT EXISTS lunch_start_time time,
ADD COLUMN IF NOT EXISTS lunch_end_time time;

-- Add description/notes for schedule
ALTER TABLE public.fixed_schedules
ADD COLUMN IF NOT EXISTS notes text;

-- Create table for schedule templates (summer schedules, reinforcement, etc)
CREATE TABLE IF NOT EXISTS public.schedule_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  schedule_type text NOT NULL DEFAULT 'regular',
  start_date date,
  end_date date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on schedule_templates
ALTER TABLE public.schedule_templates ENABLE ROW LEVEL SECURITY;

-- RLS policies for schedule_templates
CREATE POLICY "Admins can manage schedule templates"
ON public.schedule_templates
FOR ALL
USING (has_role(auth.uid(), 'admin'::user_role));

CREATE POLICY "Admins and managers can view schedule templates"
ON public.schedule_templates
FOR SELECT
USING (is_admin_or_manager(auth.uid()));

-- Add template reference to fixed_schedules
ALTER TABLE public.fixed_schedules
ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.schedule_templates(id);

-- Create financial module tables
-- Income/entries table
CREATE TABLE IF NOT EXISTS public.financial_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  description text NOT NULL,
  category text NOT NULL,
  amount numeric(12,2) NOT NULL,
  entry_type text NOT NULL DEFAULT 'income',
  is_recurring boolean NOT NULL DEFAULT false,
  recurrence_type text,
  recurrence_day integer,
  due_date date,
  paid_date date,
  status text NOT NULL DEFAULT 'pending',
  client_name text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on financial_entries
ALTER TABLE public.financial_entries ENABLE ROW LEVEL SECURITY;

-- RLS policies for financial_entries
CREATE POLICY "Admins can manage financial entries"
ON public.financial_entries
FOR ALL
USING (has_role(auth.uid(), 'admin'::user_role));

CREATE POLICY "Admins and managers can view financial entries"
ON public.financial_entries
FOR SELECT
USING (is_admin_or_manager(auth.uid()));

-- Employee overtime settings
ALTER TABLE public.employees
ADD COLUMN IF NOT EXISTS overtime_rate numeric(10,2),
ADD COLUMN IF NOT EXISTS schedule_type text DEFAULT 'regular';

-- Create companies table for SaaS multi-tenancy
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  payment_status text DEFAULT 'pending',
  subscription_start_date date,
  subscription_end_date date,
  is_blocked boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on companies
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Create master users table (super admins)
CREATE TABLE IF NOT EXISTS public.master_users (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on master_users
ALTER TABLE public.master_users ENABLE ROW LEVEL SECURITY;

-- Function to check if user is master
CREATE OR REPLACE FUNCTION public.is_master_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.master_users
    WHERE user_id = _user_id
  )
$$;

-- RLS policy for companies (only master users)
CREATE POLICY "Master users can manage companies"
ON public.companies
FOR ALL
USING (is_master_user(auth.uid()));

CREATE POLICY "Master users can view companies"
ON public.companies
FOR SELECT
USING (is_master_user(auth.uid()));

-- RLS policy for master_users
CREATE POLICY "Master users can manage master_users"
ON public.master_users
FOR ALL
USING (is_master_user(auth.uid()));

CREATE POLICY "Master users can view master_users"
ON public.master_users
FOR SELECT
USING (is_master_user(auth.uid()));

-- Add company_id to relevant tables for multi-tenancy (optional, prepare for future)
ALTER TABLE public.employees
ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

ALTER TABLE public.locations
ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

ALTER TABLE public.financial_entries
ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

-- Create updated_at trigger for new tables
CREATE TRIGGER update_schedule_templates_updated_at
BEFORE UPDATE ON public.schedule_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_financial_entries_updated_at
BEFORE UPDATE ON public.financial_entries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_companies_updated_at
BEFORE UPDATE ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Comment for schedule types
COMMENT ON COLUMN public.fixed_schedules.schedule_type IS 'Types: regular, 12x36, summer, reinforcement';
COMMENT ON COLUMN public.employees.schedule_type IS 'Types: regular, 12x36, shift';