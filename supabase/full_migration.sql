-- ==========================================
-- Migration: 20251209172258_7bcb3e29-c8db-4149-adf2-c3747b6b42d4.sql
-- ==========================================

-- Create enum types
CREATE TYPE public.user_role AS ENUM ('admin', 'manager', 'employee');
CREATE TYPE public.employee_type AS ENUM ('fixed', 'substitute');
CREATE TYPE public.clock_type AS ENUM ('entry', 'lunch_out', 'lunch_in', 'exit');
CREATE TYPE public.clock_method AS ENUM ('qr', 'gps');
CREATE TYPE public.notification_scope AS ENUM ('all', 'location', 'employee');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create user_roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role user_role NOT NULL DEFAULT 'employee',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Create locations table
CREATE TABLE public.locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  radius INTEGER NOT NULL DEFAULT 100,
  qr_code TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create employees table
CREATE TABLE public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type employee_type NOT NULL DEFAULT 'fixed',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

-- Create fixed_schedules table
CREATE TABLE public.fixed_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  location_id UUID REFERENCES public.locations(id) ON DELETE CASCADE NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  works BOOLEAN NOT NULL DEFAULT true,
  start_time TIME NOT NULL DEFAULT '08:00',
  end_time TIME NOT NULL DEFAULT '17:00',
  tolerance_minutes INTEGER NOT NULL DEFAULT 15,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, day_of_week)
);

-- Create punctual_schedules table
CREATE TABLE public.punctual_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  location_id UUID REFERENCES public.locations(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  start_time TIME NOT NULL DEFAULT '08:00',
  end_time TIME NOT NULL DEFAULT '17:00',
  tolerance_minutes INTEGER NOT NULL DEFAULT 15,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, date)
);

-- Create clock_records table
CREATE TABLE public.clock_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  location_id UUID REFERENCES public.locations(id) ON DELETE CASCADE NOT NULL,
  type clock_type NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  method clock_method NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create notification_recipients table
CREATE TABLE public.notification_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  receives_entry BOOLEAN NOT NULL DEFAULT true,
  receives_lunch_out BOOLEAN NOT NULL DEFAULT true,
  receives_lunch_in BOOLEAN NOT NULL DEFAULT true,
  receives_exit BOOLEAN NOT NULL DEFAULT true,
  receives_alerts BOOLEAN NOT NULL DEFAULT true,
  scope_type notification_scope NOT NULL DEFAULT 'all',
  scope_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixed_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.punctual_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clock_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_recipients ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role user_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create function to get user role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- Create function to check if user is admin or manager
CREATE OR REPLACE FUNCTION public.is_admin_or_manager(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'manager')
  )
$$;

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_locations_updated_at BEFORE UPDATE ON public.locations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_fixed_schedules_updated_at BEFORE UPDATE ON public.fixed_schedules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_punctual_schedules_updated_at BEFORE UPDATE ON public.punctual_schedules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_notification_recipients_updated_at BEFORE UPDATE ON public.notification_recipients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)), NEW.email);
  
  -- Assign default role as employee
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'employee');
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admins and managers can view all profiles" ON public.profiles FOR SELECT USING (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own role" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for locations
CREATE POLICY "All authenticated users can view locations" ON public.locations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage locations" ON public.locations FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for employees
CREATE POLICY "Users can view their own employee record" ON public.employees FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins and managers can view all employees" ON public.employees FOR SELECT USING (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "Admins can manage employees" ON public.employees FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for fixed_schedules
CREATE POLICY "Employees can view their own schedules" ON public.fixed_schedules FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.employees WHERE employees.id = fixed_schedules.employee_id AND employees.user_id = auth.uid())
);
CREATE POLICY "Admins and managers can view all schedules" ON public.fixed_schedules FOR SELECT USING (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "Admins can manage fixed schedules" ON public.fixed_schedules FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for punctual_schedules
CREATE POLICY "Employees can view their own punctual schedules" ON public.punctual_schedules FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.employees WHERE employees.id = punctual_schedules.employee_id AND employees.user_id = auth.uid())
);
CREATE POLICY "Admins and managers can view all punctual schedules" ON public.punctual_schedules FOR SELECT USING (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "Admins can manage punctual schedules" ON public.punctual_schedules FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for clock_records
CREATE POLICY "Employees can view their own clock records" ON public.clock_records FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.employees WHERE employees.id = clock_records.employee_id AND employees.user_id = auth.uid())
);
CREATE POLICY "Employees can insert their own clock records" ON public.clock_records FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.employees WHERE employees.id = clock_records.employee_id AND employees.user_id = auth.uid())
);
CREATE POLICY "Admins and managers can view all clock records" ON public.clock_records FOR SELECT USING (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "Admins can manage clock records" ON public.clock_records FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for notification_recipients
CREATE POLICY "Admins and managers can view notification recipients" ON public.notification_recipients FOR SELECT USING (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "Admins can manage notification recipients" ON public.notification_recipients FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Create indexes for performance
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_employees_user_id ON public.employees(user_id);
CREATE INDEX idx_fixed_schedules_employee_id ON public.fixed_schedules(employee_id);
CREATE INDEX idx_punctual_schedules_employee_id ON public.punctual_schedules(employee_id);
CREATE INDEX idx_punctual_schedules_date ON public.punctual_schedules(date);
CREATE INDEX idx_clock_records_employee_id ON public.clock_records(employee_id);
CREATE INDEX idx_clock_records_timestamp ON public.clock_records(timestamp);
CREATE INDEX idx_notification_recipients_scope ON public.notification_recipients(scope_type, scope_id);

-- ==========================================
-- Migration: 20251209172901_6d1142fd-9dde-4e65-842c-66bd1916dfd1.sql
-- ==========================================

-- Fix search_path for update_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ==========================================
-- Migration: 20251209175637_d175d860-7edf-46bf-841b-ae7c2fc094e8.sql
-- ==========================================
-- Add unique constraint on user_id column
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_unique UNIQUE (user_id);
-- ==========================================
-- Migration: 20251209183046_bc596066-d1cd-4fef-bc25-327322676e77.sql
-- ==========================================
-- Create employee_locations junction table
CREATE TABLE public.employee_locations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(employee_id, location_id)
);

-- Enable RLS
ALTER TABLE public.employee_locations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage employee_locations"
ON public.employee_locations
FOR ALL
USING (has_role(auth.uid(), 'admin'::user_role));

CREATE POLICY "Admins and managers can view employee_locations"
ON public.employee_locations
FOR SELECT
USING (is_admin_or_manager(auth.uid()));

CREATE POLICY "Employees can view their own location assignments"
ON public.employee_locations
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM employees 
  WHERE employees.id = employee_locations.employee_id 
  AND employees.user_id = auth.uid()
));

