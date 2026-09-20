import 'server-only';
import type { createClient } from '@/lib/supabase/server';
import type { AppSettings, ClassSessionView } from '@/lib/db/types';
import { appConfig } from '@/lib/env';
import { addDays, istDate, istToUtc } from '@/lib/domain/time';

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** UTC instant for the start of an IST calendar date. */
export const istDayStart = (date: string) => istToUtc(date, '00:00');

/** Join-window lead minutes from app_settings (falls back to env). */
export async function joinLeadMinutes(supabase: Supabase): Promise<number> {
  const { data } = await supabase.from('app_settings').select('join_window_lead_minutes').eq('id', 1).maybeSingle();
  return (data as Pick<AppSettings, 'join_window_lead_minutes'> | null)?.join_window_lead_minutes ?? appConfig.joinWindowLeadMinutes;
}

/** Sessions (as visible to the caller via RLS) on a range of IST dates [from, to]. */
export async function sessionsBetween(supabase: Supabase, fromDate: string, toDate: string): Promise<ClassSessionView[]> {
  const { data } = await supabase
    .from('v_class_sessions')
    .select('*')
    .gte('scheduled_start', istDayStart(fromDate).toISOString())
    .lt('scheduled_start', istDayStart(addDays(toDate, 1)).toISOString())
    .order('scheduled_start');
  return (data ?? []) as ClassSessionView[];
}

/** Today + next N days, split. */
export async function todayAndUpcoming(supabase: Supabase, upcomingDays = 7) {
  const today = istDate();
  const all = await sessionsBetween(supabase, today, addDays(today, upcomingDays));
  const todays = all.filter((s) => istDate(new Date(s.scheduled_start)) === today);
  const upcoming = all.filter((s) => istDate(new Date(s.scheduled_start)) !== today);
  return { today, todays, upcoming };
}

export function groupByIstDay(sessions: ClassSessionView[]): Array<{ date: string; sessions: ClassSessionView[] }> {
  const map = new Map<string, ClassSessionView[]>();
  for (const s of sessions) {
    const d = istDate(new Date(s.scheduled_start));
    map.set(d, [...(map.get(d) ?? []), s]);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, sessions]) => ({ date, sessions }));
}

/** Set of session ids the current student has already joined. */
export async function joinedSessionIds(supabase: Supabase, sessionIds: string[]): Promise<Set<string>> {
  if (sessionIds.length === 0) return new Set();
  const { data } = await supabase.from('attendance').select('class_session_id').in('class_session_id', sessionIds);
  return new Set(((data ?? []) as { class_session_id: string }[]).map((a) => a.class_session_id));
}
