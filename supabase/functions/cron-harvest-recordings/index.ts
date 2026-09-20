/**
 * cron-harvest-recordings — hourly. Finds Teams cloud recordings for completed sessions and
 * records their OneDrive location (§7.4). Auth: service-role bearer.
 */
import { errorResponse, json, requireServiceRole, serviceClient } from '../_shared/deno/runtime.ts';
import { createGraphClient } from '../_shared/graph/index.ts';
import { graphAuditHook } from '../_shared/graph/audit.ts';
import { runHarvestRecordings } from '../_shared/jobs/harvest-recordings.ts';

Deno.serve(async (req) => {
  const denied = requireServiceRole(req);
  if (denied) return denied;
  try {
    const db = serviceClient();
    const env = Deno.env.toObject();
    const graph = createGraphClient(env, { onCall: graphAuditHook(db) });
    const summary = await runHarvestRecordings(db, graph, {
      manualRecordingMode: (env.GRAPH_RECORDING_MODE ?? 'auto').toLowerCase() === 'manual',
    });
    return json({ ok: true, graphMode: graph.mode, ...summary });
  } catch (e) {
    return errorResponse(e);
  }
});