-- Create trigger to ensure only one primary location per employee
CREATE OR REPLACE FUNCTION public.ensure_single_primary_location()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_primary = true THEN
    UPDATE public.employee_locations 
    SET is_primary = false 
    WHERE employee_id = NEW.employee_id AND id != NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER ensure_single_primary_location_trigger
AFTER INSERT OR UPDATE ON public.employee_locations
FOR EACH ROW
EXECUTE FUNCTION public.ensure_single_primary_location();
-- ==========================================
-- Migration: 20251209183702_91b759c5-dd52-4cdc-8627-58ae7daf8cc6.sql
-- ==========================================
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
-- ==========================================
-- Migration: 20251209193057_aaddf16a-289f-4284-a451-97dc74ed4afb.sql
-- ==========================================
-- Add column to track if employee invitation was accepted
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS invitation_accepted BOOLEAN DEFAULT false;

-- Update existing employees who have logged in (have a confirmed email in auth.users) to mark invitation as accepted
-- We'll handle this logic in the edge function and hooks
-- ==========================================
-- Migration: 20251209220409_7445ca1f-fd32-4d71-aaca-5565158d3a7a.sql
-- ==========================================
-- Allow employees to update their own invitation_accepted status
CREATE POLICY "Employees can update their own invitation status"
ON public.employees
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
-- ==========================================
-- Migration: 20251209225621_3f3eb46d-bd78-47a7-a0cd-b115c8ff26d8.sql
-- ==========================================
-- Enable required extensions for cron jobs
-- (habilite pg_cron via Dashboard: Database → Extensions)
-- (habilite pg_net via Dashboard: Database → Extensions)
-- ==========================================
-- Migration: 20251210000319_5071fb41-1bcf-4fb4-8e72-7ad055a93406.sql
-- ==========================================
-- Add field to identify if recipient is a location admin/síndico
-- These recipients only receive clock-in notifications, NOT lateness alerts or employee responses
ALTER TABLE public.notification_recipients 
ADD COLUMN is_location_admin boolean NOT NULL DEFAULT false;

-- Add comment to explain the field
COMMENT ON COLUMN public.notification_recipients.is_location_admin IS 'If true, this recipient is a síndico/admin of the work location and should NOT receive lateness alerts or employee responses - only clock-in notifications (entry, lunch, exit)';
-- ==========================================
-- Migration: 20251210000733_63ac6cb4-807a-4a1f-9964-e85b27c6b189.sql
-- ==========================================
-- Create table to store lateness check requests and employee responses
CREATE TABLE public.lateness_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  schedule_date date NOT NULL,
  scheduled_time time NOT NULL,
  alert_sent_at timestamp with time zone NOT NULL DEFAULT now(),
  response_type text, -- 'on_way' or 'absent' or null if no response
  response_at timestamp with time zone,
  response_notified boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.lateness_alerts ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Admins and managers can view all lateness alerts"
ON public.lateness_alerts FOR SELECT
USING (is_admin_or_manager(auth.uid()));

CREATE POLICY "Admins can manage lateness alerts"
ON public.lateness_alerts FOR ALL
USING (has_role(auth.uid(), 'admin'::user_role));

CREATE POLICY "Employees can view their own alerts"
ON public.lateness_alerts FOR SELECT
USING (EXISTS (
  SELECT 1 FROM employees 
  WHERE employees.id = lateness_alerts.employee_id 
  AND employees.user_id = auth.uid()
));

CREATE POLICY "Employees can update their own alerts (respond)"
ON public.lateness_alerts FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM employees 
  WHERE employees.id = lateness_alerts.employee_id 
  AND employees.user_id = auth.uid()
));

-- Index for faster lookups
CREATE INDEX idx_lateness_alerts_employee_date ON public.lateness_alerts(employee_id, schedule_date);
CREATE INDEX idx_lateness_alerts_pending ON public.lateness_alerts(id) WHERE response_type IS NULL;
-- ==========================================
-- Migration: 20251210001048_1d4eb510-894d-4823-84b3-37cb160899d3.sql
-- ==========================================
-- Add phone/WhatsApp field to profiles table so we can send messages to employees
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS phone text;
-- ==========================================
-- Migration: 20251210190152_49edbd09-31ea-476a-b261-7a18f98e5765.sql
-- ==========================================
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
-- ==========================================
-- Migration: 20251210230506_0c2af894-9ee1-4dfc-9f57-6b4111892e00.sql
-- ==========================================
-- Create function to get user's company_id from employees table
CREATE OR REPLACE FUNCTION public.get_user_company_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id
  FROM public.employees
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- Create function to check if user belongs to company
CREATE OR REPLACE FUNCTION public.user_belongs_to_company(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees
    WHERE user_id = _user_id
      AND company_id = _company_id
  )
$$;

-- Drop existing policies and recreate with company isolation for employees table
DROP POLICY IF EXISTS "Admins and managers can view all employees" ON public.employees;
DROP POLICY IF EXISTS "Admins can manage employees" ON public.employees;

