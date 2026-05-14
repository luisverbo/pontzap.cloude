-- ================================================
-- PARTE 1B: Profiles, Roles e Funcionários
-- Rode DEPOIS de criar todos os usuários no Dashboard
-- ================================================

-- Atualizar dados dos profiles criados automaticamente pelo trigger
UPDATE public.profiles SET
  name = CASE email
    WHEN 'luisverbo@gmail.com' THEN 'Luis Verbo'
    WHEN 'maryhairvita@gmail.com' THEN 'Daniel Bahia'
    WHEN 'zulejojodecora@gmail.com' THEN 'Luis carlos '
    WHEN 'zulejodecora@gmail.com' THEN 'Lucas Romero'
    WHEN 'matheusflucio28@gmail.com' THEN 'Mateus Faria'
    WHEN 'sgserginho999@gmail.com' THEN 'Sergio Gonçalves'
    WHEN 'vitortavaresdesouza3@gmail.com' THEN 'Vitor Tavares'
    WHEN 'danielbahia192@gmail.com' THEN 'Daniel Bahia'
    WHEN 'lucasdossantos2417@gmail.com' THEN 'Lucas dos Santos'
    WHEN 'gyselebahia26@gmail.com' THEN 'Gysele Ayde Bahia'
    WHEN 'joaomarcos8972@gmail.com' THEN 'João Marcos do Nascimento'
    WHEN 'jackson12oliveira6@icloud.com' THEN 'Jackson Oliveira da Silva'
    WHEN 'luisverbo.pt@gmail.com' THEN 'Marcos Nadré'
    WHEN 'acqualife.guardiao@gmail.com' THEN 'Marcos Andre'
    WHEN 'adobemusebrasil@gmail.com' THEN 'Luis teste'
  END,
  phone = CASE email
    WHEN 'luisverbo@gmail.com' THEN NULL
    WHEN 'maryhairvita@gmail.com' THEN NULL
    WHEN 'zulejojodecora@gmail.com' THEN NULL
    WHEN 'zulejodecora@gmail.com' THEN '5521985285047'
    WHEN 'matheusflucio28@gmail.com' THEN '5521966909616'
    WHEN 'sgserginho999@gmail.com' THEN '5521985927024'
    WHEN 'vitortavaresdesouza3@gmail.com' THEN '5521978811743'
    WHEN 'danielbahia192@gmail.com' THEN '5521964335327'
    WHEN 'lucasdossantos2417@gmail.com' THEN '5521975782127'
    WHEN 'gyselebahia26@gmail.com' THEN '5521996947848'
    WHEN 'joaomarcos8972@gmail.com' THEN '5521959196432'
    WHEN 'jackson12oliveira6@icloud.com' THEN '5521987051596'
    WHEN 'luisverbo.pt@gmail.com' THEN '21980120036'
    WHEN 'acqualife.guardiao@gmail.com' THEN '21985285047'
    WHEN 'adobemusebrasil@gmail.com' THEN '5521985285047'
  END,
  updated_at = now()
WHERE email IN ('luisverbo@gmail.com', 'maryhairvita@gmail.com', 'zulejojodecora@gmail.com', 'zulejodecora@gmail.com', 'matheusflucio28@gmail.com', 'sgserginho999@gmail.com', 'vitortavaresdesouza3@gmail.com', 'danielbahia192@gmail.com', 'lucasdossantos2417@gmail.com', 'gyselebahia26@gmail.com', 'joaomarcos8972@gmail.com', 'jackson12oliveira6@icloud.com', 'luisverbo.pt@gmail.com', 'acqualife.guardiao@gmail.com', 'adobemusebrasil@gmail.com');

