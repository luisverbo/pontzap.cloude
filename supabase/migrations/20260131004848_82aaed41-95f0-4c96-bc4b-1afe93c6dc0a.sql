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