CREATE POLICY "Admins and managers can view company employees" 
ON public.employees 
FOR SELECT 
USING (
  is_admin_or_manager(auth.uid()) 
  AND (company_id IS NULL OR company_id = get_user_company_id(auth.uid()))
);

CREATE POLICY "Admins can manage company employees" 
ON public.employees 
FOR ALL 
USING (
  has_role(auth.uid(), 'admin'::user_role) 
  AND (company_id IS NULL OR company_id = get_user_company_id(auth.uid()))
);

-- Update clock_records policies with company isolation
DROP POLICY IF EXISTS "Admins and managers can view all clock records" ON public.clock_records;
DROP POLICY IF EXISTS "Admins can manage clock records" ON public.clock_records;

CREATE POLICY "Admins and managers can view company clock records" 
ON public.clock_records 
FOR SELECT 
USING (
  is_admin_or_manager(auth.uid()) 
  AND EXISTS (
    SELECT 1 FROM employees e 
    WHERE e.id = clock_records.employee_id 
    AND (e.company_id IS NULL OR e.company_id = get_user_company_id(auth.uid()))
  )
);

CREATE POLICY "Admins can manage company clock records" 
ON public.clock_records 
FOR ALL 
USING (
  has_role(auth.uid(), 'admin'::user_role) 
  AND EXISTS (
    SELECT 1 FROM employees e 
    WHERE e.id = clock_records.employee_id 
    AND (e.company_id IS NULL OR e.company_id = get_user_company_id(auth.uid()))
  )
);

-- Update fixed_schedules policies with company isolation
DROP POLICY IF EXISTS "Admins and managers can view all schedules" ON public.fixed_schedules;
DROP POLICY IF EXISTS "Admins can manage fixed schedules" ON public.fixed_schedules;

CREATE POLICY "Admins and managers can view company schedules" 
ON public.fixed_schedules 
FOR SELECT 
USING (
  is_admin_or_manager(auth.uid()) 
  AND EXISTS (
    SELECT 1 FROM employees e 
    WHERE e.id = fixed_schedules.employee_id 
    AND (e.company_id IS NULL OR e.company_id = get_user_company_id(auth.uid()))
  )
);

CREATE POLICY "Admins can manage company schedules" 
ON public.fixed_schedules 
FOR ALL 
USING (
  has_role(auth.uid(), 'admin'::user_role) 
  AND EXISTS (
    SELECT 1 FROM employees e 
    WHERE e.id = fixed_schedules.employee_id 
    AND (e.company_id IS NULL OR e.company_id = get_user_company_id(auth.uid()))
  )
);

-- Update punctual_schedules policies with company isolation
DROP POLICY IF EXISTS "Admins and managers can view all punctual schedules" ON public.punctual_schedules;
DROP POLICY IF EXISTS "Admins can manage punctual schedules" ON public.punctual_schedules;

CREATE POLICY "Admins and managers can view company punctual schedules" 
ON public.punctual_schedules 
FOR SELECT 
USING (
  is_admin_or_manager(auth.uid()) 
  AND EXISTS (
    SELECT 1 FROM employees e 
    WHERE e.id = punctual_schedules.employee_id 
    AND (e.company_id IS NULL OR e.company_id = get_user_company_id(auth.uid()))
  )
);

CREATE POLICY "Admins can manage company punctual schedules" 
ON public.punctual_schedules 
FOR ALL 
USING (
  has_role(auth.uid(), 'admin'::user_role) 
  AND EXISTS (
    SELECT 1 FROM employees e 
    WHERE e.id = punctual_schedules.employee_id 
    AND (e.company_id IS NULL OR e.company_id = get_user_company_id(auth.uid()))
  )
);

-- Update lateness_alerts policies with company isolation
DROP POLICY IF EXISTS "Admins and managers can view all lateness alerts" ON public.lateness_alerts;
DROP POLICY IF EXISTS "Admins can manage lateness alerts" ON public.lateness_alerts;

CREATE POLICY "Admins and managers can view company lateness alerts" 
ON public.lateness_alerts 
FOR SELECT 
USING (
  is_admin_or_manager(auth.uid()) 
  AND EXISTS (
    SELECT 1 FROM employees e 
    WHERE e.id = lateness_alerts.employee_id 
    AND (e.company_id IS NULL OR e.company_id = get_user_company_id(auth.uid()))
  )
);

CREATE POLICY "Admins can manage company lateness alerts" 
ON public.lateness_alerts 
FOR ALL 
USING (
  has_role(auth.uid(), 'admin'::user_role) 
  AND EXISTS (
    SELECT 1 FROM employees e 
    WHERE e.id = lateness_alerts.employee_id 
    AND (e.company_id IS NULL OR e.company_id = get_user_company_id(auth.uid()))
  )
);

-- Update employee_locations policies with company isolation
DROP POLICY IF EXISTS "Admins and managers can view employee_locations" ON public.employee_locations;
DROP POLICY IF EXISTS "Admins can manage employee_locations" ON public.employee_locations;

CREATE POLICY "Admins and managers can view company employee_locations" 
ON public.employee_locations 
FOR SELECT 
USING (
  is_admin_or_manager(auth.uid()) 
  AND EXISTS (
    SELECT 1 FROM employees e 
    WHERE e.id = employee_locations.employee_id 
    AND (e.company_id IS NULL OR e.company_id = get_user_company_id(auth.uid()))
  )
);

CREATE POLICY "Admins can manage company employee_locations" 
ON public.employee_locations 
FOR ALL 
USING (
  has_role(auth.uid(), 'admin'::user_role) 
  AND EXISTS (
    SELECT 1 FROM employees e 
    WHERE e.id = employee_locations.employee_id 
    AND (e.company_id IS NULL OR e.company_id = get_user_company_id(auth.uid()))
  )
);

-- Update locations policies with company isolation
DROP POLICY IF EXISTS "Admins can manage locations" ON public.locations;
DROP POLICY IF EXISTS "All authenticated users can view locations" ON public.locations;

