-- Seed: realistic but entirely invented data. No real student or staff records.
-- Applied by `supabase db reset` and by the test harness. Idempotent on a fresh database only.
--
-- Fixed UUID scheme (also mirrored in tests/db/fixtures.ts):
--   a… admin, b… teachers, c… students, d… programs, e… batches, f… subjects,
--   1… batch_subjects, 2… timetable slots, 3… sessions, 4… recordings, 5… holidays
--
-- Passwords (teachers/admin, local + test use only):  AdminPass12345 / TeacherPass12345
-- Students have Google identities only (no password), exactly as in production.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- auth.users
-- ---------------------------------------------------------------------------
insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
   confirmation_token, recovery_token, email_change, email_change_token_new, is_sso_user, is_anonymous)
values
  ('a0000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'odl.admin@srisriuniversity.edu.in', extensions.crypt('AdminPass12345', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"],"role":"admin","must_change_password":false}', '{"full_name":"Priya Raghavan"}', now(), now(), '', '', '', '', false, false),

  ('b0000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'anand.mishra@srisriuniversity.edu.in', extensions.crypt('TeacherPass12345', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"],"role":"teacher","must_change_password":false}', '{"full_name":"Dr. Anand Mishra"}', now(), now(), '', '', '', '', false, false),
  ('b0000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'kavita.sen@srisriuniversity.edu.in', extensions.crypt('TeacherPass12345', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"],"role":"teacher","must_change_password":false}', '{"full_name":"Prof. Kavita Sen"}', now(), now(), '', '', '', '', false, false),
  ('b0000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rohit.verma@srisriuniversity.edu.in', extensions.crypt('TeacherPass12345', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"],"role":"teacher","must_change_password":true}', '{"full_name":"Dr. Rohit Verma"}', now(), now(), '', '', '', '', false, false),

  ('c0000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'aarav.sharma.odl25@srisriuniversity.edu.in', null, now(),
   '{"provider":"email","providers":["email"],"role":"student"}', '{"full_name":"Aarav Sharma"}', now(), now(), '', '', '', '', false, false),
  ('c0000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'diya.patel.odl25@srisriuniversity.edu.in', null, now(),
   '{"provider":"email","providers":["email"],"role":"student"}', '{"full_name":"Diya Patel"}', now(), now(), '', '', '', '', false, false),
  ('c0000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'ishaan.rao.odl25@srisriuniversity.edu.in', null, now(),
   '{"provider":"email","providers":["email"],"role":"student"}', '{"full_name":"Ishaan Rao"}', now(), now(), '', '', '', '', false, false),
  ('c0000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'meera.nair.odl25@srisriuniversity.edu.in', null, now(),
   '{"provider":"email","providers":["email"],"role":"student"}', '{"full_name":"Meera Nair"}', now(), now(), '', '', '', '', false, false),
  ('c0000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'kabir.malhotra.odl25@srisriuniversity.edu.in', null, now(),
   '{"provider":"email","providers":["email"],"role":"student"}', '{"full_name":"Kabir Malhotra"}', now(), now(), '', '', '', '', false, false),
  ('c0000000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'sneha.iyer.odl25@srisriuniversity.edu.in', null, now(),
   '{"provider":"email","providers":["email"],"role":"student"}', '{"full_name":"Sneha Iyer"}', now(), now(), '', '', '', '', false, false),
  ('c0000000-0000-4000-8000-000000000007', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rahul.das.odl26@srisriuniversity.edu.in', null, now(),
   '{"provider":"email","providers":["email"],"role":"student"}', '{"full_name":"Rahul Das"}', now(), now(), '', '', '', '', false, false),
  ('c0000000-0000-4000-8000-000000000008', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'ananya.ghosh.odl26@srisriuniversity.edu.in', null, now(),
   '{"provider":"email","providers":["email"],"role":"student"}', '{"full_name":"Ananya Ghosh"}', now(), now(), '', '', '', '', false, false);

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
insert into public.profiles (id, role, full_name, email, phone) values
  ('a0000000-0000-4000-8000-000000000001', 'admin',   'Priya Raghavan',   'odl.admin@srisriuniversity.edu.in', '+91 90000 00001'),
  ('b0000000-0000-4000-8000-000000000001', 'teacher', 'Dr. Anand Mishra', 'anand.mishra@srisriuniversity.edu.in', '+91 90000 00011'),
  ('b0000000-0000-4000-8000-000000000002', 'teacher', 'Prof. Kavita Sen', 'kavita.sen@srisriuniversity.edu.in', '+91 90000 00012'),
  ('b0000000-0000-4000-8000-000000000003', 'teacher', 'Dr. Rohit Verma',  'rohit.verma@srisriuniversity.edu.in', null),
  ('c0000000-0000-4000-8000-000000000001', 'student', 'Aarav Sharma',     'aarav.sharma.odl25@srisriuniversity.edu.in', '+91 98000 00001'),
  ('c0000000-0000-4000-8000-000000000002', 'student', 'Diya Patel',       'diya.patel.odl25@srisriuniversity.edu.in', '+91 98000 00002'),
  ('c0000000-0000-4000-8000-000000000003', 'student', 'Ishaan Rao',       'ishaan.rao.odl25@srisriuniversity.edu.in', null),
  ('c0000000-0000-4000-8000-000000000004', 'student', 'Meera Nair',       'meera.nair.odl25@srisriuniversity.edu.in', null),
  ('c0000000-0000-4000-8000-000000000005', 'student', 'Kabir Malhotra',   'kabir.malhotra.odl25@srisriuniversity.edu.in', '+91 98000 00005'),
  ('c0000000-0000-4000-8000-000000000006', 'student', 'Sneha Iyer',       'sneha.iyer.odl25@srisriuniversity.edu.in', null),
  ('c0000000-0000-4000-8000-000000000007', 'student', 'Rahul Das',        'rahul.das.odl26@srisriuniversity.edu.in', null),
  ('c0000000-0000-4000-8000-000000000008', 'student', 'Ananya Ghosh',     'ananya.ghosh.odl26@srisriuniversity.edu.in', null);

-- ---------------------------------------------------------------------------
-- programmes, batches, subjects
-- ---------------------------------------------------------------------------
insert into public.programs (id, name, code) values
  ('d0000000-0000-4000-8000-000000000001', 'Bachelor of Business Administration (ODL)', 'BBA-ODL'),
  ('d0000000-0000-4000-8000-000000000002', 'Master of Business Administration (ODL)',   'MBA-ODL');

insert into public.batches (id, program_id, name, code, intake_year, current_semester, start_date, end_date) values
  ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'BBA ODL 2025 intake', 'BBA-ODL-2025', 2025, 3, '2025-07-01', '2028-06-30'),
  ('e0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000002', 'MBA ODL 2025 intake', 'MBA-ODL-2025', 2025, 3, '2025-07-01', '2027-06-30'),
  ('e0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000001', 'BBA ODL 2026 intake', 'BBA-ODL-2026', 2026, 1, '2026-07-01', '2029-06-30');

insert into public.subjects (id, program_id, code, name, credits) values
  ('f0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'BBA301', 'Financial Management',     4),
  ('f0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'BBA302', 'Marketing Management',     4),
  ('f0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000001', 'BBA303', 'Business Statistics',      3),
  ('f0000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000001', 'BBA101', 'Principles of Management', 4),
  ('f0000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000002', 'MBA301', 'Strategic Management',     4),
  ('f0000000-0000-4000-8000-000000000006', 'd0000000-0000-4000-8000-000000000002', 'MBA302', 'Operations Research',      3);

insert into public.batch_subjects (id, batch_id, subject_id, semester) values
  ('10000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 3),
  ('10000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002', 3),
  ('10000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000003', 3),
  ('10000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000005', 3),
  ('10000000-0000-4000-8000-000000000005', 'e0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000006', 3),
  ('10000000-0000-4000-8000-000000000006', 'e0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000004', 1);

-- ---------------------------------------------------------------------------
-- students, teachers, assignments
-- ---------------------------------------------------------------------------
insert into public.students (id, roll_number, batch_id, status) values
  ('c0000000-0000-4000-8000-000000000001', 'ODL25BBA001', 'e0000000-0000-4000-8000-000000000001', 'active'),
  ('c0000000-0000-4000-8000-000000000002', 'ODL25BBA002', 'e0000000-0000-4000-8000-000000000001', 'active'),
  ('c0000000-0000-4000-8000-000000000003', 'ODL25BBA003', 'e0000000-0000-4000-8000-000000000001', 'active'),
  ('c0000000-0000-4000-8000-000000000004', 'ODL25BBA004', 'e0000000-0000-4000-8000-000000000001', 'on_hold'),
  ('c0000000-0000-4000-8000-000000000005', 'ODL25MBA001', 'e0000000-0000-4000-8000-000000000002', 'active'),
  ('c0000000-0000-4000-8000-000000000006', 'ODL25MBA002', 'e0000000-0000-4000-8000-000000000002', 'active'),
  ('c0000000-0000-4000-8000-000000000007', 'ODL26BBA001', 'e0000000-0000-4000-8000-000000000003', 'active'),
  ('c0000000-0000-4000-8000-000000000008', 'ODL26BBA002', 'e0000000-0000-4000-8000-000000000003', 'active');

insert into public.teachers (id, employee_code, entra_upn, entra_user_id, department) values
  ('b0000000-0000-4000-8000-000000000001', 'T001', 'anand.mishra@srisriuniversity.onmicrosoft.com', '7a1b2c3d-0000-4000-8000-0000000000a1', 'Management'),
  ('b0000000-0000-4000-8000-000000000002', 'T002', 'kavita.sen@srisriuniversity.onmicrosoft.com',   null, 'Marketing'),
  ('b0000000-0000-4000-8000-000000000003', 'T003', 'rohit.verma@srisriuniversity.onmicrosoft.com',  null, 'Quantitative Methods');

insert into public.subject_teachers (batch_subject_id, teacher_id, is_primary) values
  ('10000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', true),
  ('10000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', true),
  ('10000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000003', true),
  ('10000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001', true),
  ('10000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000002', true),
  ('10000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000003', true);

-- ---------------------------------------------------------------------------
-- auth.identities (email identities for everyone; students get a Google identity as if
-- they had already signed in once — mirrors production after first login)
-- ---------------------------------------------------------------------------
insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u;

insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), 'google-sub-' || right(u.id::text, 4), u.id,
       jsonb_build_object('sub', 'google-sub-' || right(u.id::text, 4), 'email', u.email, 'email_verified', true, 'hd', 'srisriuniversity.edu.in'),
       'google', now(), now(), now()
from auth.users u
where u.id in (select id from public.students);

-- ---------------------------------------------------------------------------
-- timetable (weekly, IST)   0=Sun .. 6=Sat
-- ---------------------------------------------------------------------------
insert into public.timetable_slots (id, batch_subject_id, teacher_id, day_of_week, start_time, end_time, effective_from, effective_to) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 1, '10:00', '11:00', '2026-07-01', null),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 3, '10:00', '11:00', '2026-07-01', null),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', 2, '18:00', '19:00', '2026-07-01', null),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000003', 4, '18:00', '19:00', '2026-07-01', null),
  ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001', 6, '10:00', '11:30', '2026-07-01', null),
  ('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000002', 6, '14:00', '15:30', '2026-07-01', null),
  ('20000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000003', 0, '10:00', '11:00', '2026-07-01', '2026-12-31');

