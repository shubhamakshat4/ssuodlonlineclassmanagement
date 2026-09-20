import { describe, expect, it } from 'vitest';
import { effectiveJoinUrl, formatCountdown, isRecordingAvailable, joinWindow, recordingDaysRemaining, recordingExpiresAt, validateOverrideUrl } from '@shared/sessions.ts';

const start = new Date('2026-09-21T04:30:00Z'); // 10:00 IST
const end = new Date('2026-09-21T05:30:00Z'); // 11:00 IST

describe('joinWindow', () => {
  it('opens exactly lead minutes before start and closes at end', () => {
    expect(joinWindow(new Date('2026-09-21T04:19:59Z'), start, end, 10).state).toBe('before');
    expect(joinWindow(new Date('2026-09-21T04:20:00Z'), start, end, 10).state).toBe('open');
    expect(joinWindow(new Date('2026-09-21T05:30:00Z'), start, end, 10).state).toBe('open');
    expect(joinWindow(new Date('2026-09-21T05:30:01Z'), start, end, 10).state).toBe('ended');
  });
  it('reports countdowns and respects a configurable lead time', () => {
    const w = joinWindow(new Date('2026-09-21T03:00:00Z'), start, end, 10);
    expect(w.opensInMs).toBe(80 * 60_000);
    expect(joinWindow(new Date('2026-09-21T04:10:00Z'), start, end, 20).state).toBe('open');
    expect(joinWindow(new Date('2026-09-21T04:10:00Z'), start, end, 10).state).toBe('before');
    expect(joinWindow(new Date('2026-09-21T04:40:00Z'), start, end, 10).closesInMs).toBe(50 * 60_000);
  });
  it('is never open for cancelled/completed sessions', () => {
    expect(joinWindow(new Date('2026-09-21T04:40:00Z'), start, end, 10, 'cancelled').state).toBe('cancelled');
    expect(joinWindow(new Date('2026-09-21T04:40:00Z'), start, end, 10, 'completed').state).toBe('cancelled');
  });
});

describe('effectiveJoinUrl', () => {
  it('prefers the override, falls back to Teams, null when neither', () => {
    expect(effectiveJoinUrl('https://zoom.us/j/1', 'https://teams/x')).toBe('https://zoom.us/j/1');
    expect(effectiveJoinUrl(null, 'https://teams/x')).toBe('https://teams/x');
    expect(effectiveJoinUrl('  ', 'https://teams/x')).toBe('https://teams/x');
    expect(effectiveJoinUrl(undefined, null)).toBeNull();
  });
});

describe('formatCountdown', () => {
  it('formats sensible units', () => {
    expect(formatCountdown(0)).toBe('now');
    expect(formatCountdown(45_000)).toBe('45s');
    expect(formatCountdown(125_000)).toBe('2m 05s');
    expect(formatCountdown(3 * 3600_000 + 7 * 60_000)).toBe('3h 07m');
    expect(formatCountdown(3 * 86400_000 + 2 * 3600_000)).toBe('3d 2h');
  });
});

describe('recording expiry', () => {
  it('expires retention days after recording and counts days remaining', () => {
    const recorded = new Date('2026-09-01T05:00:00Z');
    const exp = recordingExpiresAt(recorded, 30);
    expect(exp.toISOString()).toBe('2026-10-01T05:00:00.000Z');
    expect(recordingDaysRemaining(new Date('2026-09-01T06:00:00Z'), exp)).toBe(30);
    expect(recordingDaysRemaining(new Date('2026-09-30T06:00:00Z'), exp)).toBe(1);
    expect(recordingDaysRemaining(new Date('2026-10-01T05:00:00Z'), exp)).toBe(0);
    expect(isRecordingAvailable(new Date('2026-09-30T06:00:00Z'), exp, 'available')).toBe(true);
    expect(isRecordingAvailable(new Date('2026-10-01T05:00:01Z'), exp, 'available')).toBe(false);
    expect(isRecordingAvailable(new Date('2026-09-30T06:00:00Z'), exp, 'expired')).toBe(false);
  });
});

describe('validateOverrideUrl', () => {
  it('requires https and a parseable URL, warns on unknown hosts', () => {
    expect(validateOverrideUrl('http://zoom.us/j/1')).toEqual({ ok: false, error: 'The link must start with https://' });
    expect(validateOverrideUrl('not a url')).toMatchObject({ ok: false });
    expect(validateOverrideUrl('javascript:alert(1)')).toMatchObject({ ok: false });
    expect(validateOverrideUrl(' https://us02web.zoom.us/j/123 ')).toEqual({ ok: true, url: 'https://us02web.zoom.us/j/123', warning: null });
    expect(validateOverrideUrl('https://meet.google.com/abc-defg-hij')).toMatchObject({ ok: true, warning: null });
    expect(validateOverrideUrl('https://teams.microsoft.com/l/meetup-join/x')).toMatchObject({ ok: true, warning: null });
    const r = validateOverrideUrl('https://example.org/room');
    expect(r.ok && r.warning).toMatch(/not a Teams, Google Meet or Zoom/);
  });
});