CREATE POLICY "Users can view company locations" 
ON public.locations 
FOR SELECT 
USING (
  company_id IS NULL 
  OR company_id = get_user_company_id(auth.uid())
  OR is_master_user(auth.uid())
);

CREATE POLICY "Admins can manage company locations" 
ON public.locations 
FOR ALL 
USING (
  has_role(auth.uid(), 'admin'::user_role) 
  AND (company_id IS NULL OR company_id = get_user_company_id(auth.uid()))
);

-- Update financial_entries policies with company isolation
DROP POLICY IF EXISTS "Admins and managers can view financial entries" ON public.financial_entries;
DROP POLICY IF EXISTS "Admins can manage financial entries" ON public.financial_entries;

CREATE POLICY "Admins and managers can view company financial entries" 
ON public.financial_entries 
FOR SELECT 
USING (
  is_admin_or_manager(auth.uid()) 
  AND (company_id IS NULL OR company_id = get_user_company_id(auth.uid()))
);

CREATE POLICY "Admins can manage company financial entries" 
ON public.financial_entries 
FOR ALL 
USING (
  has_role(auth.uid(), 'admin'::user_role) 
  AND (company_id IS NULL OR company_id = get_user_company_id(auth.uid()))
);

-- Update profiles policies with company isolation for admins
DROP POLICY IF EXISTS "Admins and managers can view all profiles" ON public.profiles;

CREATE POLICY "Admins and managers can view company profiles" 
ON public.profiles 
FOR SELECT 
USING (
  auth.uid() = id
  OR (
    is_admin_or_manager(auth.uid()) 
    AND EXISTS (
      SELECT 1 FROM employees e 
      WHERE e.user_id = profiles.id 
      AND (e.company_id IS NULL OR e.company_id = get_user_company_id(auth.uid()))
    )
  )
  OR is_master_user(auth.uid())
);

-- Add company_id column to notification_recipients if not exists and add policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'notification_recipients' AND column_name = 'company_id'
  ) THEN
    ALTER TABLE public.notification_recipients ADD COLUMN company_id uuid REFERENCES public.companies(id);
  END IF;
END
$$;

-- Update notification_recipients policies with company isolation
DROP POLICY IF EXISTS "Admins and managers can view notification recipients" ON public.notification_recipients;
DROP POLICY IF EXISTS "Admins can manage notification recipients" ON public.notification_recipients;

CREATE POLICY "Admins and managers can view company notification recipients" 
ON public.notification_recipients 
FOR SELECT 
USING (
  is_admin_or_manager(auth.uid()) 
  AND (company_id IS NULL OR company_id = get_user_company_id(auth.uid()))
);

CREATE POLICY "Admins can manage company notification recipients" 
ON public.notification_recipients 
FOR ALL 
USING (
  has_role(auth.uid(), 'admin'::user_role) 
  AND (company_id IS NULL OR company_id = get_user_company_id(auth.uid()))
);
-- ==========================================
-- Migration: 20251211000714_9ddbdf8e-b17e-43d0-9233-523b33fc4b28.sql
-- ==========================================
-- Add notification_days column to financial_entries for expense due date notifications
ALTER TABLE public.financial_entries 
ADD COLUMN IF NOT EXISTS notification_days integer DEFAULT 1;

-- Add notification_sent column to track if notification was sent
ALTER TABLE public.financial_entries 
ADD COLUMN IF NOT EXISTS notification_sent boolean DEFAULT false;

COMMENT ON COLUMN public.financial_entries.notification_days IS 'Days before due date to send notification (negative for days after)';
COMMENT ON COLUMN public.financial_entries.notification_sent IS 'Whether notification has been sent for this entry';
-- ==========================================
-- Migration: 20251211150641_a2bdd7cb-c8ea-4d83-808f-7dfc635c495b.sql
-- ==========================================
-- Add overtime compensation mode and tracking fields to employees
ALTER TABLE public.employees 
ADD COLUMN IF NOT EXISTS overtime_compensation_mode text DEFAULT 'cash' CHECK (overtime_compensation_mode IN ('cash', 'time_off')),
ADD COLUMN IF NOT EXISTS accumulated_overtime_minutes integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS time_off_days_taken numeric DEFAULT 0;

-- Add comment explaining the fields
COMMENT ON COLUMN public.employees.overtime_compensation_mode IS 'How overtime is compensated: cash (payment) or time_off (compensatory time)';
COMMENT ON COLUMN public.employees.accumulated_overtime_minutes IS 'Total accumulated overtime minutes for time-off compensation';
COMMENT ON COLUMN public.employees.time_off_days_taken IS 'Number of compensatory days off already taken';
-- ==========================================
-- Migration: 20251211191452_2b003b47-5c83-416f-8cc2-513117fe96f4.sql
-- ==========================================
-- Add email and phone columns to companies table
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS email text,
ADD COLUMN IF NOT EXISTS phone text,
ADD COLUMN IF NOT EXISTS admin_user_id uuid;
-- ==========================================
-- Migration: 20251211193133_c7364491-e013-4aa6-a1f6-6c2ba51cc1a8.sql
-- ==========================================
-- Add observation column to lateness_alerts table
ALTER TABLE public.lateness_alerts 
ADD COLUMN observation text;
-- ==========================================
-- Migration: 20251217124223_bae0a34a-160d-44c5-bbdd-e13d9bf70dd4.sql
-- ==========================================
-- Adicionar campo cycle_start_date para escalas 12x36
-- Este campo define a data inicial do ciclo para calcular dias de trabalho/folga

ALTER TABLE public.fixed_schedules 
ADD COLUMN IF NOT EXISTS cycle_start_date date DEFAULT NULL;