insert into public.holidays (id, date, name, batch_id) values
  ('50000000-0000-4000-8000-000000000001', '2026-10-02', 'Gandhi Jayanti', null),
  ('50000000-0000-4000-8000-000000000002', '2026-10-20', 'Dussehra', null),
  ('50000000-0000-4000-8000-000000000003', '2026-11-08', 'MBA batch study break', 'e0000000-0000-4000-8000-000000000002');

-- ---------------------------------------------------------------------------
-- class sessions, relative to "now" so dashboards and E2E have live data
-- (ad-hoc rows: timetable_slot_id null so re-seeding never collides with generation)
-- ---------------------------------------------------------------------------
insert into public.class_sessions
  (id, batch_subject_id, teacher_id, timetable_slot_id, scheduled_start, scheduled_end, status, topic,
   provider, graph_event_id, graph_online_meeting_id, teams_join_url, sync_status)
values
  -- past, completed, recording available (batch BBA-ODL-2025)
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', null,
   now() - interval '7 days', now() - interval '7 days' + interval '1 hour', 'completed', 'Time value of money',
   'teams', 'seed-event-0001', 'seed-meeting-0001', 'https://teams.microsoft.com/l/meetup-join/seed-0001', 'provisioned'),
  -- past, completed, recording expired
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', null,
   now() - interval '40 days', now() - interval '40 days' + interval '1 hour', 'completed', 'Course introduction',
   'teams', 'seed-event-0002', 'seed-meeting-0002', 'https://teams.microsoft.com/l/meetup-join/seed-0002', 'provisioned'),
  -- past, completed, no recording harvested yet
  ('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', null,
   now() - interval '3 days', now() - interval '3 days' + interval '1 hour', 'completed', 'Segmentation and targeting',
   'teams', 'seed-event-0003', 'seed-meeting-0003', 'https://teams.microsoft.com/l/meetup-join/seed-0003', 'provisioned'),
  -- past, completed, other batch (MBA-ODL-2025), recording available
  ('30000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001', null,
   now() - interval '5 days', now() - interval '5 days' + interval '90 minutes', 'completed', 'Porter five forces',
   'teams', 'seed-event-0004', 'seed-meeting-0004', 'https://teams.microsoft.com/l/meetup-join/seed-0004', 'provisioned'),
  -- LIVE NOW for BBA-ODL-2025: join window open
  ('30000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', null,
   now() - interval '5 minutes', now() + interval '55 minutes', 'scheduled', 'Capital budgeting (live seed)',
   'teams', 'seed-event-0005', 'seed-meeting-0005', 'https://teams.microsoft.com/l/meetup-join/seed-0005', 'provisioned'),
  -- later today for BBA-ODL-2025 (outside the window)
  ('30000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', null,
   now() + interval '3 hours', now() + interval '4 hours', 'scheduled', 'Product lifecycle',
   'teams', 'seed-event-0006', 'seed-meeting-0006', 'https://teams.microsoft.com/l/meetup-join/seed-0006', 'provisioned'),
  -- LIVE NOW for MBA-ODL-2025 (other batch), also taught by Anand
  ('30000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001', null,
   now() - interval '5 minutes', now() + interval '85 minutes', 'scheduled', 'Blue ocean strategy (live seed)',
   'teams', 'seed-event-0007', 'seed-meeting-0007', 'https://teams.microsoft.com/l/meetup-join/seed-0007', 'provisioned'),
  -- tomorrow, pending provisioning (no join URL yet)
  ('30000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000003', null,
   now() + interval '1 day', now() + interval '1 day' + interval '1 hour', 'scheduled', 'Probability distributions',
   'teams', null, null, null, 'pending'),
  -- in 2 days, provisioning failed (sync health)
  ('30000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', null,
   now() + interval '2 days', now() + interval '2 days' + interval '1 hour', 'scheduled', 'Working capital',
   'teams', null, null, null, 'failed'),
  -- in 3 days, cancelled
  ('30000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', null,
   now() + interval '3 days', now() + interval '3 days' + interval '1 hour', 'cancelled', 'Pricing strategy',
   'teams', null, null, null, 'cancelled'),
  -- in 4 days, other batch
  ('30000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000002', null,
   now() + interval '4 days', now() + interval '4 days' + interval '90 minutes', 'scheduled', 'Linear programming',
   'teams', 'seed-event-0011', 'seed-meeting-0011', 'https://teams.microsoft.com/l/meetup-join/seed-0011', 'provisioned'),
  -- in 5 days, BBA-2026 intake
  ('30000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000003', null,
   now() + interval '5 days', now() + interval '5 days' + interval '1 hour', 'scheduled', 'Functions of management',
   'teams', 'seed-event-0012', 'seed-meeting-0012', 'https://teams.microsoft.com/l/meetup-join/seed-0012', 'provisioned');

