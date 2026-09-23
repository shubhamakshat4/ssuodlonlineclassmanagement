/**
 * Job: provision Teams meetings for pending sessions (SPEC §7.2, §7.3, §7.5).
 * Runs every 10 minutes (cron-provision-meetings) and on demand from Sync health.
 *
 *   1. mark past sessions completed; recover rows stuck in 'provisioning'
 *   2. delete Graph events for cancelled / custom-link sessions
 *   3. claim up to N pending sessions (FOR UPDATE SKIP LOCKED, in SQL) and, per session:
 *        - event exists + join URL kept        -> PATCH times (reschedule)
 *        - event exists but join URL was cleared -> delete stale event, then create fresh
 *        - no event                             -> steps 1→3 (runProvisionSequence)
 *      success -> provisioned; failure -> attempts+1, back to pending, or failed after MAX_ATTEMPTS
 */
import { GraphError, type GraphClient } from '../graph/types.ts';
import { runProvisionSequence, WINDOWS_TZ } from '../graph/sequence.ts';
import { toGraphLocalDateTime } from '../time.ts';
import { audit, unwrap, type DbClient } from '../db.ts';
import { completePastSessions } from './generate-sessions.ts';

export const MAX_SYNC_ATTEMPTS = 5;

export interface ClaimedSession {
  id: string;
  batch_subject_id: string;
  teacher_id: string;
  scheduled_start: string;
  scheduled_end: string;
  graph_event_id: string | null;
  graph_online_meeting_id: string | null;
  teams_join_url: string | null;
  sync_attempts: number;
  subject_name: string;
  batch_code: string;
  teacher_upn: string;
  teacher_entra_user_id: string | null;
  timezone: string;
}

export type SessionPlan = 'create' | 'patch' | 'recreate';

/** Pure: what to do with a claimed session. */
export function planSession(s: Pick<ClaimedSession, 'graph_event_id' | 'teams_join_url'>): SessionPlan {
  if (!s.graph_event_id) return 'create';
  return s.teams_join_url ? 'patch' : 'recreate';
}

/** Pure: state after a failed attempt. */
export function afterFailure(attemptsSoFar: number, maxAttempts = MAX_SYNC_ATTEMPTS): { sync_status: 'pending' | 'failed'; sync_attempts: number } {
  const attempts = attemptsSoFar + 1;
  return { sync_status: attempts >= maxAttempts ? 'failed' : 'pending', sync_attempts: attempts };
}

export interface ProvisionOptions {
  limit?: number;
  /** false when the tenant does not support recordAutomatically (GRAPH_RECORDING_MODE=manual) */
  recordAutomatically?: boolean;
  now?: Date;
}

export interface ProvisionSummary {
  completed: number;
  recovered: number;
  deleted: number;
  deleteFailed: number;
  claimed: number;
  provisioned: number;
  patched: number;
  failed: number;
  errors: Array<{ sessionId: string; error: string }>;
}

function errorText(e: unknown): string {
  if (e instanceof GraphError) return `${e.message} (endpoint ${e.endpoint}, request-id ${e.requestId ?? '-'})`;
  return e instanceof Error ? e.message : String(e);
}

