-- ================================================
-- PARTE 1: Auth Users + Profiles + Empresas + Locais
-- ================================================

ALTER TABLE auth.users DISABLE TRIGGER on_auth_user_created;

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin)
VALUES
  ('00000000-0000-0000-0000-000000000000','94df506b-a515-40f8-8e9a-7971db2ea624','authenticated','authenticated','luisverbo@gmail.com',crypt('Pontzap@2024',gen_salt('bf')),'2025-12-09 17:57:03.922539+00','2025-12-09 17:57:03.922539+00',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"name":"Luis Verbo"}'::jsonb,false),
  ('00000000-0000-0000-0000-000000000000','dfb97a7f-f038-4a2c-b417-2385b89b9e71','authenticated','authenticated','maryhairvita@gmail.com',crypt('Pontzap@2024',gen_salt('bf')),'2025-12-09 22:44:26.783973+00','2025-12-09 22:44:26.783973+00',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"name":"Daniel Bahia"}'::jsonb,false),
  ('00000000-0000-0000-0000-000000000000','7c919fb8-3c6b-444c-8b7c-e17355b2b684','authenticated','authenticated','zulejojodecora@gmail.com',crypt('Pontzap@2024',gen_salt('bf')),'2025-12-10 21:05:43.024687+00','2025-12-10 21:05:43.024687+00',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"name":"Luis carlos "}'::jsonb,false),
  ('00000000-0000-0000-0000-000000000000','922d1497-e724-4eb5-9a5f-711dfce6b6dc','authenticated','authenticated','zulejodecora@gmail.com',crypt('Pontzap@2024',gen_salt('bf')),'2025-12-10 18:06:07.285776+00','2025-12-10 18:06:07.285776+00',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"name":"Lucas Romero"}'::jsonb,false),
  ('00000000-0000-0000-0000-000000000000','667dce4c-98fd-4f6f-8ac9-066c55403662','authenticated','authenticated','matheusflucio28@gmail.com',crypt('Pontzap@2024',gen_salt('bf')),'2025-12-17 13:49:59.367161+00','2025-12-17 13:49:59.367161+00',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"name":"Mateus Faria"}'::jsonb,false),
  ('00000000-0000-0000-0000-000000000000','ea8e94a8-13b4-4821-aec8-01e4068b336a','authenticated','authenticated','sgserginho999@gmail.com',crypt('Pontzap@2024',gen_salt('bf')),'2025-12-18 15:18:37.694314+00','2025-12-18 15:18:37.694314+00',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"name":"Sergio Gonçalves"}'::jsonb,false),
  ('00000000-0000-0000-0000-000000000000','f63504db-cdfb-4f14-9c80-667511e7229d','authenticated','authenticated','vitortavaresdesouza3@gmail.com',crypt('Pontzap@2024',gen_salt('bf')),'2025-12-18 15:59:20.594526+00','2025-12-18 15:59:20.594526+00',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"name":"Vitor Tavares"}'::jsonb,false),
  ('00000000-0000-0000-0000-000000000000','64d1d55f-50c0-4182-aed6-a812fb9689bb','authenticated','authenticated','danielbahia192@gmail.com',crypt('Pontzap@2024',gen_salt('bf')),'2025-12-19 18:08:00.100928+00','2025-12-19 18:08:00.100928+00',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"name":"Daniel Bahia"}'::jsonb,false),
  ('00000000-0000-0000-0000-000000000000','a83826c0-325e-4f6a-9880-61726f47cc7c','authenticated','authenticated','lucasdossantos2417@gmail.com',crypt('Pontzap@2024',gen_salt('bf')),'2025-12-19 18:07:01.98763+00','2025-12-19 18:07:01.98763+00',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"name":"Lucas dos Santos"}'::jsonb,false),
  ('00000000-0000-0000-0000-000000000000','88420944-5e41-4157-ba37-cfa529396b68','authenticated','authenticated','gyselebahia26@gmail.com',crypt('Pontzap@2024',gen_salt('bf')),'2025-12-20 00:23:54.266262+00','2025-12-20 00:23:54.266262+00',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"name":"Gysele Ayde Bahia"}'::jsonb,false),
  ('00000000-0000-0000-0000-000000000000','7c8f66e7-f81e-4871-92ec-524d76835491','authenticated','authenticated','joaomarcos8972@gmail.com',crypt('Pontzap@2024',gen_salt('bf')),'2026-01-02 09:27:03.030892+00','2026-01-02 09:27:03.030892+00',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"name":"João Marcos do Nascimento"}'::jsonb,false),
  ('00000000-0000-0000-0000-000000000000','5b2b5e81-a653-4f0b-9601-f1c6b1120d13','authenticated','authenticated','jackson12oliveira6@icloud.com',crypt('Pontzap@2024',gen_salt('bf')),'2026-01-08 17:25:07.284978+00','2026-01-08 17:25:07.284978+00',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"name":"Jackson Oliveira da Silva"}'::jsonb,false),
  ('00000000-0000-0000-0000-000000000000','5d7f5fd4-2c0c-4250-b052-334daaeb2c6d','authenticated','authenticated','luisverbo.pt@gmail.com',crypt('Pontzap@2024',gen_salt('bf')),'2025-12-09 21:11:05.252046+00','2025-12-09 21:11:05.252046+00',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"name":"Marcos Nadré"}'::jsonb,false),
  ('00000000-0000-0000-0000-000000000000','62a8f027-3f6e-407d-bbe4-73beccab42df','authenticated','authenticated','acqualife.guardiao@gmail.com',crypt('Pontzap@2024',gen_salt('bf')),'2025-12-09 17:40:55.050105+00','2025-12-09 17:40:55.050105+00',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"name":"Marcos Andre"}'::jsonb,false),
  ('00000000-0000-0000-0000-000000000000','3f0035f1-36ba-4670-a2df-803bf3831e42','authenticated','authenticated','adobemusebrasil@gmail.com',crypt('Pontzap@2024',gen_salt('bf')),'2025-12-09 19:57:09.170811+00','2025-12-09 19:57:09.170811+00',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"name":"Luis teste"}'::jsonb,false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, name, email, created_at, updated_at, phone) VALUES
  ('94df506b-a515-40f8-8e9a-7971db2ea624', 'Luis Verbo', 'luisverbo@gmail.com', '2025-12-09 17:57:03.922539+00', '2025-12-09 17:57:03.922539+00', NULL),
  ('dfb97a7f-f038-4a2c-b417-2385b89b9e71', 'Daniel Bahia', 'maryhairvita@gmail.com', '2025-12-09 22:44:26.783973+00', '2025-12-09 22:44:26.783973+00', NULL),
  ('7c919fb8-3c6b-444c-8b7c-e17355b2b684', 'Luis carlos ', 'zulejojodecora@gmail.com', '2025-12-10 21:05:43.024687+00', '2025-12-10 21:05:43.024687+00', NULL),
  ('922d1497-e724-4eb5-9a5f-711dfce6b6dc', 'Lucas Romero', 'zulejodecora@gmail.com', '2025-12-10 18:06:07.285776+00', '2025-12-11 00:59:07.538004+00', 5521985285047),
  ('667dce4c-98fd-4f6f-8ac9-066c55403662', 'Mateus Faria', 'matheusflucio28@gmail.com', '2025-12-17 13:49:59.367161+00', '2025-12-17 13:50:00.517147+00', 5521966909616),
  ('ea8e94a8-13b4-4821-aec8-01e4068b336a', 'Sergio Gonçalves', 'sgserginho999@gmail.com', '2025-12-18 15:18:37.694314+00', '2025-12-18 15:18:38.8801+00', 5521985927024),
  ('f63504db-cdfb-4f14-9c80-667511e7229d', 'Vitor Tavares', 'vitortavaresdesouza3@gmail.com', '2025-12-18 15:59:20.594526+00', '2025-12-18 15:59:21.773866+00', 5521978811743),
  ('64d1d55f-50c0-4182-aed6-a812fb9689bb', 'Daniel Bahia', 'danielbahia192@gmail.com', '2025-12-19 18:08:00.100928+00', '2025-12-19 18:08:01.225161+00', 5521964335327),
  ('a83826c0-325e-4f6a-9880-61726f47cc7c', 'Lucas dos Santos', 'lucasdossantos2417@gmail.com', '2025-12-19 18:07:01.98763+00', '2025-12-19 18:09:30.105228+00', 5521975782127),
  ('88420944-5e41-4157-ba37-cfa529396b68', 'Gysele Ayde Bahia', 'gyselebahia26@gmail.com', '2025-12-20 00:23:54.266262+00', '2025-12-20 00:23:55.496101+00', 5521996947848),
  ('7c8f66e7-f81e-4871-92ec-524d76835491', 'João Marcos do Nascimento', 'joaomarcos8972@gmail.com', '2026-01-02 09:27:03.030892+00', '2026-01-02 09:27:04.21043+00', 5521959196432),
  ('5b2b5e81-a653-4f0b-9601-f1c6b1120d13', 'Jackson Oliveira da Silva', 'jackson12oliveira6@icloud.com', '2026-01-08 17:25:07.284978+00', '2026-01-08 17:26:57.232255+00', 5521987051596),
  ('5d7f5fd4-2c0c-4250-b052-334daaeb2c6d', 'Marcos Nadré', 'luisverbo.pt@gmail.com', '2025-12-09 21:11:05.252046+00', '2026-01-16 17:00:39.676448+00', 21980120036),
  ('62a8f027-3f6e-407d-bbe4-73beccab42df', 'Marcos Andre', 'acqualife.guardiao@gmail.com', '2025-12-09 17:40:55.050105+00', '2026-01-27 19:11:27.252318+00', 21985285047),
  ('3f0035f1-36ba-4670-a2df-803bf3831e42', 'Luis teste', 'adobemusebrasil@gmail.com', '2025-12-09 19:57:09.170811+00', '2026-01-31 03:01:56.701138+00', 5521985285047)
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (id, user_id, role, created_at) VALUES
  ('8aa8982e-4807-4f4d-80c5-8a1001296fe9', '94df506b-a515-40f8-8e9a-7971db2ea624', 'admin', '2025-12-09 17:57:03.922539+00'),
  ('b2dc06f9-7435-4bb1-977b-7dad6874d17a', '3f0035f1-36ba-4670-a2df-803bf3831e42', 'employee', '2025-12-09 19:57:09.170811+00'),
  ('00dcb293-307b-48fc-8ee8-cec7d863941a', 'dfb97a7f-f038-4a2c-b417-2385b89b9e71', 'employee', '2025-12-09 22:44:26.783973+00'),
  ('6d3147ed-e1c8-41d7-a967-d10e69ee3990', '922d1497-e724-4eb5-9a5f-711dfce6b6dc', 'employee', '2025-12-10 18:06:07.285776+00'),
  ('0319b883-638f-4753-ae07-0500e440cb1a', '7c919fb8-3c6b-444c-8b7c-e17355b2b684', 'employee', '2025-12-10 21:05:43.024687+00'),
  ('8b91ffa2-f054-494f-bd49-55bf391d3c23', '667dce4c-98fd-4f6f-8ac9-066c55403662', 'employee', '2025-12-17 13:49:59.367161+00'),
  ('1723271b-dc78-4665-84db-dcd9b8a22b14', 'ea8e94a8-13b4-4821-aec8-01e4068b336a', 'employee', '2025-12-18 15:18:37.694314+00'),
  ('6ac2ae81-ab94-474d-abd4-c79509ed98df', 'f63504db-cdfb-4f14-9c80-667511e7229d', 'employee', '2025-12-18 15:59:20.594526+00'),
  ('1fb2520a-8fb8-4cd7-a7a3-e28f735a1777', 'a83826c0-325e-4f6a-9880-61726f47cc7c', 'employee', '2025-12-19 18:07:01.98763+00'),
  ('7d1cecfc-b75e-4237-af9d-7a26d59b2f64', '64d1d55f-50c0-4182-aed6-a812fb9689bb', 'employee', '2025-12-19 18:08:00.100928+00'),
  ('64831770-f2b5-4e9e-bad2-9baeaa539a6d', '88420944-5e41-4157-ba37-cfa529396b68', 'employee', '2025-12-20 00:23:54.266262+00'),
  ('e7aa1c15-18d2-4518-8335-5f978b5e3a57', '7c8f66e7-f81e-4871-92ec-524d76835491', 'employee', '2026-01-02 09:27:03.030892+00'),
  ('e71555da-4b37-4e92-b599-a3586bc8bdc0', '5b2b5e81-a653-4f0b-9601-f1c6b1120d13', 'employee', '2026-01-08 17:25:07.284978+00'),
  ('c5fd3717-5ec1-418b-a871-5cc89aa3d58c', '5d7f5fd4-2c0c-4250-b052-334daaeb2c6d', 'admin', '2025-12-09 21:11:05.252046+00'),
  ('e6b3dd58-249b-4d17-afd1-7f034bb917c6', '62a8f027-3f6e-407d-bbe4-73beccab42df', 'admin', '2025-12-09 17:40:55.050105+00')
ON CONFLICT DO NOTHING;

ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_created;

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
