
-- Step 1: Create a company for the master user's data (legacy data)
INSERT INTO companies (id, name, status, payment_status, admin_user_id)
VALUES ('00000000-0000-0000-0000-000000000001', 'PontZap Master', 'active', 'paid', '94df506b-a515-40f8-8e9a-7971db2ea624')
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
