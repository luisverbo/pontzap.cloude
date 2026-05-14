-- ================================================
-- PARTE 1A: Empresas e Locais (rode agora)
-- ================================================

INSERT INTO public.companies (id, name, status, payment_status, subscription_start_date, subscription_end_date, is_blocked, created_at, updated_at, email, phone, admin_user_id, plan, max_employees, max_locations) VALUES
  ('90796564-c7fe-48b0-8180-a0513e30985f', 'Aqualife Piscinas', 'active', 'paid', '2026-01-27', '2026-01-30', false, '2026-01-27 19:11:22.544125+00', '2026-01-28 18:58:16.630336+00', 'acqualife.guardiao@gmail.com', 21985285047, '62a8f027-3f6e-407d-bbe4-73beccab42df', 'essencial', 10, 5),
  ('00000000-0000-0000-0000-000000000001', 'PontZap Master', 'active', 'paid', '2026-01-30', '2030-12-28', false, '2026-01-16 17:14:26.937116+00', '2026-01-31 02:16:13.440671+00', NULL, NULL, '94df506b-a515-40f8-8e9a-7971db2ea624', 'empresarial', 40, 20)
ON CONFLICT DO NOTHING;

INSERT INTO public.locations (id, name, latitude, longitude, radius, qr_code, created_at, updated_at, company_id) VALUES
  ('06e4537d-cc84-4239-a30e-991a6db979e7', 'Condomínio Four Seasons', -23.004224, -43.349047, 250, 'd8a850b6-d950-49e6-9a2a-14dddfdbc461', '2025-12-17 22:51:54.902901+00', '2026-01-16 17:14:26.937116+00', '00000000-0000-0000-0000-000000000001'),
  ('7a56d99e-bbb9-4943-b78b-e45004e02e2f', 'Condomínio Rosa dos Ventos', -23.002594, -43.352105, 150, '7c1162d2-af17-4a88-bbf6-9d90968f48ae', '2025-12-17 22:52:59.956912+00', '2026-01-16 17:14:26.937116+00', '00000000-0000-0000-0000-000000000001'),
  ('5a152705-842b-4a16-b7ec-782c36d10cf9', 'Condomínio Rosa dos Mares', -23.002693, -43.351332, 150, 'b7d671fb-26c6-491c-9272-a2aa783d0be4', '2025-12-17 22:55:20.616023+00', '2026-01-16 17:14:26.937116+00', '00000000-0000-0000-0000-000000000001'),
  ('af38b26f-0811-4153-a1f6-8b182a1b04be', 'Condomínio Varanda das Rosas', -23.002377, -43.348467, 150, 'b741a7ae-089d-4da5-9be1-e2313d0f3f4c', '2025-12-17 22:56:14.440604+00', '2026-01-16 17:14:26.937116+00', '00000000-0000-0000-0000-000000000001'),
  ('45fb8e55-9d3d-48c6-afcd-1443115ef205', 'Minha Casa Teste', -22.984358, -43.646643, 150, '8dc13492-1391-4b4e-ba90-a2d4dbd48a84', '2025-12-17 22:57:44.552655+00', '2026-01-16 17:14:26.937116+00', '00000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;
