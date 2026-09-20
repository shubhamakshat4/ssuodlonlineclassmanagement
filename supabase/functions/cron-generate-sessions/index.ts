/**
 * cron-generate-sessions — nightly 01:00 IST (19:30 UTC), also callable on demand.
 * Expands active timetable slots into class_sessions for the next N days (default 21).
 * Auth: service-role bearer (pg_net cron or admin server action).
 */
import { errorResponse, json, requireServiceRole, serviceClient } from '../_shared/deno/runtime.ts';
import { completePastSessions, runGenerateSessions } from '../_shared/jobs/generate-sessions.ts';

Deno.serve(async (req) => {
  const denied = requireServiceRole(req);
  if (denied) return denied;
  try {
    const db = serviceClient();
    const completed = await completePastSessions(db);
    const result = await runGenerateSessions(db);
    return json({ ok: true, completed, ...result });
  } catch (e) {
    return errorResponse(e);
  }
});
