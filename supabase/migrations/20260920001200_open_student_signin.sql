-- Student sign-in rule (decision 21 Sep 2026, replaces the "pre-provisioned only" rule):
--   * any Google account at the allowed domain may sign in; a student profile is created automatically
--   * a student with no batch mapping sees "No class mapped - contact admin" (RLS already shows nothing)
--   * admins map the student to a batch + roll number under /admin/students
--   * teachers/admins remain email + password only; Google is still blocked for them
--   * personal Gmail / other domains are still rejected server-side

-- Hook: reject Google sign-ups outside the allowed domain; everything else proceeds.
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
  if v_google and not public.is_allowed_student_email(v_email) then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'Please sign in with your @' || public.app_setting_text('allowed_student_domain') || ' account.'));
  end if;
  return '{}'::jsonb;
end;
$$;

-- auth.users guard: same rule as a trigger (defence in depth).
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
  if v_google and not public.is_allowed_student_email(new.email) then
    raise exception 'Please sign in with your @% account.', public.app_setting_text('allowed_student_domain')
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- New Google users get a student profile automatically (no batch yet). Admin-created users
-- (provider = email) keep being provisioned by the app, so nothing happens for them here.
create or replace function public.auth_users_after_insert_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_provider text := coalesce(new.raw_app_meta_data->>'provider', '');
  v_google   boolean := v_provider = 'google'
                        or coalesce(new.raw_app_meta_data->'providers', '[]'::jsonb) ? 'google';
  v_name     text;
begin
  if v_google and new.email is not null and public.is_allowed_student_email(new.email) then
    v_name := coalesce(
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      nullif(trim(new.raw_user_meta_data->>'name'), ''),
      split_part(new.email, '@', 1));
    insert into public.profiles (id, role, full_name, email)
    values (new.id, 'student', v_name, lower(new.email))
    on conflict (id) do nothing;
    perform public.log_audit('student.self_registered', 'profiles', new.id, jsonb_build_object('email', lower(new.email)));
  end if;
  return new;
end;
$$;

drop trigger if exists auth_users_after_insert_profile on auth.users;
create trigger auth_users_after_insert_profile
  after insert on auth.users
  for each row execute function public.auth_users_after_insert_profile();

-- auth.identities guard: Google may attach only to student profiles at the allowed domain.
-- A missing profile is fine here only for brand-new Google users (the AFTER INSERT trigger above
-- has just created it); for existing users a non-student profile blocks Google.
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
    if not public.is_allowed_student_email(v_email) then
      raise exception 'Please sign in with your @% account.', public.app_setting_text('allowed_student_domain')
        using errcode = '42501';
    end if;
    select role into v_role from public.profiles where id = new.user_id;
    if v_role is not null and v_role <> 'student' then
      raise exception 'Google sign-in is only available to students. Teachers and admins use email and password.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

grant execute on function public.auth_users_after_insert_profile() to supabase_auth_admin;

-- Admin helper: student profiles that are not yet mapped to a batch.
create or replace view public.v_unmapped_students
with (security_invoker = true)
as
select p.id, p.full_name, p.email, p.created_at
from public.profiles p
where p.role = 'student'
  and p.is_active
  and not exists (select 1 from public.students s where s.id = p.id)
order by p.created_at desc;

grant select on public.v_unmapped_students to authenticated, service_role;