-- Adicionar comentário explicativo
COMMENT ON COLUMN public.fixed_schedules.cycle_start_date IS 'Data inicial do ciclo para escalas 12x36. Usado para calcular automaticamente os dias de trabalho e folga.';
-- ==========================================
-- Migration: 20251217132521_fff31da3-0987-4360-84b4-9924fcec2e1d.sql
-- ==========================================
-- Criar tabela de anotações de folguistas (dias trabalhados)
CREATE TABLE public.anotacoes_folguista (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  folguista_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  data_trabalho DATE NOT NULL,
  local_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  valor NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'a_pagar' CHECK (status IN ('a_pagar', 'pago')),
  observacao TEXT,
  financeiro_despesa_id UUID REFERENCES public.financial_entries(id) ON DELETE SET NULL,
  data_pagamento DATE,
  forma_pagamento TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.anotacoes_folguista ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins and managers can view company anotacoes" 
ON public.anotacoes_folguista 
FOR SELECT 
USING (
  is_admin_or_manager(auth.uid()) AND 
  ((company_id IS NULL) OR (company_id = get_user_company_id(auth.uid())))
);

CREATE POLICY "Admins can manage company anotacoes" 
ON public.anotacoes_folguista 
FOR ALL 
USING (
  has_role(auth.uid(), 'admin'::user_role) AND 
  ((company_id IS NULL) OR (company_id = get_user_company_id(auth.uid())))
);

-- Trigger para updated_at
CREATE TRIGGER update_anotacoes_folguista_updated_at
BEFORE UPDATE ON public.anotacoes_folguista
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index para performance
CREATE INDEX idx_anotacoes_folguista_company ON public.anotacoes_folguista(company_id);
CREATE INDEX idx_anotacoes_folguista_folguista ON public.anotacoes_folguista(folguista_id);
CREATE INDEX idx_anotacoes_folguista_status ON public.anotacoes_folguista(status);
CREATE INDEX idx_anotacoes_folguista_data ON public.anotacoes_folguista(data_trabalho);
-- ==========================================
-- Migration: 20251217134518_be01e07f-ffc7-44fd-b32c-7c18872ef160.sql
-- ==========================================
-- Allow employees to view their own anotacoes (work entries)
CREATE POLICY "Employees can view their own anotacoes"
ON public.anotacoes_folguista
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM employees
    WHERE employees.id = anotacoes_folguista.folguista_id
    AND employees.user_id = auth.uid()
  )
);
-- ==========================================
-- Migration: 20251217152730_f0499132-6ae3-4671-9582-271e3f083045.sql
-- ==========================================
-- Create table for grouping work days by period (month/year)
CREATE TABLE public.anotacoes_periodo (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  folguista_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id),
  periodo_mes INTEGER NOT NULL CHECK (periodo_mes >= 1 AND periodo_mes <= 12),
  periodo_ano INTEGER NOT NULL CHECK (periodo_ano >= 2020 AND periodo_ano <= 2099),
  observacao TEXT,
  status TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'fechado')),
  financeiro_despesa_id UUID REFERENCES public.financial_entries(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(folguista_id, periodo_mes, periodo_ano)
);

-- Add periodo_id to anotacoes_folguista for linking work days to periods
ALTER TABLE public.anotacoes_folguista 
ADD COLUMN periodo_id UUID REFERENCES public.anotacoes_periodo(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE public.anotacoes_periodo ENABLE ROW LEVEL SECURITY;

-- RLS Policies for anotacoes_periodo
CREATE POLICY "Admins and managers can view company anotacoes_periodo"
ON public.anotacoes_periodo
FOR SELECT
USING (
  is_admin_or_manager(auth.uid()) 
  AND ((company_id IS NULL) OR (company_id = get_user_company_id(auth.uid())))
);

CREATE POLICY "Admins can manage company anotacoes_periodo"
ON public.anotacoes_periodo
FOR ALL
USING (
  has_role(auth.uid(), 'admin'::user_role) 
  AND ((company_id IS NULL) OR (company_id = get_user_company_id(auth.uid())))
);

CREATE POLICY "Employees can view their own anotacoes_periodo"
ON public.anotacoes_periodo
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM employees
    WHERE employees.id = anotacoes_periodo.folguista_id
    AND employees.user_id = auth.uid()
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_anotacoes_periodo_updated_at
BEFORE UPDATE ON public.anotacoes_periodo
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
-- ==========================================
-- Migration: 20251219135756_e3826e1e-992d-488f-8a96-d69ad68e7cfa.sql
-- ==========================================
-- Create shift_swaps table for managing schedule exchanges between employees
CREATE TABLE public.shift_swaps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id),
  requester_employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  target_employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  requester_date DATE NOT NULL,
  target_date DATE NOT NULL,
  requester_start_time TIME NOT NULL DEFAULT '08:00:00',
  requester_end_time TIME NOT NULL DEFAULT '17:00:00',
  target_start_time TIME NOT NULL DEFAULT '08:00:00',
  target_end_time TIME NOT NULL DEFAULT '17:00:00',
  schedule_type TEXT NOT NULL DEFAULT 'punctual', -- 'punctual' or 'fixed'
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', 'approved', 'rejected', 'cancelled'
  target_accepted_at TIMESTAMP WITH TIME ZONE,
  admin_approved_at TIMESTAMP WITH TIME ZONE,
  admin_approved_by UUID,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.shift_swaps ENABLE ROW LEVEL SECURITY;

-- Employees can view swaps they're involved in
CREATE POLICY "Employees can view their own swaps"
ON public.shift_swaps
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM employees 
    WHERE employees.user_id = auth.uid() 
    AND (employees.id = shift_swaps.requester_employee_id OR employees.id = shift_swaps.target_employee_id)
  )
);

-- Employees can create swap requests
CREATE POLICY "Employees can create swap requests"
ON public.shift_swaps
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM employees 
    WHERE employees.user_id = auth.uid() 
    AND employees.id = shift_swaps.requester_employee_id
  )
);

