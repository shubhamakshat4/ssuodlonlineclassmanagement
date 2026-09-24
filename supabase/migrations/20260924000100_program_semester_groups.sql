-- Real-data model change (24 Sep 2026)
--
-- Classes are timetabled per PROGRAMME + SEMESTER ("BBA - Semester 1"), not per intake cohort.
-- A student attends one such group, and may additionally attend a second one (e.g. repeating a
-- semester they missed). The existing `batches` table becomes that teaching group:
--
--   batches.code           'BBA-S1'
--   batches.name           'BBA - Semester 1'
--   batches.current_semester = the semester number
--
-- The intake cohort the student actually enrolled in ('Feb-2026 (2026-28)') moves onto `students`,
-- which keeps the group model clean while preserving admissions information.

alter table public.students
  add column if not exists secondary_batch_id uuid references public.batches (id) on delete set null,
  add column if not exists enrollment_no text,
  add column if not exists intake_session text,
  add column if not exists personal_email citext;

create index if not exists students_secondary_batch_idx on public.students (secondary_batch_id);

comment on column public.students.batch_id is 'Primary class group (programme + semester)';
comment on column public.students.secondary_batch_id is 'Optional second class group, e.g. a back-semester the student is catching up on';

-- A student cannot have the same group twice.
alter table public.students drop constraint if exists students_distinct_groups;
alter table public.students add constraint students_distinct_groups
  check (secondary_batch_id is null or secondary_batch_id <> batch_id);

-- ---------------------------------------------------------------------------
-- Both groups now drive visibility. Everything that asked "which batch is this
-- student in?" becomes "which batches?".
-- ---------------------------------------------------------------------------
create or replace function public.current_student_batch_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select array_remove(array[s.batch_id, s.secondary_batch_id], null)
  from public.students s
  join public.profiles p on p.id = s.id
  where s.id = auth.uid() and s.status = 'active' and p.is_active and p.role = 'student';
$$;

-- Kept for compatibility: the primary group only.
create or replace function public.current_student_batch_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.batch_id
  from public.students s
  join public.profiles p on p.id = s.id
  where s.id = auth.uid() and s.status = 'active' and p.is_active and p.role = 'student';
$$;

create or replace function public.student_enrolled_in_batch_subject(p_batch_subject_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.batch_subjects bs
    where bs.id = p_batch_subject_id
      and bs.is_active
      and bs.batch_id = any (coalesce(public.current_student_batch_ids(), '{}'::uuid[]))
  );
$$;

create or replace function public.student_sees_teacher(p_teacher_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.batch_subjects bs
    where bs.batch_id = any (coalesce(public.current_student_batch_ids(), '{}'::uuid[]))
      and (
        exists (select 1 from public.subject_teachers st where st.batch_subject_id = bs.id and st.teacher_id = p_teacher_id)
        or exists (select 1 from public.class_sessions cs where cs.batch_subject_id = bs.id and cs.teacher_id = p_teacher_id)
      )
  );
$$;

-- Policies that scoped on the single batch must now accept either group.
drop policy if exists batches_select on public.batches;
create policy batches_select on public.batches
  for select to authenticated
  using (
    public.is_admin()
    or id = any (coalesce(public.current_student_batch_ids(), '{}'::uuid[]))
    or public.teacher_teaches_batch(id)
  );

drop policy if exists batch_subjects_select on public.batch_subjects;
create policy batch_subjects_select on public.batch_subjects
  for select to authenticated
  using (
    public.is_admin()
    or (batch_id = any (coalesce(public.current_student_batch_ids(), '{}'::uuid[])) and is_active)
    or public.teacher_teaches_batch_subject(id)
  );

-- Admin convenience: class groups with their programme and how many students attend them.
create or replace view public.v_class_groups
with (security_invoker = true)
as
select b.id,
       b.code,
       b.name,
       b.program_id,
       p.code as program_code,
       p.name as program_name,
       b.current_semester as semester,
       b.is_active,
       (select count(*) from public.students s where s.batch_id = b.id) as primary_students,
       (select count(*) from public.students s where s.secondary_batch_id = b.id) as secondary_students,
       (select count(*) from public.batch_subjects bs where bs.batch_id = b.id and bs.is_active) as subjects,
       (select count(*) from public.class_sessions cs
          join public.batch_subjects bs2 on bs2.id = cs.batch_subject_id
         where bs2.batch_id = b.id and cs.status = 'scheduled' and cs.scheduled_end > now()) as upcoming_sessions
from public.batches b
join public.programs p on p.id = b.program_id;

grant select on public.v_class_groups to authenticated, service_role;
