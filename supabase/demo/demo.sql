-- Demo additions on top of supabase/seed.sql (applied by `npm run demo:seed`).
-- Everything here is invented except the demo owner account below, which lets the real
-- @srisriuniversity.edu.in Google account sign in as a student once the Google provider is configured.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- Demo owner as a student in BBA-ODL-2025 (Google sign-in links to this pre-provisioned user)
-- ---------------------------------------------------------------------------
insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
   confirmation_token, recovery_token, email_change, email_change_token_new, is_sso_user, is_anonymous)
values
  ('c0000000-0000-4000-8000-000000000099', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'akshat.s@srisriuniversity.edu.in', null, now(),
   '{"provider":"email","providers":["email"],"role":"student","provisioned_by":"demo"}', '{"full_name":"Akshat S"}', now(), now(), '', '', '', '', false, false)
on conflict (id) do nothing;

insert into public.profiles (id, role, full_name, email) values
  ('c0000000-0000-4000-8000-000000000099', 'student', 'Akshat S', 'akshat.s@srisriuniversity.edu.in')
on conflict (id) do nothing;

insert into public.students (id, roll_number, batch_id, status) values
  ('c0000000-0000-4000-8000-000000000099', 'ODL25BBA099', 'e0000000-0000-4000-8000-000000000001', 'active')
on conflict (id) do nothing;

insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.id = 'c0000000-0000-4000-8000-000000000099'
  and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email');

-- A second admin login for the demo team (password: DemoAdmin12345)
insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
   confirmation_token, recovery_token, email_change, email_change_token_new, is_sso_user, is_anonymous)
values
  ('a0000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'demo.admin@srisriuniversity.edu.in', extensions.crypt('DemoAdmin12345', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"],"role":"admin","must_change_password":false}', '{"full_name":"Demo Admin"}', now(), now(), '', '', '', '', false, false)
on conflict (id) do nothing;

insert into public.profiles (id, role, full_name, email) values
  ('a0000000-0000-4000-8000-000000000002', 'admin', 'Demo Admin', 'demo.admin@srisriuniversity.edu.in')
on conflict (id) do nothing;

insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.id = 'a0000000-0000-4000-8000-000000000002'
  and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email');

-- ---------------------------------------------------------------------------
-- More students so rosters and reports look realistic (all invented)
-- ---------------------------------------------------------------------------
with people(id, name, email, roll, batch) as (
  values
    ('c0000000-0000-4000-8000-000000000011', 'Nikhil Rao',      'nikhil.rao.odl25@srisriuniversity.edu.in',     'ODL25BBA005', 'e0000000-0000-4000-8000-000000000001'),
    ('c0000000-0000-4000-8000-000000000012', 'Pooja Menon',     'pooja.menon.odl25@srisriuniversity.edu.in',    'ODL25BBA006', 'e0000000-0000-4000-8000-000000000001'),
    ('c0000000-0000-4000-8000-000000000013', 'Arjun Bhat',      'arjun.bhat.odl25@srisriuniversity.edu.in',     'ODL25BBA007', 'e0000000-0000-4000-8000-000000000001'),
    ('c0000000-0000-4000-8000-000000000014', 'Sanya Kapoor',    'sanya.kapoor.odl25@srisriuniversity.edu.in',   'ODL25BBA008', 'e0000000-0000-4000-8000-000000000001'),
    ('c0000000-0000-4000-8000-000000000015', 'Vikram Reddy',    'vikram.reddy.odl25@srisriuniversity.edu.in',   'ODL25MBA003', 'e0000000-0000-4000-8000-000000000002'),
    ('c0000000-0000-4000-8000-000000000016', 'Neha Joshi',      'neha.joshi.odl25@srisriuniversity.edu.in',     'ODL25MBA004', 'e0000000-0000-4000-8000-000000000002'),
    ('c0000000-0000-4000-8000-000000000017', 'Rohan Chatterjee','rohan.chatterjee.odl26@srisriuniversity.edu.in','ODL26BBA003', 'e0000000-0000-4000-8000-000000000003'),
    ('c0000000-0000-4000-8000-000000000018', 'Ishita Saxena',   'ishita.saxena.odl26@srisriuniversity.edu.in',  'ODL26BBA004', 'e0000000-0000-4000-8000-000000000003')
)
, ins_users as (
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change, email_change_token_new, is_sso_user, is_anonymous)
  select id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, now(),
         '{"provider":"email","providers":["email"],"role":"student"}', jsonb_build_object('full_name', name), now(), now(), '', '', '', '', false, false
  from people
  on conflict (id) do nothing
  returning id
)
, ins_profiles as (
  insert into public.profiles (id, role, full_name, email)
  select id::uuid, 'student', name, email from people
  on conflict (id) do nothing
  returning id
)
insert into public.students (id, roll_number, batch_id, status)
select id::uuid, roll, batch::uuid, 'active' from people
on conflict (id) do nothing;

insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.id::text like 'c0000000-0000-4000-8000-0000000000%'
  and not exists (select 1 from auth.identities i where i.user_id = u.id);

-- A few extra weekly slots so every weekday has something (no clashes with the seed)
insert into public.timetable_slots (id, batch_subject_id, teacher_id, day_of_week, start_time, end_time, effective_from) values
  ('20000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000003', 2, '10:00', '11:00', '2026-07-01'),  -- Tue Stats (Rohit) BBA-2025
  ('20000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000002', 4, '10:00', '11:30', '2026-07-01'),  -- Thu OR (Kavita) MBA-2025
  ('20000000-0000-4000-8000-000000000013', '10000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000003', 5, '18:00', '19:00', '2026-07-01'),  -- Fri POM (Rohit) BBA-2026
  ('20000000-0000-4000-8000-000000000014', '10000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001', 5, '10:00', '11:00', '2026-07-01')   -- Fri SM (Anand) MBA-2025
on conflict (id) do nothing;
