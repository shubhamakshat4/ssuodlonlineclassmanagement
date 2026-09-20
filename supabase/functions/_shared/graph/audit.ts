/** §7.3: log every Graph call (endpoint, status, duration, request id) to audit_log. */
import type { DbClient } from '../db.ts';
import type { GraphCallLog } from './types.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function graphAuditHook(db: DbClient) {
  return async (log: GraphCallLog) => {
    const entityId = log.correlationId && UUID.test(log.correlationId) ? log.correlationId : null;
    const { error } = await db.rpc('log_audit', {
      p_action: 'graph.call',
      p_entity: 'class_sessions',
      p_entity_id: entityId,
      p_payload: {
        endpoint: log.endpoint,
        status: log.status,
        duration_ms: log.durationMs,
        request_id: log.requestId,
        attempt: log.attempt,
        correlation_id: log.correlationId ?? null,
        error: log.error ?? null,
      },
    });
    if (error) console.error('graph audit failed', error.message);
  };
}
