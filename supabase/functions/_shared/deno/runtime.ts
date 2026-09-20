/**
 * Deno-only helpers for Edge Functions (not type-checked by the Next.js tsconfig).
 *   - service-role Supabase client
 *   - bearer check for cron-invoked functions
 *   - JSON responses
 */
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2';

export function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function anonClientForRequest(req: Request) {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY are not set');
  return createClient(url, key, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Cron functions are invoked server-to-server with `Authorization: Bearer <secret>`, where the secret
 * is one of: CRON_SECRET (set with `supabase secrets set`, stored in Vault for pg_net), the
 * service-role key the runtime injects, or any of the project's secret API keys. Anything else is
 * rejected. Constant-time compares keep timing leaks out of the picture.
 */
export function requireServiceRole(req: Request): Response | null {
  const accepted = [
    Deno.env.get('CRON_SECRET'),
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    ...(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '').split(','),
  ]
    .map((v) => v?.trim() ?? '')
    .filter((v) => v.length >= 20);
  const header = req.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token || !accepted.some((a) => timingSafeEqual(token, a))) {
    return json({ error: 'Unauthorized' }, 401);
  }
  return null;
}

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

export function errorResponse(e: unknown, status = 500): Response {
  const message = e instanceof Error ? e.message : String(e);
  console.error(message);
  return json({ error: message }, status);
}