-- Employees can update swaps they're target of (to accept/reject)
CREATE POLICY "Target employees can accept/reject swaps"
ON public.shift_swaps
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM employees 
    WHERE employees.user_id = auth.uid() 
    AND employees.id = shift_swaps.target_employee_id
  )
);

-- Requesters can cancel their own pending swaps
CREATE POLICY "Requesters can cancel their swaps"
ON public.shift_swaps
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM employees 
    WHERE employees.user_id = auth.uid() 
    AND employees.id = shift_swaps.requester_employee_id
  )
  AND status = 'pending'
);

-- Admins and managers can view company swaps
CREATE POLICY "Admins and managers can view company swaps"
ON public.shift_swaps
FOR SELECT
USING (
  is_admin_or_manager(auth.uid()) 
  AND (company_id IS NULL OR company_id = get_user_company_id(auth.uid()))
);

-- Admins can manage company swaps
CREATE POLICY "Admins can manage company swaps"
ON public.shift_swaps
FOR ALL
USING (
  has_role(auth.uid(), 'admin'::user_role) 
  AND (company_id IS NULL OR company_id = get_user_company_id(auth.uid()))
);

-- Create trigger for updated_at
CREATE TRIGGER update_shift_swaps_updated_at
BEFORE UPDATE ON public.shift_swaps
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
-- ==========================================
-- Migration: 20251219141612_c94bacbf-e209-43fd-9e8b-76b5b25616e7.sql
-- ==========================================
-- Add requires_lunch column to punctual_schedules
ALTER TABLE public.punctual_schedules 
ADD COLUMN requires_lunch boolean NOT NULL DEFAULT true;

-- Add requires_lunch column to fixed_schedules
ALTER TABLE public.fixed_schedules 
ADD COLUMN requires_lunch boolean NOT NULL DEFAULT true;

-- Add comment to explain the column
COMMENT ON COLUMN public.punctual_schedules.requires_lunch IS 'Whether the employee needs to clock lunch breaks for this schedule';
COMMENT ON COLUMN public.fixed_schedules.requires_lunch IS 'Whether the employee needs to clock lunch breaks for this schedule';
-- ==========================================
-- Migration: 20251224112138_8468bca6-fa75-4b55-9a3e-82a4b082af60.sql
-- ==========================================
-- Adicionar campo para identificar registros manuais de ponto
ALTER TABLE public.clock_records 
ADD COLUMN is_manual BOOLEAN NOT NULL DEFAULT false;

-- Adicionar campo para registrar quem fez o registro manual
ALTER TABLE public.clock_records 
ADD COLUMN manual_registered_by UUID REFERENCES auth.users(id);

-- Adicionar campo para observação do registro manual
ALTER TABLE public.clock_records 
ADD COLUMN manual_observation TEXT;
-- ==========================================
-- Migration: 20260116171427_4db96c89-5b43-4740-a7dd-13415ccb4fea.sql
-- ==========================================

-- Step 1: Create a company for the master user's data (legacy data)
INSERT INTO companies (id, name, status, payment_status, admin_user_id)
VALUES ('00000000-0000-0000-0000-000000000001', 'PontZap Master', 'active', 'paid', NULL)
ON CONFLICT (id) DO NOTHING;

-- Step 2: Associate orphan employees (without company_id) to the master company
UPDATE employees 
SET company_id = '00000000-0000-0000-0000-000000000001'
WHERE company_id IS NULL;

-- Step 3: Associate orphan locations (without company_id) to the master company
UPDATE locations 
SET company_id = '00000000-0000-0000-0000-000000000001'
WHERE company_id IS NULL;

-- Step 4: Update RLS policies for employees to REQUIRE company_id match
DROP POLICY IF EXISTS "Admins and managers can view company employees" ON employees;
CREATE POLICY "Admins and managers can view company employees" 
ON employees FOR SELECT 
USING (
  (is_admin_or_manager(auth.uid()) AND company_id = get_user_company_id(auth.uid()))
  OR is_master_user(auth.uid())
);

DROP POLICY IF EXISTS "Admins can manage company employees" ON employees;
CREATE POLICY "Admins can manage company employees" 
ON employees FOR ALL 
USING (
  (has_role(auth.uid(), 'admin'::user_role) AND company_id = get_user_company_id(auth.uid()))
  OR is_master_user(auth.uid())
);

-- Step 5: Update RLS policies for locations to REQUIRE company_id match
DROP POLICY IF EXISTS "Users can view company locations" ON locations;
CREATE POLICY "Users can view company locations" 
ON locations FOR SELECT 
USING (
  company_id = get_user_company_id(auth.uid())
  OR is_master_user(auth.uid())
);

DROP POLICY IF EXISTS "Admins can manage company locations" ON locations;
CREATE POLICY "Admins can manage company locations" 
ON locations FOR ALL 
USING (
  (has_role(auth.uid(), 'admin'::user_role) AND company_id = get_user_company_id(auth.uid()))
  OR is_master_user(auth.uid())
);

-- Step 6: Update RLS policies for clock_records
DROP POLICY IF EXISTS "Admins and managers can view company clock records" ON clock_records;
CREATE POLICY "Admins and managers can view company clock records" 
ON clock_records FOR SELECT 
USING (
  (is_admin_or_manager(auth.uid()) AND EXISTS (
    SELECT 1 FROM employees e 
    WHERE e.id = clock_records.employee_id 
    AND e.company_id = get_user_company_id(auth.uid())
  ))
  OR is_master_user(auth.uid())
);

DROP POLICY IF EXISTS "Admins can manage company clock records" ON clock_records;
CREATE POLICY "Admins can manage company clock records" 
ON clock_records FOR ALL 
USING (
  (has_role(auth.uid(), 'admin'::user_role) AND EXISTS (
    SELECT 1 FROM employees e 
    WHERE e.id = clock_records.employee_id 
    AND e.company_id = get_user_company_id(auth.uid())
  ))
  OR is_master_user(auth.uid())
);

