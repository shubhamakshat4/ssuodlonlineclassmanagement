-- Phase 4: timetable clash detection enforced in the database.
-- A slot clashes with another active slot when they share a weekday, their time ranges overlap,
-- their effective date ranges overlap, and either the same teacher or the same batch is involved.

create or replace function public.timetable_slots_clash_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id uuid;
  v_clash record;
begin
  if not new.is_active then
    return new;
  end if;

  select bs.batch_id into v_batch_id from public.batch_subjects bs where bs.id = new.batch_subject_id;

  select ts.id, ts.start_time, ts.end_time, ts.teacher_id, bs.batch_id,
         b.code as batch_code, s.code as subject_code, p.full_name as teacher_name
    into v_clash
  from public.timetable_slots ts
  join public.batch_subjects bs on bs.id = ts.batch_subject_id
  join public.batches b on b.id = bs.batch_id
  join public.subjects s on s.id = bs.subject_id
  left join public.profiles p on p.id = ts.teacher_id
  where ts.id <> new.id
    and ts.is_active
    and ts.day_of_week = new.day_of_week
    and ts.start_time < new.end_time
    and new.start_time < ts.end_time
    and ts.effective_from <= coalesce(new.effective_to, 'infinity'::date)
    and new.effective_from <= coalesce(ts.effective_to, 'infinity'::date)
    and (ts.teacher_id = new.teacher_id or bs.batch_id = v_batch_id)
  order by ts.start_time
  limit 1;

  if found then
    if v_clash.teacher_id = new.teacher_id and v_clash.batch_id = v_batch_id then
      raise exception 'Clash: % already has % (%) for % at %–%',
        v_clash.teacher_name, v_clash.subject_code, v_clash.batch_code, v_clash.batch_code,
        to_char(v_clash.start_time, 'HH24:MI'), to_char(v_clash.end_time, 'HH24:MI')
        using errcode = '23P01';
    elsif v_clash.teacher_id = new.teacher_id then
      raise exception 'Teacher clash: % is already teaching % (%) at %–% on that day',
        v_clash.teacher_name, v_clash.subject_code, v_clash.batch_code,
        to_char(v_clash.start_time, 'HH24:MI'), to_char(v_clash.end_time, 'HH24:MI')
        using errcode = '23P01';
    else
      raise exception 'Batch clash: % already has % with % at %–% on that day',
        v_clash.batch_code, v_clash.subject_code, v_clash.teacher_name,
        to_char(v_clash.start_time, 'HH24:MI'), to_char(v_clash.end_time, 'HH24:MI')
        using errcode = '23P01';
    end if;
  end if;

  return new;
end;
$$;

create trigger timetable_slots_clash_check
  before insert or update on public.timetable_slots
  for each row execute function public.timetable_slots_clash_check();
