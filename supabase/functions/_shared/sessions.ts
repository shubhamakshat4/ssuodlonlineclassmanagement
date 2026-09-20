/**
 * Session rules shared by UI and server code (runtime-neutral).
 * The database is authoritative (v_class_sessions + triggers); these mirror it for the UI.
 */

export type JoinWindowState = 'before' | 'open' | 'ended' | 'cancelled';

export interface JoinWindow {
  state: JoinWindowState;
  opensAt: Date;
  /** ms until the window opens (0 when open/ended) */
  opensInMs: number;
  /** ms until the window closes (0 when not open) */
  closesInMs: number;
}

export function joinWindow(now: Date, scheduledStart: Date | string, scheduledEnd: Date | string, leadMinutes: number, status: string = 'scheduled'): JoinWindow {
  const start = new Date(scheduledStart);
  const end = new Date(scheduledEnd);
  const opensAt = new Date(start.getTime() - leadMinutes * 60_000);
  if (status !== 'scheduled') return { state: 'cancelled', opensAt, opensInMs: 0, closesInMs: 0 };
  if (now < opensAt) return { state: 'before', opensAt, opensInMs: opensAt.getTime() - now.getTime(), closesInMs: 0 };
  if (now > end) return { state: 'ended', opensAt, opensInMs: 0, closesInMs: 0 };
  return { state: 'open', opensAt, opensInMs: 0, closesInMs: end.getTime() - now.getTime() };
}

/** SPEC §4: coalesce(join_url_override, teams_join_url). */
export function effectiveJoinUrl(joinUrlOverride: string | null | undefined, teamsJoinUrl: string | null | undefined): string | null {
  const o = joinUrlOverride?.trim();
  if (o) return o;
  const t = teamsJoinUrl?.trim();
  return t || null;
}

/** "in 2h 05m" / "in 45s" style countdown text. */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return 'now';
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${String(m % 60).padStart(2, '0')}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

/** Recording expiry (SPEC §7.4): recorded_at + retention days; and days remaining for the UI. */
export function recordingExpiresAt(recordedAt: Date | string, retentionDays: number): Date {
  return new Date(new Date(recordedAt).getTime() + retentionDays * 86_400_000);
}

export function recordingDaysRemaining(now: Date, expiresAt: Date | string): number {
  const ms = new Date(expiresAt).getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}

export function isRecordingAvailable(now: Date, expiresAt: Date | string, status: string): boolean {
  return status === 'available' && now < new Date(expiresAt);
}

/** §9 override validation: must be https and parse; warn when host is not a known meeting provider. */
export const KNOWN_MEETING_HOSTS = ['teams.microsoft.com', 'meet.google.com', 'zoom.us'];

export function validateOverrideUrl(raw: string): { ok: true; url: string; warning: string | null } | { ok: false; error: string } {
  const value = raw.trim();
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, error: 'Enter a full URL, e.g. https://meet.google.com/abc-defg-hij' };
  }
  if (parsed.protocol !== 'https:') return { ok: false, error: 'The link must start with https://' };
  const host = parsed.hostname.toLowerCase();
  const known = KNOWN_MEETING_HOSTS.some((h) => host === h || host.endsWith('.' + h));
  return { ok: true, url: parsed.toString(), warning: known ? null : `"${host}" is not a Teams, Google Meet or Zoom address. Double-check it before saving.` };
}
