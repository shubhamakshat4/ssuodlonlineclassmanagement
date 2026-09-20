-- Phase 7: meeting provisioning support (SPEC §7.2).
--   claim_pending_sessions(limit)  — FOR UPDATE SKIP LOCKED claim, returns everything the job needs
--   recover_stuck_provisioning()   — rows stuck in 'provisioning' after a crash go back to 'pending'
--   pg_cron: every 10 minutes

create or replace function public.claim_pending_sessions(p_limit int default 20)
returns table (
  id uuid,
  batch_subject_id uuid,
  teacher_id uuid,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  graph_event_id text,
  graph_online_meeting_id text,
  teams_join_url text,
  sync_attempts int,
  subject_name text,
  batch_code text,
  teacher_upn text,
  teacher_entra_user_id uuid,
  timezone text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with claimed as (
    select cs.id
    from public.class_sessions cs
    where cs.sync_status = 'pending'
      and cs.status = 'scheduled'
      and cs.provider = 'teams'
      and cs.scheduled_end > now()
    order by cs.scheduled_start
    limit greatest(1, least(p_limit, 100))
    for update skip locked
  ),
  upd as (
    update public.class_sessions cs
       set sync_status = 'provisioning', sync_claimed_at = now()
      from claimed
     where cs.id = claimed.id
    returning cs.*
  )
  select u.id, u.batch_subject_id, u.teacher_id, u.scheduled_start, u.scheduled_end,
         u.graph_event_id, u.graph_online_meeting_id, u.teams_join_url, u.sync_attempts,
         s.name as subject_name, b.code as batch_code,
         t.entra_upn::text as teacher_upn, t.entra_user_id as teacher_entra_user_id,
         public.app_setting_text('timezone') as timezone
  from upd u
  join public.batch_subjects bs on bs.id = u.batch_subject_id
  join public.batches b on b.id = bs.batch_id
  join public.subjects s on s.id = bs.subject_id
  join public.teachers t on t.id = u.teacher_id
  order by u.scheduled_start;
end;
$$;

create or replace function public.recover_stuck_provisioning(p_older_than interval default interval '15 minutes')
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  update public.class_sessions
     set sync_status = 'pending', sync_claimed_at = null,
         sync_error = coalesce(sync_error, '') || ' [recovered from stuck provisioning]'
   where sync_status = 'provisioning'
     and sync_claimed_at is not null
     and sync_claimed_at < now() - p_older_than;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.claim_pending_sessions(int) from public, anon, authenticated;
revoke execute on function public.recover_stuck_provisioning(interval) from public, anon, authenticated;
grant execute on function public.claim_pending_sessions(int) to service_role;
grant execute on function public.recover_stuck_provisioning(interval) to service_role;

-- Sessions that need their Graph event deleted (cancelled, or teacher switched to a custom link).
create or replace view public.v_sessions_needing_event_deletion
with (security_invoker = true)
as
select id, graph_event_id, status, provider, sync_attempts
from public.class_sessions
where graph_event_id is not null
  and (status = 'cancelled' or provider = 'custom');

grant select on public.v_sessions_needing_event_deletion to service_role;

do $$
begin
  if to_regprocedure('cron.schedule(text, text, text)') is not null then
    perform cron.unschedule(jobid) from cron.job where jobname = 'ssu-provision-meetings';
    perform cron.schedule('ssu-provision-meetings', '*/10 * * * *', $c$select public.invoke_edge_function('cron-provision-meetings')$c$);
  end if;
end $$;
