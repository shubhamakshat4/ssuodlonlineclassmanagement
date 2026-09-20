import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { reportError } from '@/lib/monitoring';

/**
 * Fixed-window rate limiter. Primary store: Postgres (`rate_limit_hit`, shared by every server
 * instance). Fallback when the service-role key is unavailable or the call fails: per-process memory,
 * which still protects a single instance. Fails open only after logging — a limiter outage must not
 * take the portal down.
 */
const local = new Map<string, { start: number; hits: number }>();

function localHit(key: string, limit: number, windowSeconds: number): boolean {
  const now = Date.now();
  const e = local.get(key);
  if (!e || e.start + windowSeconds * 1000 <= now) {
    local.set(key, { start: now, hits: 1 });
    if (local.size > 10_000) local.clear();
    return true;
  }
  e.hits++;
  return e.hits <= limit;
}

export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY.startsWith('REPLACE')) {
    return localHit(key, limit, windowSeconds);
  }
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('rate_limit_hit', { p_key: key, p_limit: limit, p_window_seconds: windowSeconds });
    if (error) throw error;
    return data !== false;
  } catch (e) {
    reportError('rate_limit', e, { key });
    return localHit(key, limit, windowSeconds);
  }
}

export const LIMITS = {
  /** join clicks per user */
  join: { limit: 30, windowSeconds: 60 },
  /** password sign-in attempts per IP */
  loginIp: { limit: 20, windowSeconds: 15 * 60 },
  /** password sign-in attempts per email */
  loginEmail: { limit: 8, windowSeconds: 15 * 60 },
  /** recording playback starts per user */
  play: { limit: 60, windowSeconds: 60 },
};

export function clientIp(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0] : headers.get('x-real-ip'))?.trim() || 'unknown';
}
