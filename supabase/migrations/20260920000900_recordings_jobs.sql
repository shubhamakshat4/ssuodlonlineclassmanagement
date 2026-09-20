-- Phase 10: recording harvest + expiry support (SPEC §7.4, §8).

-- Completed Teams sessions that ended in the last 48 h and have no recordings row yet.
create or replace view public.v_sessions_awaiting_recording
with (security_invoker = true)
as
select cs.id, cs.graph_online_meeting_id, cs.graph_event_id, cs.scheduled_start, cs.scheduled_end,
       s.name as subject_name, b.code as batch_code
from public.class_sessions cs
join public.batch_subjects bs on bs.id = cs.batch_subject_id
join public.batches b on b.id = bs.batch_id
join public.subjects s on s.id = bs.subject_id
where cs.provider = 'teams'
  and cs.status = 'completed'
  and cs.scheduled_end >= now() - interval '48 hours'
  and cs.scheduled_end <= now()
  and not exists (select 1 from public.recordings r where r.class_session_id = cs.id)
order by cs.scheduled_end;

grant select on public.v_sessions_awaiting_recording to service_role;

-- Daily bookkeeping: flip rows past expires_at. RLS already hides them from students by time;
-- this keeps the status column truthful for admins and reports. Files are never deleted (§7.4).
create or replace function public.expire_recordings()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  update public.recordings
     set status = 'expired'
   where status = 'available'
     and expires_at <= now();
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.expire_recordings() from public, anon, authenticated;
grant execute on function public.expire_recordings() to service_role;

-- Retention lives in app_settings; the harvester reads it from there.
do $$
begin
  if to_regprocedure('cron.schedule(text, text, text)') is not null then
    perform cron.unschedule(jobid) from cron.job where jobname in ('ssu-harvest-recordings', 'ssu-expire-recordings');
    perform cron.schedule('ssu-harvest-recordings', '5 * * * *', $c$select public.invoke_edge_function('cron-harvest-recordings')$c$);
    -- 20:00 UTC = 01:30 IST
    perform cron.schedule('ssu-expire-recordings', '0 20 * * *', $c$select public.invoke_edge_function('cron-expire-recordings')$c$);
  end if;
end $$;
