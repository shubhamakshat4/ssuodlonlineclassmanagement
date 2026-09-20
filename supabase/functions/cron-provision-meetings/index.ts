/**
 * cron-provision-meetings — every 10 minutes.
 * Creates/patches/deletes Teams meetings for class sessions via Microsoft Graph (§7.2, §7.5).
 * Auth: service-role bearer. Graph mode from GRAPH_MODE (real|mock); GRAPH_RECORDING_MODE=manual
 * switches off recordAutomatically (§7.4 fallback).
 */
import { errorResponse, json, requireServiceRole, serviceClient } from '../_shared/deno/runtime.ts';
import { createGraphClient } from '../_shared/graph/index.ts';
import { graphAuditHook } from '../_shared/graph/audit.ts';
import { runProvisionMeetings } from '../_shared/jobs/provision-meetings.ts';

Deno.serve(async (req) => {
  const denied = requireServiceRole(req);
  if (denied) return denied;
  try {
    const db = serviceClient();
    const env = Deno.env.toObject();
    const graph = createGraphClient(env, { onCall: graphAuditHook(db) });
    const body = req.headers.get('content-type')?.includes('application/json') ? await req.json().catch(() => ({})) : {};
    const summary = await runProvisionMeetings(db, graph, {
      limit: typeof body.limit === 'number' ? body.limit : 20,
      recordAutomatically: (env.GRAPH_RECORDING_MODE ?? 'auto').toLowerCase() !== 'manual',
    });
    return json({ ok: true, graphMode: graph.mode, ...summary });
  } catch (e) {
    return errorResponse(e);
  }
});
