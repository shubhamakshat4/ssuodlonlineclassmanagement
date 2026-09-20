-- Phase 1: Row Level Security policies (SPEC.md §5).
--
-- Conventions
-- - Admins get full access on every table via is_admin().
-- - service_role bypasses RLS (Supabase default) and is the only writer for generated data.
-- - anon has no access at all: every policy is scoped to `authenticated`.
-- - Column-level restrictions on teacher updates are enforced by a trigger (next migration),
--   the policies here only decide *which rows* are reachable.

-- ---------------------------------------------------------------------------
-- app_settings: everyone signed in may read; only admins change.
-- ---------------------------------------------------------------------------
create policy app_settings_read on public.app_settings
  for select to authenticated using (true);
create policy app_settings_admin_write on public.app_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or public.is_admin()
    -- students see the teachers who teach their batch (names on the dashboard)
    or (role = 'teacher' and public.student_sees_teacher(id))
    -- teachers see the students of batches they teach (rosters)
    or (role = 'student' and exists (
          select 1 from public.students s
          where s.id = profiles.id and public.teacher_teaches_batch(s.batch_id)))
  );
create policy profiles_admin_insert on public.profiles
  for insert to authenticated with check (public.is_admin());
create policy profiles_admin_update on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy profiles_admin_delete on public.profiles
  for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- programs / subjects: catalogue data, readable by any signed-in user.
-- ---------------------------------------------------------------------------
create policy programs_select on public.programs for select to authenticated using (true);
create policy programs_admin_all on public.programs for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy subjects_select on public.subjects for select to authenticated using (true);
create policy subjects_admin_all on public.subjects for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- batches: student sees own batch; teacher sees batches they teach; admin all.
-- ---------------------------------------------------------------------------
create policy batches_select on public.batches
  for select to authenticated
  using (
    public.is_admin()
    or id = public.current_student_batch_id()
    or public.teacher_teaches_batch(id)
  );
create policy batches_admin_write on public.batches for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- batch_subjects
-- ---------------------------------------------------------------------------
create policy batch_subjects_select on public.batch_subjects
  for select to authenticated
  using (
    public.is_admin()
    or (batch_id = public.current_student_batch_id() and is_active)
    or public.teacher_teaches_batch_subject(id)
  );
create policy batch_subjects_admin_write on public.batch_subjects for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- students: own row; teachers see students in batches they teach; admin full.
-- ---------------------------------------------------------------------------
create policy students_select on public.students
  for select to authenticated
  using (
    id = auth.uid()
    or public.is_admin()
    or public.teacher_teaches_batch(batch_id)
  );
create policy students_admin_write on public.students for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- teachers: own row; admin full. Students get teacher names via profiles, not here.
-- ---------------------------------------------------------------------------
create policy teachers_select on public.teachers
  for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy teachers_admin_write on public.teachers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- subject_teachers
-- ---------------------------------------------------------------------------
create policy subject_teachers_select on public.subject_teachers
  for select to authenticated
  using (
    public.is_admin()
    or teacher_id = auth.uid()
    or public.student_enrolled_in_batch_subject(batch_subject_id)
  );
create policy subject_teachers_admin_write on public.subject_teachers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- timetable_slots
-- ---------------------------------------------------------------------------
create policy timetable_slots_select on public.timetable_slots
  for select to authenticated
  using (
    public.is_admin()
    or teacher_id = auth.uid()
    or public.student_enrolled_in_batch_subject(batch_subject_id)
  );
create policy timetable_slots_admin_write on public.timetable_slots for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- holidays: readable by all signed-in users; admin writes.
-- ---------------------------------------------------------------------------
create policy holidays_select on public.holidays for select to authenticated using (true);
create policy holidays_admin_write on public.holidays for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- class_sessions
--   student: sessions of their (active) batch enrolment
--   teacher: own sessions; may update while scheduled_end > now() (columns limited by trigger)
--   admin:   full
-- ---------------------------------------------------------------------------
create policy class_sessions_select on public.class_sessions
  for select to authenticated
  using (
    public.is_admin()
    or teacher_id = auth.uid()
    or public.student_enrolled_in_batch_subject(batch_subject_id)
  );
create policy class_sessions_teacher_update on public.class_sessions
  for update to authenticated
  using (teacher_id = auth.uid() and scheduled_end > now())
  with check (teacher_id = auth.uid());
create policy class_sessions_admin_insert on public.class_sessions
  for insert to authenticated with check (public.is_admin());
create policy class_sessions_admin_update on public.class_sessions
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy class_sessions_admin_delete on public.class_sessions
  for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- attendance
--   student: insert own row (window enforced by trigger), read own rows
--   teacher: read rows for own sessions
--   admin:   full
-- ---------------------------------------------------------------------------
create policy attendance_student_insert on public.attendance
  for insert to authenticated
  with check (student_id = auth.uid() and public.is_student());
create policy attendance_select on public.attendance
  for select to authenticated
  using (
    student_id = auth.uid()
    or public.is_admin()
    or exists (select 1 from public.class_sessions cs
               where cs.id = attendance.class_session_id and cs.teacher_id = auth.uid())
  );
create policy attendance_admin_write on public.attendance for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- recordings
--   student: only while enrolled AND now() < expires_at AND available
--   teacher: own sessions
--   admin:   full
-- Readable row != playable file: playback goes through the recording-play Edge Function.
-- ---------------------------------------------------------------------------
create policy recordings_select on public.recordings
  for select to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.class_sessions cs
               where cs.id = recordings.class_session_id and cs.teacher_id = auth.uid())
    or (
      status = 'available'
      and now() < expires_at
      and exists (select 1 from public.class_sessions cs
                  where cs.id = recordings.class_session_id
                    and public.student_enrolled_in_batch_subject(cs.batch_subject_id))
    )
  );
create policy recordings_admin_write on public.recordings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- audit_log: admins read. Nobody writes directly; use public.log_audit().
-- ---------------------------------------------------------------------------
create policy audit_log_admin_select on public.audit_log
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
revoke execute on function public.log_audit(text, text, uuid, jsonb) from public, anon;
grant execute on function public.log_audit(text, text, uuid, jsonb) to authenticated, service_role;
