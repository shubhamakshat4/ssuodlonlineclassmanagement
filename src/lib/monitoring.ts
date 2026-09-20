/**
 * Error monitoring (SPEC §12 hardening) without a vendor SDK:
 *   - structured JSON to stderr (picked up by Vercel / Supabase logs)
 *   - optional POST to ERROR_WEBHOOK_URL (Slack/Teams incoming webhook, Better Stack, etc.)
 * Wire a vendor (Sentry) here later if wanted; every call site goes through reportError().
 */
export interface ErrorContext {
  [key: string]: unknown;
}

let lastSent = 0;

export function reportError(scope: string, error: unknown, context: ErrorContext = {}): void {
  const err = error instanceof Error ? error : new Error(String(error));
  const payload = {
    level: 'error',
    scope,
    message: err.message,
    stack: err.stack?.split('\n').slice(0, 6).join('\n'),
    context,
    at: new Date().toISOString(),
    env: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  };
  console.error(JSON.stringify(payload));

  const webhook = process.env.ERROR_WEBHOOK_URL;
  if (!webhook || typeof fetch !== 'function') return;
  // crude flood control: at most one webhook post per 5 seconds per instance
  const now = Date.now();
  if (now - lastSent < 5000) return;
  lastSent = now;
  void fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: `[SSU ODL] ${scope}: ${err.message}`, ...payload }),
  }).catch(() => {});
}