update public.class_sessions
   set sync_attempts = 5,
       sync_error = 'Graph 403 Forbidden: Application access policy not granted for the service account (ErrorCode: Forbidden, request-id: seed-req-0009)'
 where id = '30000000-0000-4000-8000-000000000009';

-- ---------------------------------------------------------------------------
-- attendance (server context: trigger skips the window check because there is no JWT)
-- ---------------------------------------------------------------------------
insert into public.attendance (class_session_id, student_id, clicked_at, ip, user_agent) values
  ('30000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', now() - interval '7 days' + interval '2 minutes', '49.37.12.101', 'Mozilla/5.0 (Windows NT 10.0) Chrome/128'),
  ('30000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002', now() - interval '7 days' - interval '4 minutes', '106.51.88.2',  'Mozilla/5.0 (Android 14) Chrome/128 Mobile'),
  ('30000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000001', now() - interval '3 days' + interval '1 minute',  '49.37.12.101', 'Mozilla/5.0 (Windows NT 10.0) Chrome/128'),
  ('30000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000005', now() - interval '5 days' + interval '3 minutes',  '117.200.4.9',  'Mozilla/5.0 (Macintosh) Safari/17');

-- ---------------------------------------------------------------------------
-- recordings
-- ---------------------------------------------------------------------------
insert into public.recordings (id, class_session_id, graph_recording_id, drive_id, drive_item_id, recorded_at, duration_seconds, size_bytes, expires_at, status) values
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'seed-rec-0001', 'seed-drive', 'seed-item-0001',
   now() - interval '7 days', 3480, 412000000, now() - interval '7 days' + interval '30 days', 'available'),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'seed-rec-0002', 'seed-drive', 'seed-item-0002',
   now() - interval '40 days', 3300, 380000000, now() - interval '40 days' + interval '30 days', 'expired'),
  ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000004', 'seed-rec-0003', 'seed-drive', 'seed-item-0003',
   now() - interval '5 days', 5200, 610000000, now() - interval '5 days' + interval '30 days', 'available');

-- ---------------------------------------------------------------------------
-- audit log
-- ---------------------------------------------------------------------------
insert into public.audit_log (actor_id, action, entity, entity_id, payload, created_at) values
  ('a0000000-0000-4000-8000-000000000001', 'batch.created', 'batches', 'e0000000-0000-4000-8000-000000000001', '{"code":"BBA-ODL-2025"}', now() - interval '60 days'),
  (null, 'graph.call', 'class_sessions', '30000000-0000-4000-8000-000000000001', '{"endpoint":"POST /users/{sa}/events","status":201,"duration_ms":842,"request_id":"seed-req-0001"}', now() - interval '20 days'),
  (null, 'graph.call', 'class_sessions', '30000000-0000-4000-8000-000000000009', '{"endpoint":"POST /users/{sa}/events","status":403,"duration_ms":310,"request_id":"seed-req-0009"}', now() - interval '1 hour');
