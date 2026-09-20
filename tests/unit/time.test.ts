import { describe, expect, it } from 'vitest';
import { addDays, dateRange, formatZoned, toGraphLocalDateTime, weekdayOfDate, zonedDateString, zonedTimeToUtc, zonedWeekday, zoneOffsetMs } from '@shared/time.ts';

describe('zonedTimeToUtc', () => {
  it('builds IST wall times as the correct UTC instant (UTC+05:30, no DST)', () => {
    expect(zonedTimeToUtc('2026-01-12', '10:00', 'Asia/Kolkata').toISOString()).toBe('2026-01-12T04:30:00.000Z');
    expect(zonedTimeToUtc('2026-07-12', '10:00', 'Asia/Kolkata').toISOString()).toBe('2026-07-12T04:30:00.000Z');
    // midnight edge: 00:15 IST is the previous UTC day
    expect(zonedTimeToUtc('2026-03-01', '00:15', 'Asia/Kolkata').toISOString()).toBe('2026-02-28T18:45:00.000Z');
  });

  it('is timezone-correct, not offset-arithmetic: handles a DST zone too', () => {
    // New York: EST in January (UTC-5), EDT in July (UTC-4)
    expect(zonedTimeToUtc('2026-01-12', '10:00', 'America/New_York').toISOString()).toBe('2026-01-12T15:00:00.000Z');
    expect(zonedTimeToUtc('2026-07-12', '10:00', 'America/New_York').toISOString()).toBe('2026-07-12T14:00:00.000Z');
    expect(zoneOffsetMs(new Date('2026-07-12T14:00:00Z'), 'America/New_York')).toBe(-4 * 3600 * 1000);
    expect(zoneOffsetMs(new Date('2026-01-12T15:00:00Z'), 'Asia/Kolkata')).toBe(5.5 * 3600 * 1000);
  });

  it('rejects garbage', () => {
    expect(() => zonedTimeToUtc('nope', '10:00')).toThrow();
  });
});

describe('date helpers', () => {
  it('reports the IST calendar date and weekday of an instant', () => {
    // 2026-09-20T20:00Z is 2026-09-21 01:30 IST (Monday)
    const t = new Date('2026-09-20T20:00:00Z');
    expect(zonedDateString(t, 'Asia/Kolkata')).toBe('2026-09-21');
    expect(zonedWeekday(t, 'Asia/Kolkata')).toBe(1);
    expect(zonedDateString(t, 'UTC')).toBe('2026-09-20');
  });

  it('adds days across month/year boundaries and lists ranges', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(dateRange('2026-01-30', '2026-02-02')).toEqual(['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02']);
    expect(weekdayOfDate('2026-09-20')).toBe(0); // Sunday
  });

  it('formats for Graph and for humans', () => {
    const t = zonedTimeToUtc('2026-01-12', '10:00');
    expect(toGraphLocalDateTime(t)).toBe('2026-01-12T10:00:00');
    expect(formatZoned(t, 'Asia/Kolkata', { timeOnly: true })).toBe('10:00');
    expect(formatZoned(t, 'Asia/Kolkata')).toContain('12 Jan');
  });
});
