/** IST-flavoured wrappers over the runtime-neutral helpers in supabase/functions/_shared/time.ts. */
import { appConfig } from '@/lib/env';
import { formatZoned, zonedDateString, zonedTimeString, zonedTimeToUtc, zonedWeekday } from '@shared/time.ts';

export { addDays, dateRange, weekdayOfDate } from '@shared/time.ts';

export const TZ = appConfig.timezone;

export const formatIst = (instant: Date | string) => formatZoned(instant, TZ);
export const formatIstDate = (instant: Date | string) => formatZoned(instant, TZ, { dateOnly: true });
export const formatIstTime = (instant: Date | string) => formatZoned(instant, TZ, { timeOnly: true });
export const istDate = (instant: Date = new Date()) => zonedDateString(instant, TZ);
export const istTime = (instant: Date = new Date()) => zonedTimeString(instant, TZ);
export const istWeekday = (instant: Date = new Date()) => zonedWeekday(instant, TZ);
export const istToUtc = (date: string, time: string) => zonedTimeToUtc(date, time, TZ);

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "10:00" from a Postgres time value like "10:00:00". */
export const hhmm = (t: string) => t.slice(0, 5);