-- Step 7: Update RLS policies for fixed_schedules
DROP POLICY IF EXISTS "Admins and managers can view company schedules" ON fixed_schedules;
CREATE POLICY "Admins and managers can view company schedules" 
ON fixed_schedules FOR SELECT 
USING (
  (is_admin_or_manager(auth.uid()) AND EXISTS (
    SELECT 1 FROM employees e 
    WHERE e.id = fixed_schedules.employee_id 
    AND e.company_id = get_user_company_id(auth.uid())
  ))
  OR is_master_user(auth.uid())
);

DROP POLICY IF EXISTS "Admins can manage company schedules" ON fixed_schedules;
CREATE POLICY "Admins can manage company schedules" 
ON fixed_schedules FOR ALL 
USING (
  (has_role(auth.uid(), 'admin'::user_role) AND EXISTS (
    SELECT 1 FROM employees e 
    WHERE e.id = fixed_schedules.employee_id 
    AND e.company_id = get_user_company_id(auth.uid())
  ))
  OR is_master_user(auth.uid())
);

-- Step 8: Update RLS policies for punctual_schedules
DROP POLICY IF EXISTS "Admins and managers can view company punctual schedules" ON punctual_schedules;
CREATE POLICY "Admins and managers can view company punctual schedules" 
ON punctual_schedules FOR SELECT 
USING (
  (is_admin_or_manager(auth.uid()) AND EXISTS (
    SELECT 1 FROM employees e 
    WHERE e.id = punctual_schedules.employee_id 
    AND e.company_id = get_user_company_id(auth.uid())
  ))
  OR is_master_user(auth.uid())
);

DROP POLICY IF EXISTS "Admins can manage company punctual schedules" ON punctual_schedules;
CREATE POLICY "Admins can manage company punctual schedules" 
ON punctual_schedules FOR ALL 
USING (
  (has_role(auth.uid(), 'admin'::user_role) AND EXISTS (
    SELECT 1 FROM employees e 
    WHERE e.id = punctual_schedules.employee_id 
    AND e.company_id = get_user_company_id(auth.uid())
  ))
  OR is_master_user(auth.uid())
);

-- Step 9: Update RLS policies for shift_swaps
DROP POLICY IF EXISTS "Admins and managers can view company swaps" ON shift_swaps;
CREATE POLICY "Admins and managers can view company swaps" 
ON shift_swaps FOR SELECT 
USING (
  (is_admin_or_manager(auth.uid()) AND company_id = get_user_company_id(auth.uid()))
  OR is_master_user(auth.uid())
);

DROP POLICY IF EXISTS "Admins can manage company swaps" ON shift_swaps;
CREATE POLICY "Admins can manage company swaps" 
ON shift_swaps FOR ALL 
USING (
  (has_role(auth.uid(), 'admin'::user_role) AND company_id = get_user_company_id(auth.uid()))
  OR is_master_user(auth.uid())
);

-- Step 10: Update RLS policies for financial_entries
DROP POLICY IF EXISTS "Admins and managers can view company financial entries" ON financial_entries;
CREATE POLICY "Admins and managers can view company financial entries" 
ON financial_entries FOR SELECT 
USING (
  (is_admin_or_manager(auth.uid()) AND company_id = get_user_company_id(auth.uid()))
  OR is_master_user(auth.uid())
);

DROP POLICY IF EXISTS "Admins can manage company financial entries" ON financial_entries;
CREATE POLICY "Admins can manage company financial entries" 
ON financial_entries FOR ALL 
USING (
  (has_role(auth.uid(), 'admin'::user_role) AND company_id = get_user_company_id(auth.uid()))
  OR is_master_user(auth.uid())
);

-- Step 11: Update RLS policies for notification_recipients
DROP POLICY IF EXISTS "Admins and managers can view company notification recipients" ON notification_recipients;
CREATE POLICY "Admins and managers can view company notification recipients" 
ON notification_recipients FOR SELECT 
USING (
  (is_admin_or_manager(auth.uid()) AND company_id = get_user_company_id(auth.uid()))
  OR is_master_user(auth.uid())
);

DROP POLICY IF EXISTS "Admins can manage company notification recipients" ON notification_recipients;
CREATE POLICY "Admins can manage company notification recipients" 
ON notification_recipients FOR ALL 
USING (
  (has_role(auth.uid(), 'admin'::user_role) AND company_id = get_user_company_id(auth.uid()))
  OR is_master_user(auth.uid())
);

-- Step 12: Update RLS policies for anotacoes_folguista
DROP POLICY IF EXISTS "Admins and managers can view company anotacoes" ON anotacoes_folguista;
CREATE POLICY "Admins and managers can view company anotacoes" 
ON anotacoes_folguista FOR SELECT 
USING (
  (is_admin_or_manager(auth.uid()) AND company_id = get_user_company_id(auth.uid()))
  OR is_master_user(auth.uid())
);

DROP POLICY IF EXISTS "Admins can manage company anotacoes" ON anotacoes_folguista;
CREATE POLICY "Admins can manage company anotacoes" 
ON anotacoes_folguista FOR ALL 
USING (
  (has_role(auth.uid(), 'admin'::user_role) AND company_id = get_user_company_id(auth.uid()))
  OR is_master_user(auth.uid())
);

-- Step 13: Update RLS policies for anotacoes_periodo
DROP POLICY IF EXISTS "Admins and managers can view company anotacoes_periodo" ON anotacoes_periodo;
CREATE POLICY "Admins and managers can view company anotacoes_periodo" 
ON anotacoes_periodo FOR SELECT 
USING (
  (is_admin_or_manager(auth.uid()) AND company_id = get_user_company_id(auth.uid()))
  OR is_master_user(auth.uid())
);

DROP POLICY IF EXISTS "Admins can manage company anotacoes_periodo" ON anotacoes_periodo;
CREATE POLICY "Admins can manage company anotacoes_periodo" 
ON anotacoes_periodo FOR ALL 
USING (
  (has_role(auth.uid(), 'admin'::user_role) AND company_id = get_user_company_id(auth.uid()))
  OR is_master_user(auth.uid())
);

