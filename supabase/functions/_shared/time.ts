/**
 * Timezone helpers shared by Edge Functions (Deno) and Next.js (Node/browser).
 * Runtime-neutral: only Intl and Date. No Node/Deno APIs.
 *
 * Rule from SPEC §7.1: build instants from a calendar date + local wall time *in the zone*,
 * never by adding a fixed offset to UTC. IST has no DST today, but the code must not assume it.
 */

export const DEFAULT_TZ = 'Asia/Kolkata';

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string) {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    dtfCache.set(tz, f);
  }
  return f;
}

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0=Sun .. 6=Sat
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Wall-clock parts of an instant in a zone. */
export function zonedParts(instant: Date, tz = DEFAULT_TZ): ZonedParts {
  const parts = partsFormatter(tz).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekday: WEEKDAYS.indexOf(get('weekday')),
  };
}

/** Offset (ms) of the zone at the given instant: local - UTC. */
export function zoneOffsetMs(instant: Date, tz = DEFAULT_TZ): number {
  const p = zonedParts(instant, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * Convert a calendar date + wall time in `tz` into a UTC instant.
 * Two-pass offset resolution handles zones with DST; for IST it converges immediately.
 */
export function zonedTimeToUtc(date: string, time: string, tz = DEFAULT_TZ): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm, ss = 0] = time.split(':').map(Number);
  if (!y || !m || !d || Number.isNaN(hh) || Number.isNaN(mm)) throw new Error(`Invalid date/time: ${date} ${time}`);
  const naive = Date.UTC(y, m - 1, d, hh, mm, ss);
  let guess = new Date(naive - zoneOffsetMs(new Date(naive), tz));
  const offset2 = zoneOffsetMs(guess, tz);
  guess = new Date(naive - offset2);
  return guess;
}

/** 'YYYY-MM-DD' of an instant in the zone. */
export function zonedDateString(instant: Date, tz = DEFAULT_TZ): string {
  const p = zonedParts(instant, tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** 'HH:MM' of an instant in the zone. */
export function zonedTimeString(instant: Date, tz = DEFAULT_TZ): string {
  const p = zonedParts(instant, tz);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

/** Weekday (0=Sun..6=Sat) of an instant in the zone. */
export function zonedWeekday(instant: Date, tz = DEFAULT_TZ): number {
  return zonedParts(instant, tz).weekday;
}

/** Add whole calendar days to a 'YYYY-MM-DD' string (calendar arithmetic, zone-agnostic). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d + days);
  const r = new Date(t);
  return `${r.getUTCFullYear()}-${String(r.getUTCMonth() + 1).padStart(2, '0')}-${String(r.getUTCDate()).padStart(2, '0')}`;
}

/** Weekday (0=Sun..6=Sat) of a calendar date string. */
export function weekdayOfDate(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Inclusive list of dates between two 'YYYY-MM-DD' strings. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/** Human formatting in the zone, e.g. "Mon, 21 Sep 2026, 10:00". */
export function formatZoned(instant: Date | string, tz = DEFAULT_TZ, opts: { dateOnly?: boolean; timeOnly?: boolean } = {}): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  if (Number.isNaN(d.getTime())) return '';
  const base: Intl.DateTimeFormatOptions = { timeZone: tz, hourCycle: 'h23' };
  if (opts.timeOnly) return new Intl.DateTimeFormat('en-IN', { ...base, hour: '2-digit', minute: '2-digit' }).format(d);
  if (opts.dateOnly) return new Intl.DateTimeFormat('en-IN', { ...base, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(d);
  return new Intl.DateTimeFormat('en-IN', { ...base, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);
}

/** Graph-style local date-time string ("2026-01-12T10:00:00") for an instant in the zone. */
export function toGraphLocalDateTime(instant: Date, tz = DEFAULT_TZ): string {
  const p = zonedParts(instant, tz);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
}
