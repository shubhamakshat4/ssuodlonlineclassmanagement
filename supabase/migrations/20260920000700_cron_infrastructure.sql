-- Phase 5: cron infrastructure (pg_cron + pg_net -> Edge Functions).
--
-- Guarded so the same migration applies on plain Postgres (tests) and on Supabase cloud.
-- On Supabase the operator must store two Vault secrets once (see docs/RUNBOOK.md):
--   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
--   select vault.create_secret('<service role key>', 'service_role_key');

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
  end if;
exception when others then
  raise notice 'cron extensions not installed here: %', sqlerrm;
end $$;

-- Invoke an Edge Function server-to-server with the service-role key from Vault.
-- Returns the pg_net request id, or null when pg_net / vault are unavailable.
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
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_key using 'service_role_key';
  if v_url is null or v_key is null then
    raise notice 'vault secrets project_url / service_role_key missing; skipping %', p_name;
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

-- Schedules (UTC on Supabase). 19:30 UTC = 01:00 IST.
do $$
begin
  if to_regprocedure('cron.schedule(text, text, text)') is not null then
    perform cron.unschedule(jobid) from cron.job where jobname = 'ssu-generate-sessions';
    perform cron.schedule('ssu-generate-sessions', '30 19 * * *', $c$select public.invoke_edge_function('cron-generate-sessions')$c$);
  end if;
end $$;
