
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
