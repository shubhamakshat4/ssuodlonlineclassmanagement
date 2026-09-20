/**
 * Timetable clash detection (pure). Mirrors the database trigger in
 * supabase/migrations/20260920000600_timetable_clash_check.sql so the UI can explain a clash
 * before submitting; the trigger remains the source of truth.
 */
export interface SlotLike {
  id?: string;
  batch_id: string;
  teacher_id: string;
  day_of_week: number;
  start_time: string; // 'HH:MM' or 'HH:MM:SS'
  end_time: string;
  effective_from: string; // 'YYYY-MM-DD'
  effective_to: string | null;
  is_active?: boolean;
}

export type ClashKind = 'teacher' | 'batch' | 'both';

export interface Clash {
  kind: ClashKind;
  other: SlotLike;
}

const norm = (t: string) => t.slice(0, 5);

export function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return norm(aStart) < norm(bEnd) && norm(bStart) < norm(aEnd);
}

export function dateRangesOverlap(aFrom: string, aTo: string | null, bFrom: string, bTo: string | null): boolean {
  return bFrom <= (aTo ?? '9999-12-31') && aFrom <= (bTo ?? '9999-12-31');
}

export function findClashes(candidate: SlotLike, existing: SlotLike[]): Clash[] {
  if (candidate.is_active === false) return [];
  const out: Clash[] = [];
  for (const other of existing) {
    if (other.id && candidate.id && other.id === candidate.id) continue;
    if (other.is_active === false) continue;
    if (other.day_of_week !== candidate.day_of_week) continue;
    if (!timesOverlap(candidate.start_time, candidate.end_time, other.start_time, other.end_time)) continue;
    if (!dateRangesOverlap(candidate.effective_from, candidate.effective_to, other.effective_from, other.effective_to)) continue;
    const sameTeacher = other.teacher_id === candidate.teacher_id;
    const sameBatch = other.batch_id === candidate.batch_id;
    if (sameTeacher && sameBatch) out.push({ kind: 'both', other });
    else if (sameTeacher) out.push({ kind: 'teacher', other });
    else if (sameBatch) out.push({ kind: 'batch', other });
  }
  return out;
}
