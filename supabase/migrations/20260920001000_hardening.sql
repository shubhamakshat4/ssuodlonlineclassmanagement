-- Phase 12 hardening: rate limiter + privilege tightening.
-- Fixed-window rate limiter shared by all app instances (Vercel functions have no shared
-- memory). Used by the join endpoint and the password login action.

create table public.rate_limits (
  key           text primary key,
  window_start  timestamptz not null,
  hits          int not null default 0
);

alter table public.rate_limits enable row level security;   -- no policies: app roles cannot touch it directly

-- Returns true when the call is allowed, false when the limit for this window is exhausted.
create or replace function public.rate_limit_hit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_hits int;
begin
  insert into public.rate_limits as r (key, window_start, hits)
  values (p_key, v_now, 1)
  on conflict (key) do update
    set hits = case when r.window_start + make_interval(secs => p_window_seconds) <= v_now then 1 else r.hits + 1 end,
        window_start = case when r.window_start + make_interval(secs => p_window_seconds) <= v_now then v_now else r.window_start end
  returning hits into v_hits;
  return v_hits <= p_limit;
end;
$$;

revoke execute on function public.rate_limit_hit(text, int, int) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, int, int) to service_role;

-- Housekeeping: drop stale windows (called from the nightly generate job via cron is overkill; a
-- simple daily cron statement suffices where pg_cron exists).
create or replace function public.rate_limits_cleanup()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  delete from public.rate_limits where window_start < now() - interval '1 day';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.rate_limits_cleanup() from public, anon, authenticated;

do $$
begin
  if to_regprocedure('cron.schedule(text, text, text)') is not null then
    perform cron.unschedule(jobid) from cron.job where jobname = 'ssu-rate-limits-cleanup';
    perform cron.schedule('ssu-rate-limits-cleanup', '15 20 * * *', $c$select public.rate_limits_cleanup()$c$);
  end if;
end $$;

-- Job-only views: Supabase grants app roles SELECT on new public objects by default; these views
-- are for the service role only (RLS would scope them anyway, but least privilege is cheaper).
revoke all on public.v_sessions_needing_event_deletion from public, anon, authenticated;
revoke all on public.v_sessions_awaiting_recording from public, anon, authenticated;
revoke all on public.rate_limits from public, anon, authenticated;
