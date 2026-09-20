-- Phase 1: role helpers used by RLS policies and triggers, plus v_class_sessions.
--
-- Helpers are SECURITY DEFINER so they can read profiles/students without recursing into
-- the caller's RLS policies. Each one pins search_path and is STABLE.

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and is_active;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'admin', false);
$$;

create or replace function public.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'teacher', false);
$$;

create or replace function public.is_student()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'student', false);
$$;

-- The calling student's batch, only while they are an active student with an active profile.
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

-- True when the caller is an active student enrolled in the batch that owns this batch_subject.
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
      and bs.batch_id = public.current_student_batch_id()
  );
$$;

-- True when the caller is a teacher assigned to this batch_subject (via subject_teachers,
-- a timetable slot, or an existing session).
create or replace function public.teacher_teaches_batch_subject(p_batch_subject_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_teacher() and (
    exists (select 1 from public.subject_teachers st
            where st.batch_subject_id = p_batch_subject_id and st.teacher_id = auth.uid())
    or exists (select 1 from public.timetable_slots ts
            where ts.batch_subject_id = p_batch_subject_id and ts.teacher_id = auth.uid())
    or exists (select 1 from public.class_sessions cs
            where cs.batch_subject_id = p_batch_subject_id and cs.teacher_id = auth.uid())
  );
$$;

create or replace function public.teacher_teaches_batch(p_batch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_teacher() and exists (
    select 1
    from public.batch_subjects bs
    where bs.batch_id = p_batch_id
      and (
        exists (select 1 from public.subject_teachers st where st.batch_subject_id = bs.id and st.teacher_id = auth.uid())
        or exists (select 1 from public.timetable_slots ts where ts.batch_subject_id = bs.id and ts.teacher_id = auth.uid())
        or exists (select 1 from public.class_sessions cs where cs.batch_subject_id = bs.id and cs.teacher_id = auth.uid())
      )
  );
$$;

-- True when the caller is a student whose batch is taught by the given teacher.
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
    where bs.batch_id = public.current_student_batch_id()
      and (
        exists (select 1 from public.subject_teachers st where st.batch_subject_id = bs.id and st.teacher_id = p_teacher_id)
        or exists (select 1 from public.class_sessions cs where cs.batch_subject_id = bs.id and cs.teacher_id = p_teacher_id)
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Join window: open from (start - lead) until end, only for scheduled sessions.
-- The single definition used by the attendance trigger and by the UI (via the view).
-- ---------------------------------------------------------------------------
create or replace function public.join_window_opens_at(p_scheduled_start timestamptz)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select p_scheduled_start - make_interval(mins => public.app_setting_int('join_window_lead_minutes'));
$$;

create or replace function public.join_window_is_open(p_scheduled_start timestamptz, p_scheduled_end timestamptz, p_status public.session_status)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_status = 'scheduled'
     and now() >= public.join_window_opens_at(p_scheduled_start)
     and now() <= p_scheduled_end;
$$;

-- ---------------------------------------------------------------------------
-- Audit helper: any authenticated caller can append an audit row via this function only.
-- actor_id is always taken from the JWT (or null for service contexts), never from the caller.
-- ---------------------------------------------------------------------------
create or replace function public.log_audit(p_action text, p_entity text, p_entity_id uuid, p_payload jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  insert into public.audit_log (actor_id, action, entity, entity_id, payload)
  values (auth.uid(), p_action, p_entity, p_entity_id, coalesce(p_payload, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- v_class_sessions — the one place the effective-URL precedence rule lives.
-- security_invoker so every underlying RLS policy still applies to the caller.
-- ---------------------------------------------------------------------------
create or replace view public.v_class_sessions
with (security_invoker = true)
as
select
  cs.id,
  cs.batch_subject_id,
  cs.teacher_id,
  cs.timetable_slot_id,
  cs.scheduled_start,
  cs.scheduled_end,
  cs.status,
  cs.topic,
  cs.provider,
  cs.graph_event_id,
  cs.graph_online_meeting_id,
  cs.teams_join_url,
  cs.join_url_override,
  cs.override_set_by,
  cs.override_set_at,
  cs.sync_status,
  cs.sync_attempts,
  cs.sync_error,
  cs.created_at,
  cs.updated_at,
  coalesce(cs.join_url_override, cs.teams_join_url) as effective_join_url,
  (cs.join_url_override is not null)                 as has_override,
  public.join_window_opens_at(cs.scheduled_start)    as join_window_opens_at,
  public.join_window_is_open(cs.scheduled_start, cs.scheduled_end, cs.status) as join_window_open,
  bs.batch_id,
  bs.semester,
  b.code        as batch_code,
  b.name        as batch_name,
  s.id          as subject_id,
  s.code        as subject_code,
  s.name        as subject_name,
  p.full_name   as teacher_name
from public.class_sessions cs
join public.batch_subjects bs on bs.id = cs.batch_subject_id
join public.batches b on b.id = bs.batch_id
join public.subjects s on s.id = bs.subject_id
left join public.profiles p on p.id = cs.teacher_id;

grant select on public.v_class_sessions to authenticated, service_role;
