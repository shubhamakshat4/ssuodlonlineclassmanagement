-- Cron -> Edge Function calls authenticate with a dedicated CRON_SECRET (Vault name `cron_secret`),
-- falling back to `service_role_key` for projects set up the old way. The Edge runtime injects the
-- new-style secret API key as SUPABASE_SERVICE_ROLE_KEY, so a legacy JWT stored in Vault would not match;
-- a purpose-made secret sidesteps key-format churn entirely.

create or replace function public.invoke_edge_function(p_name text, p_body jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text;
  v_key text;
  v_id bigint;
begin
  if to_regprocedure('net.http_post(text, jsonb, jsonb, jsonb, integer)') is null then
    raise notice 'pg_net not available; skipping %', p_name;
    return null;
  end if;
  if to_regclass('vault.decrypted_secrets') is null then
    raise notice 'vault not available; skipping %', p_name;
    return null;
  end if;

  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_url using 'project_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_key using 'cron_secret';
  if v_key is null then
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_key using 'service_role_key';
  end if;
  if v_url is null or v_key is null then
    raise notice 'vault secrets project_url / cron_secret missing; skipping %', p_name;
    return null;
  end if;

  execute $q$select net.http_post(
      url := $1,
      body := $2,
      params := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || $3),
      timeout_milliseconds := 120000)$q$
    into v_id
    using rtrim(v_url, '/') || '/functions/v1/' || p_name, p_body, v_key;
  return v_id;
end;
$$;

revoke execute on function public.invoke_edge_function(text, jsonb) from public, anon, authenticated;
