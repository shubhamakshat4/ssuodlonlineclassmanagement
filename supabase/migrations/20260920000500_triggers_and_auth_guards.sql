-- Phase 1: integrity triggers that the client can never bypass, plus auth guards.
--
-- 1. class_sessions BEFORE UPDATE — teacher column restriction (§5), override side effects (§9),
--    reschedule/cancel bookkeeping (§7.5), audit rows.
-- 2. attendance BEFORE INSERT — join window + enrolment (§10), server-side clicked_at.
-- 3. Auth guards — Google may only *link* to pre-provisioned students at the allowed domain;
--    teachers/admins are email+password only (§6).

-- ---------------------------------------------------------------------------
-- 1. class_sessions guard
-- ---------------------------------------------------------------------------
create or replace function public.class_sessions_before_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_role public.user_role := public.current_user_role();
begin
  -- Teachers: only join_url_override / topic, only before the session ends.
  if v_uid is not null and v_role = 'teacher' then
    if old.scheduled_end <= now() then
      raise exception 'This class has already ended; its link can no longer be changed'
        using errcode = '42501';
    end if;
    if new.batch_subject_id        is distinct from old.batch_subject_id
    or new.teacher_id              is distinct from old.teacher_id
    or new.timetable_slot_id       is distinct from old.timetable_slot_id
    or new.scheduled_start         is distinct from old.scheduled_start
    or new.scheduled_end           is distinct from old.scheduled_end
    or new.status                  is distinct from old.status
    or new.provider                is distinct from old.provider
    or new.graph_event_id          is distinct from old.graph_event_id
    or new.graph_online_meeting_id is distinct from old.graph_online_meeting_id
    or new.teams_join_url          is distinct from old.teams_join_url
    or new.sync_status             is distinct from old.sync_status
    or new.sync_attempts           is distinct from old.sync_attempts
    or new.sync_error              is distinct from old.sync_error
    or new.sync_claimed_at         is distinct from old.sync_claimed_at
    or new.created_at              is distinct from old.created_at
    then
      raise exception 'Teachers may only change the join link override and the topic'
        using errcode = '42501';
    end if;
    -- A teacher can never spoof who set the override.
    if new.join_url_override is not distinct from old.join_url_override
       and (new.override_set_by is distinct from old.override_set_by
            or new.override_set_at is distinct from old.override_set_at) then
      raise exception 'override_set_by / override_set_at are maintained by the server'
        using errcode = '42501';
    end if;
  end if;

  -- Override set / changed / cleared: side effects apply for every caller.
  if new.join_url_override is distinct from old.join_url_override then
    if new.join_url_override is not null then
      new.join_url_override := trim(new.join_url_override);
      if new.join_url_override !~* '^https://[^[:space:]]+$' then
        raise exception 'The join link must be an https:// URL' using errcode = '22023';
      end if;
      new.provider        := 'custom';
      new.teams_join_url  := null;          -- nobody should land in the empty Teams room
      new.override_set_by := coalesce(v_uid, new.override_set_by);
      new.override_set_at := now();
      perform public.log_audit('session.override_set', 'class_sessions', new.id,
        jsonb_build_object('join_url_override', new.join_url_override,
                           'previous_override', old.join_url_override,
                           'had_teams_event', old.graph_event_id is not null));
    else
      -- Revert to the auto-generated Teams link: re-queue for provisioning.
      new.provider        := 'teams';
      new.override_set_by := null;
      new.override_set_at := null;
      if new.status = 'scheduled' then
        new.sync_status   := 'pending';
        new.sync_attempts := 0;
        new.sync_error    := null;
      end if;
      perform public.log_audit('session.override_cleared', 'class_sessions', new.id,
        jsonb_build_object('previous_override', old.join_url_override));
    end if;
  end if;

  -- Reschedule of a provisioned Teams session: the provisioner patches the event.
  if (new.scheduled_start, new.scheduled_end) is distinct from (old.scheduled_start, old.scheduled_end)
     and new.status = 'scheduled' and new.provider = 'teams' and new.graph_event_id is not null
     and new.sync_status = old.sync_status then
    new.sync_status   := 'pending';
    new.sync_attempts := 0;
    new.sync_error    := null;
    perform public.log_audit('session.rescheduled', 'class_sessions', new.id,
      jsonb_build_object('from', jsonb_build_object('start', old.scheduled_start, 'end', old.scheduled_end),
                         'to',   jsonb_build_object('start', new.scheduled_start, 'end', new.scheduled_end)));
  end if;

  -- Cancellation: the provisioner deletes the Graph event when one exists.
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    new.sync_status := 'cancelled';
    perform public.log_audit('session.cancelled', 'class_sessions', new.id,
      jsonb_build_object('had_teams_event', new.graph_event_id is not null));
  end if;

  return new;
end;
$$;

create trigger class_sessions_before_update
  before update on public.class_sessions
  for each row execute function public.class_sessions_before_update();

