/**
 * Timetable expansion (SPEC §7.1): turn recurring weekly slots into concrete class sessions
 * over a date horizon, skipping holidays, honouring effective ranges, timezone-correct.
 * Pure and runtime-neutral; shared by the Edge Function and the admin "Generate now" action.
 */
import { addDays, dateRange, weekdayOfDate, zonedDateString, zonedTimeToUtc } from './time.ts';

export interface SlotInput {
  id: string;
  batch_subject_id: string;
  teacher_id: string;
  day_of_week: number; // 0=Sun..6=Sat
  start_time: string; // 'HH:MM[:SS]'
  end_time: string;
  effective_from: string; // 'YYYY-MM-DD'
  effective_to: string | null;
  is_active: boolean;
  /** batch the slot belongs to (via batch_subjects) — needed for per-batch holidays */
  batch_id: string;
  /** false when the batch_subject or batch is inactive */
  offering_active?: boolean;
}

export interface HolidayInput {
  date: string;
  batch_id: string | null; // null = all batches
}

export interface GeneratedSession {
  timetable_slot_id: string;
  batch_subject_id: string;
  teacher_id: string;
  scheduled_start: string; // ISO UTC
  scheduled_end: string;
  status: 'scheduled';
  sync_status: 'pending';
  provider: 'teams';
}

export interface ExpandOptions {
  /** first calendar date to generate (inclusive), in the zone's calendar; default: today in tz */
  from?: string;
  horizonDays: number;
  tz: string;
  now?: Date;
}

export function isHoliday(date: string, batchId: string, holidays: HolidayInput[]): boolean {
  return holidays.some((h) => h.date === date && (h.batch_id === null || h.batch_id === batchId));
}

/**
 * Expand slots into sessions. Idempotency is the database's job (UNIQUE(timetable_slot_id,
 * scheduled_start) + ON CONFLICT DO NOTHING); this function is deterministic for a given input.
 */
export function expandSlots(slots: SlotInput[], holidays: HolidayInput[], opts: ExpandOptions): GeneratedSession[] {
  const now = opts.now ?? new Date();
  const from = opts.from ?? zonedDateString(now, opts.tz);
  const to = addDays(from, Math.max(0, opts.horizonDays - 1));
  const out: GeneratedSession[] = [];

  for (const slot of slots) {
    if (!slot.is_active || slot.offering_active === false) continue;
    if (slot.day_of_week < 0 || slot.day_of_week > 6) continue;
    for (const date of dateRange(from, to)) {
      if (weekdayOfDate(date) !== slot.day_of_week) continue;
      if (date < slot.effective_from) continue;
      if (slot.effective_to && date > slot.effective_to) continue;
      if (isHoliday(date, slot.batch_id, holidays)) continue;
      const start = zonedTimeToUtc(date, slot.start_time, opts.tz);
      const end = zonedTimeToUtc(date, slot.end_time, opts.tz);
      if (end <= start) continue; // defensive; the DB check constraint also forbids it
      out.push({
        timetable_slot_id: slot.id,
        batch_subject_id: slot.batch_subject_id,
        teacher_id: slot.teacher_id,
        scheduled_start: start.toISOString(),
        scheduled_end: end.toISOString(),
        status: 'scheduled',
        sync_status: 'pending',
        provider: 'teams',
      });
    }
  }
  out.sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start) || a.timetable_slot_id.localeCompare(b.timetable_slot_id));
  return out;
}