-- Inserir roles dos usuários
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users WHERE email = 'luisverbo@gmail.com'
ON CONFLICT DO NOTHING;
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'employee' FROM auth.users WHERE email = 'maryhairvita@gmail.com'
ON CONFLICT DO NOTHING;
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'employee' FROM auth.users WHERE email = 'zulejojodecora@gmail.com'
ON CONFLICT DO NOTHING;
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'employee' FROM auth.users WHERE email = 'zulejodecora@gmail.com'
ON CONFLICT DO NOTHING;
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'employee' FROM auth.users WHERE email = 'matheusflucio28@gmail.com'
ON CONFLICT DO NOTHING;
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'employee' FROM auth.users WHERE email = 'sgserginho999@gmail.com'
ON CONFLICT DO NOTHING;
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'employee' FROM auth.users WHERE email = 'vitortavaresdesouza3@gmail.com'
ON CONFLICT DO NOTHING;
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'employee' FROM auth.users WHERE email = 'danielbahia192@gmail.com'
ON CONFLICT DO NOTHING;
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'employee' FROM auth.users WHERE email = 'lucasdossantos2417@gmail.com'
ON CONFLICT DO NOTHING;
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'employee' FROM auth.users WHERE email = 'gyselebahia26@gmail.com'
ON CONFLICT DO NOTHING;
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'employee' FROM auth.users WHERE email = 'joaomarcos8972@gmail.com'
ON CONFLICT DO NOTHING;
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'employee' FROM auth.users WHERE email = 'jackson12oliveira6@icloud.com'
ON CONFLICT DO NOTHING;
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users WHERE email = 'luisverbo.pt@gmail.com'
ON CONFLICT DO NOTHING;
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users WHERE email = 'acqualife.guardiao@gmail.com'
ON CONFLICT DO NOTHING;
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'employee' FROM auth.users WHERE email = 'adobemusebrasil@gmail.com'
ON CONFLICT DO NOTHING;

-- Master user (Luis Verbo)
INSERT INTO public.master_users (user_id)
SELECT id FROM auth.users WHERE email = 'luisverbo@gmail.com'
ON CONFLICT DO NOTHING;