export async function runProvisionMeetings(db: DbClient, graph: GraphClient, opts: ProvisionOptions = {}): Promise<ProvisionSummary> {
  const now = opts.now ?? new Date();
  const recordAutomatically = opts.recordAutomatically ?? true;
  const summary: ProvisionSummary = { completed: 0, recovered: 0, deleted: 0, deleteFailed: 0, claimed: 0, provisioned: 0, patched: 0, failed: 0, errors: [] };

  // 1. housekeeping
  summary.completed = await completePastSessions(db, now);
  summary.recovered = unwrap<number>(await db.rpc('recover_stuck_provisioning'), 'recover stuck') ?? 0;

  // 2. deletions (cancelled or custom link)
  const toDelete = unwrap<Array<{ id: string; graph_event_id: string; sync_attempts: number }>>(
    await db.from('v_sessions_needing_event_deletion').select('id, graph_event_id, sync_attempts').limit(opts.limit ?? 20),
    'load deletions',
  );
  for (const s of toDelete) {
    try {
      await graph.deleteEvent(s.graph_event_id, s.id);
      unwrap(
        await db
          .from('class_sessions')
          .update({ graph_event_id: null, graph_online_meeting_id: null, teams_join_url: null, sync_status: 'cancelled', sync_claimed_at: null })
          .eq('id', s.id)
          .select('id'),
        'clear event',
      );
      await audit(db, 'graph.event_deleted', 'class_sessions', s.id, { graph_event_id: s.graph_event_id });
      summary.deleted++;
    } catch (e) {
      summary.deleteFailed++;
      summary.errors.push({ sessionId: s.id, error: errorText(e) });
      unwrap(await db.from('class_sessions').update({ sync_error: `event deletion failed: ${errorText(e)}`, sync_attempts: s.sync_attempts + 1 }).eq('id', s.id).select('id'), 'record delete failure');
    }
  }

  // 3. claim + provision
  const claimed = unwrap<ClaimedSession[]>(await db.rpc('claim_pending_sessions', { p_limit: opts.limit ?? 20 }), 'claim');
  summary.claimed = claimed.length;

  for (const s of claimed) {
    const plan = planSession(s);
    const tz = s.timezone || 'Asia/Kolkata';
    const startLocal = toGraphLocalDateTime(new Date(s.scheduled_start), tz);
    const endLocal = toGraphLocalDateTime(new Date(s.scheduled_end), tz);
    try {
      if (plan === 'patch') {
        await graph.patchEventTimes(s.graph_event_id!, startLocal, endLocal, WINDOWS_TZ[tz] ?? tz, s.id);
        unwrap(await db.from('class_sessions').update({ sync_status: 'provisioned', sync_error: null, sync_claimed_at: null }).eq('id', s.id).select('id'), 'mark patched');
        await audit(db, 'graph.event_patched', 'class_sessions', s.id, { startLocal, endLocal });
        summary.patched++;
        continue;
      }
      if (plan === 'recreate') {
        await graph.deleteEvent(s.graph_event_id!, s.id);
      }
      const out = await runProvisionSequence(graph, {
        sessionId: s.id,
        subject: `${s.subject_name} — ${s.batch_code}`,
        startLocal,
        endLocal,
        startUtc: new Date(s.scheduled_start).toISOString(),
        endUtc: new Date(s.scheduled_end).toISOString(),
        timeZone: tz,
        teacherUpn: s.teacher_upn,
        teacherUserId: s.teacher_entra_user_id,
        recordAutomatically,
      });
      if (out.teacherUserId && out.teacherUserId !== s.teacher_entra_user_id) {
        await db.from('teachers').update({ entra_user_id: out.teacherUserId }).eq('id', s.teacher_id);
      }
      unwrap(
        await db
          .from('class_sessions')
          .update({
            graph_event_id: out.eventId,
            graph_online_meeting_id: out.meetingId,
            teams_join_url: out.joinUrl,
            sync_status: 'provisioned',
            sync_error: out.recordAutomaticallyError ? `provisioned without recordAutomatically: ${out.recordAutomaticallyError}` : null,
            sync_claimed_at: null,
          })
          .eq('id', s.id)
          .select('id'),
        'mark provisioned',
      );
      await audit(db, 'graph.meeting_provisioned', 'class_sessions', s.id, { eventId: out.eventId, meetingId: out.meetingId, autoRecording: out.autoRecording, path: out.path, plan });
      summary.provisioned++;
    } catch (e) {
      const next = afterFailure(s.sync_attempts);
      const message = errorText(e);
      unwrap(await db.from('class_sessions').update({ ...next, sync_error: message, sync_claimed_at: null }).eq('id', s.id).select('id'), 'record failure');
      await audit(db, 'graph.provision_failed', 'class_sessions', s.id, { attempt: next.sync_attempts, status: next.sync_status, error: message });
      summary.failed++;
      summary.errors.push({ sessionId: s.id, error: message });
    }
  }

  await audit(db, 'provisioner.run', 'class_sessions', null, { ...summary, errors: summary.errors.slice(0, 20) });
  return summary;
}