-- Teachers can never insert sessions (policy), but belt-and-braces for status/provider defaults.
create or replace function public.class_sessions_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.join_url_override is not null then
    new.join_url_override := trim(new.join_url_override);
    if new.join_url_override !~* '^https://[^[:space:]]+$' then
      raise exception 'The join link must be an https:// URL' using errcode = '22023';
    end if;
    new.provider := 'custom';
    new.override_set_at := coalesce(new.override_set_at, now());
    new.override_set_by := coalesce(new.override_set_by, auth.uid());
  end if;
  if new.status = 'cancelled' then
    new.sync_status := 'cancelled';
  end if;
  return new;
end;
$$;

create trigger class_sessions_before_insert
  before insert on public.class_sessions
  for each row execute function public.class_sessions_before_insert();

-- ---------------------------------------------------------------------------
-- 2. attendance guard
-- ---------------------------------------------------------------------------
create or replace function public.attendance_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  s record;
begin
  -- Server contexts (service role, seed) carry no JWT and may backfill rows.
  if v_uid is null then
    return new;
  end if;

  if new.student_id <> v_uid then
    raise exception 'You can only record your own attendance' using errcode = '42501';
  end if;

  select cs.scheduled_start, cs.scheduled_end, cs.status, cs.batch_subject_id
    into s
  from public.class_sessions cs
  where cs.id = new.class_session_id;

  if not found then
    raise exception 'Session not found' using errcode = 'P0002';
  end if;
  if not public.student_enrolled_in_batch_subject(s.batch_subject_id) then
    raise exception 'You are not enrolled in this class' using errcode = '42501';
  end if;
  if s.status <> 'scheduled' then
    raise exception 'This class is %', s.status using errcode = 'P0001';
  end if;
  if not public.join_window_is_open(s.scheduled_start, s.scheduled_end, s.status) then
    raise exception 'Join window is closed' using errcode = 'P0001';
  end if;

  new.clicked_at := now();   -- never trust a client timestamp
  return new;
end;
$$;

create trigger attendance_before_insert
  before insert on public.attendance
  for each row execute function public.attendance_before_insert();

-- Students may never update or delete attendance rows (no policy grants it); admins can.

-- ---------------------------------------------------------------------------
-- 3. Auth guards
-- ---------------------------------------------------------------------------

-- Is this email at the allowed student domain?
create or replace function public.is_allowed_student_email(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_email is not null
     and split_part(lower(p_email), '@', 2) = lower(public.app_setting_text('allowed_student_domain'));
$$;

-- Supabase Auth "before user created" hook (configured in config.toml / dashboard).
-- Every legitimate user is pre-provisioned by an admin through the Admin API, so any
-- *new* user arriving through Google is by definition unknown and is rejected.
create or replace function public.before_user_created_hook(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email    text := lower(coalesce(event->'user'->>'email', ''));
  v_provider text := coalesce(event->'user'->'app_metadata'->>'provider', '');
  v_google   boolean := v_provider = 'google'
                        or coalesce(event->'user'->'app_metadata'->'providers', '[]'::jsonb) ? 'google';
begin
  if v_google then
    if not public.is_allowed_student_email(v_email) then
      return jsonb_build_object('error', jsonb_build_object(
        'http_code', 403,
        'message', 'Please sign in with your @' || public.app_setting_text('allowed_student_domain') || ' account.'));
    end if;
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'This account is not registered as an ODL student. Contact the ODL office.'));
  end if;
  return '{}'::jsonb;
end;
$$;

-- Defence in depth: the same rule as a trigger on auth.users, for projects where the hook
-- is not enabled. Google can only ever link to an existing (admin-created) user.
create or replace function public.auth_users_before_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_provider text := coalesce(new.raw_app_meta_data->>'provider', '');
  v_google   boolean := v_provider = 'google'
                        or coalesce(new.raw_app_meta_data->'providers', '[]'::jsonb) ? 'google';
begin
  if v_google then
    raise exception 'This account is not registered as an ODL student. Contact the ODL office.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Google identities may only attach to student profiles at the allowed domain. This is what
-- blocks the Google provider for teacher/admin accounts (§6) even when their email matches.
create or replace function public.auth_identities_before_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role  public.user_role;
  v_email text := lower(coalesce(new.identity_data->>'email', ''));
begin
  if new.provider = 'google' then
    select role into v_role from public.profiles where id = new.user_id and is_active;
    if v_role is distinct from 'student' then
      raise exception 'Google sign-in is only available to students. Teachers and admins use email and password.'
        using errcode = '42501';
    end if;
    if not public.is_allowed_student_email(v_email) then
      raise exception 'Please sign in with your @% account.', public.app_setting_text('allowed_student_domain')
        using errcode = '42501';
    end if;
    if not exists (select 1 from public.students s where s.id = new.user_id) then
      raise exception 'This account is not registered as an ODL student. Contact the ODL office.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger auth_users_before_insert_guard
  before insert on auth.users
  for each row execute function public.auth_users_before_insert_guard();

create trigger auth_identities_before_insert_guard
  before insert on auth.identities
  for each row execute function public.auth_identities_before_insert_guard();

-- Only the auth server may call the hook.
revoke execute on function public.before_user_created_hook(jsonb) from public, anon, authenticated;
grant execute on function public.before_user_created_hook(jsonb) to supabase_auth_admin;
grant execute on function public.auth_users_before_insert_guard() to supabase_auth_admin;
grant execute on function public.auth_identities_before_insert_guard() to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;