-- Inserir funcionários com novo user_id via email
INSERT INTO public.employees (id, user_id, type, is_active, created_at, updated_at, work_start_time, work_end_time, lunch_duration_minutes, count_early_entry_as_extra, invitation_accepted, overtime_rate, schedule_type, company_id, overtime_compensation_mode, accumulated_overtime_minutes, time_off_days_taken)
SELECT 'a4291ae4-4bc3-44a6-9a20-73bb2ad52050', id, 'substitute', true, '2025-12-17 13:49:59.605852+00', '2026-01-16 17:14:26.937116+00', '08:00:00', '17:00:00', 60, false, true, NULL, 'regular', '00000000-0000-0000-0000-000000000001', 'cash', 0, 0
FROM auth.users WHERE email = 'matheusflucio28@gmail.com'
ON CONFLICT DO NOTHING;
INSERT INTO public.employees (id, user_id, type, is_active, created_at, updated_at, work_start_time, work_end_time, lunch_duration_minutes, count_early_entry_as_extra, invitation_accepted, overtime_rate, schedule_type, company_id, overtime_compensation_mode, accumulated_overtime_minutes, time_off_days_taken)
SELECT 'f145d73a-0289-4740-ac34-41ccfb1e03eb', id, 'fixed', true, '2025-12-19 18:08:00.325316+00', '2026-01-16 17:14:26.937116+00', '08:00:00', '17:00:00', 60, false, true, NULL, '12x36', '00000000-0000-0000-0000-000000000001', 'cash', 0, 0
FROM auth.users WHERE email = 'danielbahia192@gmail.com'
ON CONFLICT DO NOTHING;
INSERT INTO public.employees (id, user_id, type, is_active, created_at, updated_at, work_start_time, work_end_time, lunch_duration_minutes, count_early_entry_as_extra, invitation_accepted, overtime_rate, schedule_type, company_id, overtime_compensation_mode, accumulated_overtime_minutes, time_off_days_taken)
SELECT '7d1e4299-bc4d-467a-b6a9-e5d827becd11', id, 'fixed', true, '2025-12-19 18:09:29.211295+00', '2026-01-16 17:14:26.937116+00', '08:00:00', '17:00:00', 60, false, true, NULL, 'summer', '00000000-0000-0000-0000-000000000001', 'cash', 0, 0
FROM auth.users WHERE email = 'lucasdossantos2417@gmail.com'
ON CONFLICT DO NOTHING;
INSERT INTO public.employees (id, user_id, type, is_active, created_at, updated_at, work_start_time, work_end_time, lunch_duration_minutes, count_early_entry_as_extra, invitation_accepted, overtime_rate, schedule_type, company_id, overtime_compensation_mode, accumulated_overtime_minutes, time_off_days_taken)
SELECT '8d6c03eb-8d46-499b-8f1c-4d080fae70f9', id, 'fixed', true, '2026-01-02 09:27:03.299149+00', '2026-01-16 17:21:39.026716+00', '08:00:00', '17:00:00', 60, false, true, NULL, 'regular', '00000000-0000-0000-0000-000000000001', 'cash', 0, 0
FROM auth.users WHERE email = 'joaomarcos8972@gmail.com'
ON CONFLICT DO NOTHING;
INSERT INTO public.employees (id, user_id, type, is_active, created_at, updated_at, work_start_time, work_end_time, lunch_duration_minutes, count_early_entry_as_extra, invitation_accepted, overtime_rate, schedule_type, company_id, overtime_compensation_mode, accumulated_overtime_minutes, time_off_days_taken)
SELECT '61ca4e6a-a096-4642-8e56-8a4be4ce429c', id, 'fixed', true, '2025-12-18 15:18:37.961425+00', '2026-01-16 17:28:14.962831+00', '08:00:00', '17:00:00', 60, false, true, NULL, 'regular', '00000000-0000-0000-0000-000000000001', 'cash', 0, 0
FROM auth.users WHERE email = 'sgserginho999@gmail.com'
ON CONFLICT DO NOTHING;
INSERT INTO public.employees (id, user_id, type, is_active, created_at, updated_at, work_start_time, work_end_time, lunch_duration_minutes, count_early_entry_as_extra, invitation_accepted, overtime_rate, schedule_type, company_id, overtime_compensation_mode, accumulated_overtime_minutes, time_off_days_taken)
SELECT '22281493-b1cb-4afd-a67a-c86ce11e47ab', id, 'fixed', true, '2026-01-31 02:51:35.452655+00', '2026-01-31 02:51:35.452655+00', '08:00:00', '17:00:00', 60, false, true, NULL, 'regular', '90796564-c7fe-48b0-8180-a0513e30985f', 'cash', 0, 0
FROM auth.users WHERE email = 'acqualife.guardiao@gmail.com'
ON CONFLICT DO NOTHING;
INSERT INTO public.employees (id, user_id, type, is_active, created_at, updated_at, work_start_time, work_end_time, lunch_duration_minutes, count_early_entry_as_extra, invitation_accepted, overtime_rate, schedule_type, company_id, overtime_compensation_mode, accumulated_overtime_minutes, time_off_days_taken)
SELECT 'a97caf28-e705-4f64-b41f-634c3a40c332', id, 'fixed', true, '2026-01-31 03:01:55.764871+00', '2026-01-31 03:01:55.764871+00', '08:00:00', '17:00:00', 60, false, true, NULL, 'regular', '00000000-0000-0000-0000-000000000001', 'cash', 0, 0
FROM auth.users WHERE email = 'adobemusebrasil@gmail.com'
ON CONFLICT DO NOTHING;
INSERT INTO public.employees (id, user_id, type, is_active, created_at, updated_at, work_start_time, work_end_time, lunch_duration_minutes, count_early_entry_as_extra, invitation_accepted, overtime_rate, schedule_type, company_id, overtime_compensation_mode, accumulated_overtime_minutes, time_off_days_taken)
SELECT '5d6f9467-6c83-47b6-8cb3-30fce9747a1d', id, 'fixed', true, '2026-01-08 17:26:56.263889+00', '2026-03-09 02:18:11.371733+00', '08:00:00', '17:00:00', 60, false, true, NULL, '12x36', '00000000-0000-0000-0000-000000000001', 'cash', 0, 0
FROM auth.users WHERE email = 'jackson12oliveira6@icloud.com'
ON CONFLICT DO NOTHING;
INSERT INTO public.employees (id, user_id, type, is_active, created_at, updated_at, work_start_time, work_end_time, lunch_duration_minutes, count_early_entry_as_extra, invitation_accepted, overtime_rate, schedule_type, company_id, overtime_compensation_mode, accumulated_overtime_minutes, time_off_days_taken)
SELECT '1d1fb983-f86c-4832-8020-60f07e16e211', id, 'fixed', true, '2025-12-20 00:23:54.556801+00', '2026-03-09 02:19:43.716518+00', '08:00:00', '17:00:00', 60, false, true, NULL, 'regular', '00000000-0000-0000-0000-000000000001', 'cash', 0, 0
FROM auth.users WHERE email = 'gyselebahia26@gmail.com'
ON CONFLICT DO NOTHING;
