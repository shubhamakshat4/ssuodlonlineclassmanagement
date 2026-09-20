/**
 * cron-expire-recordings — daily. Flips recordings past expires_at to 'expired' (§7.4).
 * Files are never deleted; Teams' own 35-day policy handles that. Auth: service-role bearer.
 */
import { errorResponse, json, requireServiceRole, serviceClient } from '../_shared/deno/runtime.ts';
import { runExpireRecordings } from '../_shared/jobs/harvest-recordings.ts';

Deno.serve(async (req) => {
  const denied = requireServiceRole(req);
  if (denied) return denied;
  try {
    const expired = await runExpireRecordings(serviceClient());
    return json({ ok: true, expired });
  } catch (e) {
    return errorResponse(e);
  }
});
