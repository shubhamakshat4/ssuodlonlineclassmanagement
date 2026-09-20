-- Account-creation rules live entirely in the database so Supabase's global "allow sign-ups"
-- switch can stay ON (it would otherwise block new Google students before our hook runs):
--   * Google + university domain            -> allowed (student profile auto-created, unmapped)
--   * Google + any other domain             -> rejected
--   * email/password (or anything else)     -> allowed only when created by the admin API, which
--                                              stamps app_metadata.provisioned_by (clients cannot set app_metadata)
--   * seed/demo rows stamp provisioned_by too

create or replace function public.before_user_created_hook(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email    text := lower(coalesce(event->'user'->>'email', ''));
  v_meta     jsonb := coalesce(event->'user'->'app_metadata', '{}'::jsonb);
  v_provider text := coalesce(v_meta->>'provider', '');
  v_google   boolean := v_provider = 'google' or coalesce(v_meta->'providers', '[]'::jsonb) ? 'google';
begin
  if v_google then
    if not public.is_allowed_student_email(v_email) then
      return jsonb_build_object('error', jsonb_build_object(
        'http_code', 403,
        'message', 'Please sign in with your @' || public.app_setting_text('allowed_student_domain') || ' account.'));
    end if;
    return '{}'::jsonb;
  end if;
  if coalesce(v_meta->>'provisioned_by', '') = '' then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'Accounts for faculty and staff are created by the ODL office. Students sign in with their university Google account.'));
  end if;
  return '{}'::jsonb;
end;
$$;

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
  if v_google then
    if not public.is_allowed_student_email(new.email) then
      raise exception 'Please sign in with your @% account.', public.app_setting_text('allowed_student_domain')
        using errcode = '42501';
    end if;
    return new;
  end if;
  if coalesce(v_meta->>'provisioned_by', '') = '' then
    raise exception 'Accounts for faculty and staff are created by the ODL office. Students sign in with their university Google account.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