-- Step 14: Update RLS policies for lateness_alerts
DROP POLICY IF EXISTS "Admins and managers can view company lateness alerts" ON lateness_alerts;
CREATE POLICY "Admins and managers can view company lateness alerts" 
ON lateness_alerts FOR SELECT 
USING (
  (is_admin_or_manager(auth.uid()) AND EXISTS (
    SELECT 1 FROM employees e 
    WHERE e.id = lateness_alerts.employee_id 
    AND e.company_id = get_user_company_id(auth.uid())
  ))
  OR is_master_user(auth.uid())
);

DROP POLICY IF EXISTS "Admins can manage company lateness alerts" ON lateness_alerts;
CREATE POLICY "Admins can manage company lateness alerts" 
ON lateness_alerts FOR ALL 
USING (
  (has_role(auth.uid(), 'admin'::user_role) AND EXISTS (
    SELECT 1 FROM employees e 
    WHERE e.id = lateness_alerts.employee_id 
    AND e.company_id = get_user_company_id(auth.uid())
  ))
  OR is_master_user(auth.uid())
);

-- Step 15: Update RLS policies for employee_locations
DROP POLICY IF EXISTS "Admins and managers can view company employee_locations" ON employee_locations;
CREATE POLICY "Admins and managers can view company employee_locations" 
ON employee_locations FOR SELECT 
USING (
  (is_admin_or_manager(auth.uid()) AND EXISTS (
    SELECT 1 FROM employees e 
    WHERE e.id = employee_locations.employee_id 
    AND e.company_id = get_user_company_id(auth.uid())
  ))
  OR is_master_user(auth.uid())
);

DROP POLICY IF EXISTS "Admins can manage company employee_locations" ON employee_locations;
CREATE POLICY "Admins can manage company employee_locations" 
ON employee_locations FOR ALL 
USING (
  (has_role(auth.uid(), 'admin'::user_role) AND EXISTS (
    SELECT 1 FROM employees e 
    WHERE e.id = employee_locations.employee_id 
    AND e.company_id = get_user_company_id(auth.uid())
  ))
  OR is_master_user(auth.uid())
);

-- ==========================================
-- Migration: 20260116194033_d31eda0e-bba1-4121-bf19-5d92716c79d9.sql
-- ==========================================
-- Add plan column to companies table
ALTER TABLE public.companies 
ADD COLUMN plan text NOT NULL DEFAULT 'essencial';

-- Add plan limits columns
ALTER TABLE public.companies 
ADD COLUMN max_employees integer NOT NULL DEFAULT 10,
ADD COLUMN max_locations integer NOT NULL DEFAULT 5;

-- Update existing companies with default plan values
UPDATE public.companies SET plan = 'essencial', max_employees = 10, max_locations = 5 WHERE plan IS NULL OR plan = 'essencial';

-- Create a function to check employee limit
CREATE OR REPLACE FUNCTION public.check_employee_limit()
RETURNS TRIGGER AS $$
DECLARE
  current_count integer;
  max_limit integer;
BEGIN
  -- Get current employee count for the company
  SELECT COUNT(*) INTO current_count
  FROM public.employees
  WHERE company_id = NEW.company_id AND is_active = true;
  
  -- Get the company's max employee limit
  SELECT max_employees INTO max_limit
  FROM public.companies
  WHERE id = NEW.company_id;
  
  -- Check if limit is reached (for new employees only)
  IF TG_OP = 'INSERT' AND current_count >= max_limit THEN
    RAISE EXCEPTION 'Limite de funcionários atingido. Seu plano permite até % funcionários.', max_limit;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for employee limit
DROP TRIGGER IF EXISTS check_employee_limit_trigger ON public.employees;
CREATE TRIGGER check_employee_limit_trigger
BEFORE INSERT ON public.employees
FOR EACH ROW
EXECUTE FUNCTION public.check_employee_limit();

-- Create a function to check location limit
CREATE OR REPLACE FUNCTION public.check_location_limit()
RETURNS TRIGGER AS $$
DECLARE
  current_count integer;
  max_limit integer;
BEGIN
  -- Get current location count for the company
  SELECT COUNT(*) INTO current_count
  FROM public.locations
  WHERE company_id = NEW.company_id;
  
  -- Get the company's max location limit
  SELECT max_locations INTO max_limit
  FROM public.companies
  WHERE id = NEW.company_id;
  
  -- Check if limit is reached (for new locations only)
  IF TG_OP = 'INSERT' AND current_count >= max_limit THEN
    RAISE EXCEPTION 'Limite de locais atingido. Seu plano permite até % locais.', max_limit;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for location limit
DROP TRIGGER IF EXISTS check_location_limit_trigger ON public.locations;
CREATE TRIGGER check_location_limit_trigger
BEFORE INSERT ON public.locations
FOR EACH ROW
EXECUTE FUNCTION public.check_location_limit();
-- ==========================================
-- Migration: 20260131004848_82aaed41-95f0-4c96-bc4b-1afe93c6dc0a.sql
-- ==========================================
-- Create table to store Z-API configuration (master-only access)
CREATE TABLE public.zapi_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_id text NOT NULL,
  token text NOT NULL,
  client_token text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.zapi_config ENABLE ROW LEVEL SECURITY;

-- Only master users can view and manage Z-API config
CREATE POLICY "Master users can view zapi_config"
  ON public.zapi_config
  FOR SELECT
  USING (is_master_user(auth.uid()));

CREATE POLICY "Master users can manage zapi_config"
  ON public.zapi_config
  FOR ALL
  USING (is_master_user(auth.uid()));

-- Create trigger for updated_at
CREATE TRIGGER update_zapi_config_updated_at
  BEFORE UPDATE ON public.zapi_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
