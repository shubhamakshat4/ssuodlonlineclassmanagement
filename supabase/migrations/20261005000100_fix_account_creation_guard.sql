-- Creating any account through the Admin API failed with "Database error creating new user".
--
-- Cause: the BEFORE INSERT trigger on auth.users was made to require app_metadata.provisioned_by, but
-- GoTrue's Admin API writes the auth.users row FIRST and applies the caller's app_metadata afterwards.
-- The trigger therefore never saw the stamp and rejected every account the ODL office tried to create -
-- which, since Google sign-in was removed, is every account there is. The original migration that added
-- the stamp said as much; the September rewrite reintroduced the rule into the trigger by mistake.
--
-- The rule belongs in before_user_created_hook, which GoTrue calls with the app_metadata before it
-- creates anything, and which is enabled on this project
-- (hook_before_user_created_uri = pg-functions://postgres/public/before_user_created_hook).
--
-- The trigger is left in place but made a pass-through rather than deleted: it is still the attachment
-- point if a future rule needs enforcing on columns that ARE present at insert time, and dropping it
-- would need the auth schema owner. A check that cannot see the field it checks is worse than none, so
-- the check itself goes.

create or replace function public.auth_users_before_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Account-creation rules live in before_user_created_hook: a BEFORE INSERT trigger cannot see
  -- app_metadata, because the Admin API sets it after the row is written.
  return new;
end;
$$;

comment on function public.auth_users_before_insert_guard() is
  'Pass-through. Who may create an account is decided by before_user_created_hook, which is given the app_metadata; this trigger is not.';
