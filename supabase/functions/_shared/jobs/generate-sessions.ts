/**
 * Job: expand active timetable slots into class_sessions over the configured horizon.
 * Runs nightly (cron-generate-sessions) and on demand from the admin Sessions screen.
 * Idempotent: UNIQUE(timetable_slot_id, scheduled_start) + ignoreDuplicates.
 */
import { addDays, zonedDateString } from '../time.ts';
import { expandSlots, type HolidayInput, type SlotInput } from '../timetable.ts';
import { audit, unwrap, type DbClient } from '../db.ts';

export interface GenerateResult {
  from: string;
  to: string;
  candidates: number;
  inserted: number;
  slots: number;
}

interface SlotRow {
  id: string;
  batch_subject_id: string;
  teacher_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  batch_subjects: { batch_id: string; is_active: boolean; batches: { is_active: boolean } };
}

export async function runGenerateSessions(db: DbClient, opts: { now?: Date; horizonDays?: number } = {}): Promise<GenerateResult> {
  const now = opts.now ?? new Date();
  const settings = unwrap<{ timezone: string; session_generation_horizon_days: number }>(
    await db.from('app_settings').select('timezone, session_generation_horizon_days').eq('id', 1).single(),
    'load settings',
  );
  const tz = settings.timezone || 'Asia/Kolkata';
  const horizonDays = opts.horizonDays ?? settings.session_generation_horizon_days ?? 21;
  const from = zonedDateString(now, tz);
  const to = addDays(from, horizonDays - 1);

  const slotRows = unwrap<SlotRow[]>(
    await db
      .from('timetable_slots')
      .select('id, batch_subject_id, teacher_id, day_of_week, start_time, end_time, effective_from, effective_to, is_active, batch_subjects!inner(batch_id, is_active, batches!inner(is_active))')
      .eq('is_active', true)
      .lte('effective_from', to)
      .or(`effective_to.is.null,effective_to.gte.${from}`),
    'load slots',
  );
  const slots: SlotInput[] = slotRows.map((r) => ({
    id: r.id,
    batch_subject_id: r.batch_subject_id,
    teacher_id: r.teacher_id,
    day_of_week: r.day_of_week,
    start_time: r.start_time,
    end_time: r.end_time,
    effective_from: r.effective_from,
    effective_to: r.effective_to,
    is_active: r.is_active,
    batch_id: r.batch_subjects.batch_id,
    offering_active: r.batch_subjects.is_active && r.batch_subjects.batches.is_active,
  }));

  const holidays = unwrap<HolidayInput[]>(await db.from('holidays').select('date, batch_id').gte('date', from).lte('date', to), 'load holidays');

  const candidates = expandSlots(slots, holidays, { from, horizonDays, tz, now });

  let inserted = 0;
  const CHUNK = 200;
  for (let i = 0; i < candidates.length; i += CHUNK) {
    const chunk = candidates.slice(i, i + CHUNK);
    const res = await db.from('class_sessions').upsert(chunk, { onConflict: 'timetable_slot_id,scheduled_start', ignoreDuplicates: true }).select('id');
    if (res.error) throw new Error(`insert sessions: ${res.error.message}`);
    inserted += (res.data as unknown[] | null)?.length ?? 0;
  }

  const result: GenerateResult = { from, to, candidates: candidates.length, inserted, slots: slots.length };
  await audit(db, 'sessions.generated', 'class_sessions', null, { ...result });
  return result;
}

/** Mark scheduled sessions whose end time has passed as completed (needed by the recording harvester). */
export async function completePastSessions(db: DbClient, now: Date = new Date()): Promise<number> {
  const res = await db.from('class_sessions').update({ status: 'completed' }).eq('status', 'scheduled').lt('scheduled_end', now.toISOString()).select('id');
  if (res.error) throw new Error(`complete past sessions: ${res.error.message}`);
  return (res.data as unknown[] | null)?.length ?? 0;
}
