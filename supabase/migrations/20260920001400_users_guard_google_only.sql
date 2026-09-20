-- GoTrue's Admin API inserts the auth.users row before it applies the caller's app_metadata, so the
-- provisioned_by stamp is not visible to a BEFORE INSERT trigger. The "faculty accounts are created by
-- the ODL office" rule therefore lives in before_user_created_hook only (it does see app_metadata and
-- runs on every public sign-up). The trigger keeps the Google-domain rule as defence in depth.

create or replace function public.auth_users_before_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta     jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
  v_provider text := coalesce(v_meta->>'provider', '');
  v_google   boolean := v_provider = 'google' or coalesce(v_meta->'providers', '[]'::jsonb) ? 'google';
begin
  if v_google and not public.is_allowed_student_email(new.email) then
    raise exception 'Please sign in with your @% account.', public.app_setting_text('allowed_student_domain')
      using errcode = '42501';
  end if;
  return new;
end;
$$;
