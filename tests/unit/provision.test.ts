import { describe, expect, it } from 'vitest';
import { MockGraphClient } from '@shared/graph/index.ts';
import { afterFailure, MAX_SYNC_ATTEMPTS, planSession, runProvisionMeetings, type ClaimedSession } from '@shared/jobs/provision-meetings.ts';
import type { DbClient } from '@shared/db.ts';

describe('planSession / afterFailure', () => {
  it('chooses create, patch or recreate', () => {
    expect(planSession({ graph_event_id: null, teams_join_url: null })).toBe('create');
    expect(planSession({ graph_event_id: 'e', teams_join_url: 'https://teams' })).toBe('patch');
    expect(planSession({ graph_event_id: 'e', teams_join_url: null })).toBe('recreate');
  });
  it('re-queues until the 5th failure, then marks failed', () => {
    expect(afterFailure(0)).toEqual({ sync_status: 'pending', sync_attempts: 1 });
    expect(afterFailure(3)).toEqual({ sync_status: 'pending', sync_attempts: 4 });
    expect(afterFailure(4)).toEqual({ sync_status: 'failed', sync_attempts: 5 });
    expect(MAX_SYNC_ATTEMPTS).toBe(5);
  });
});

/**
 * A tiny in-memory stand-in for the supabase-js query builder covering exactly the calls the job
 * makes. Lets us run the whole job against the Graph mock without PostgREST.
 */
function fakeDb(sessions: ClaimedSession[], deletions: Array<{ id: string; graph_event_id: string; sync_attempts: number }> = []) {
  const updates: Array<{ table: string; where: Record<string, unknown>; patch: Record<string, unknown> }> = [];
  const audits: Array<{ action: string; payload: Record<string, unknown> }> = [];
  const builder = (table: string) => {
    const where: Record<string, unknown> = {};
    let patch: Record<string, unknown> | null = null;
    const api = {
      select: () => api,
      update: (p: Record<string, unknown>) => ((patch = p), api),
      eq: (k: string, v: unknown) => ((where[k] = v), api),
      lt: (k: string, v: unknown) => ((where[`${k}<`] = v), api),
      limit: () => api,
      then: (resolve: (v: unknown) => void) => {
        if (patch) {
          updates.push({ table, where, patch });
          return resolve({ data: [{ id: where.id }], error: null });
        }
        if (table === 'v_sessions_needing_event_deletion') return resolve({ data: deletions, error: null });
        if (table === 'class_sessions') return resolve({ data: [], error: null }); // completePastSessions
        return resolve({ data: [], error: null });
      },
    };
    return api;
  };
  const db: DbClient = {
    from: builder,
    rpc: (fn: string, args?: Record<string, unknown>) => {
      if (fn === 'claim_pending_sessions') return Promise.resolve({ data: sessions, error: null });
      if (fn === 'recover_stuck_provisioning') return Promise.resolve({ data: 0, error: null });
      if (fn === 'log_audit') {
        audits.push({ action: String(args?.p_action), payload: (args?.p_payload as Record<string, unknown>) ?? {} });
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve({ data: null, error: { message: `unknown rpc ${fn}` } });
    },
  };
  return { db, updates, audits };
}

const claimed = (over: Partial<ClaimedSession> = {}): ClaimedSession => ({
  id: 'sess-1',
  batch_subject_id: 'bs',
  teacher_id: 't',
  scheduled_start: '2026-10-05T04:30:00.000Z',
  scheduled_end: '2026-10-05T05:30:00.000Z',
  graph_event_id: null,
  graph_online_meeting_id: null,
  teams_join_url: null,
  sync_attempts: 0,
  subject_name: 'Financial Management',
  batch_code: 'BBA-ODL-2025',
  teacher_upn: 'anand@x.onmicrosoft.com',
  teacher_entra_user_id: null,
  timezone: 'Asia/Kolkata',
  ...over,
});

describe('runProvisionMeetings (mock Graph + fake db)', () => {
  it('provisions a pending session: event in IST, options applied, ids stored, teacher id cached', async () => {
    const graph = new MockGraphClient();
    graph.users.set('anand@x.onmicrosoft.com', 'anand-oid');
    const { db, updates, audits } = fakeDb([claimed()]);
    const summary = await runProvisionMeetings(db, graph);
    expect(summary).toMatchObject({ claimed: 1, provisioned: 1, failed: 0, patched: 0 });
    const ev = [...graph.events.values()][0];
    expect(ev.subject).toBe('Financial Management — BBA-ODL-2025');
    expect(ev.startLocal).toBe('2026-10-05T10:00:00');
    expect(ev.endLocal).toBe('2026-10-05T11:00:00');
    expect(ev.timeZone).toBe('India Standard Time');
    expect(ev.attendees).toEqual(['anand@x.onmicrosoft.com']);
    const m = graph.meetings.get(ev.meetingId)!;
    expect(m.options?.recordAutomatically).toBe(true);
    expect(m.options?.coorganizers).toEqual([{ upn: 'anand@x.onmicrosoft.com', userId: 'anand-oid' }]);
    const sessionUpdate = updates.find((u) => u.table === 'class_sessions' && u.patch.sync_status === 'provisioned')!;
    expect(sessionUpdate.patch).toMatchObject({ graph_event_id: ev.id, graph_online_meeting_id: ev.meetingId, teams_join_url: ev.joinUrl, sync_error: null });
    expect(updates.find((u) => u.table === 'teachers')?.patch).toEqual({ entra_user_id: 'anand-oid' });
    expect(audits.map((a) => a.action)).toContain('graph.meeting_provisioned');
  });

  it('records the failure, increments attempts and marks failed on the 5th attempt', async () => {
    const graph = new MockGraphClient();
    graph.failure = 'access-policy-403';
    const { db, updates } = fakeDb([claimed({ sync_attempts: 1 }), claimed({ id: 'sess-2', sync_attempts: 4 })]);
    const summary = await runProvisionMeetings(db, graph);
    expect(summary.failed).toBe(2);
    const u1 = updates.find((u) => u.where.id === 'sess-1')!;
    expect(u1.patch).toMatchObject({ sync_status: 'pending', sync_attempts: 2 });
    expect(String(u1.patch.sync_error)).toMatch(/403/);
    const u2 = updates.find((u) => u.where.id === 'sess-2')!;
    expect(u2.patch).toMatchObject({ sync_status: 'failed', sync_attempts: 5 });
  });

  it('patches times for a rescheduled session and keeps the join URL', async () => {
    const graph = new MockGraphClient();
    const created = await graph.createCalendarEvent({ transactionId: 'x', subject: 's', startLocal: 'a', endLocal: 'b', timeZone: 'India Standard Time', attendeeUpns: [] });
    const { db, updates } = fakeDb([claimed({ graph_event_id: created.eventId, teams_join_url: created.joinUrl, scheduled_start: '2026-10-06T04:30:00.000Z', scheduled_end: '2026-10-06T05:30:00.000Z' })]);
    const summary = await runProvisionMeetings(db, graph);
    expect(summary.patched).toBe(1);
    expect(graph.events.get(created.eventId)?.startLocal).toBe('2026-10-06T10:00:00');
    expect(updates.find((u) => u.patch.sync_status === 'provisioned')?.patch.teams_join_url).toBeUndefined(); // untouched
  });

  it('deletes events for cancelled / custom-link sessions', async () => {
    const graph = new MockGraphClient();
    const created = await graph.createCalendarEvent({ transactionId: 'x', subject: 's', startLocal: 'a', endLocal: 'b', timeZone: 'UTC', attendeeUpns: [] });
    const { db, updates } = fakeDb([], [{ id: 'sess-9', graph_event_id: created.eventId, sync_attempts: 0 }]);
    const summary = await runProvisionMeetings(db, graph);
    expect(summary.deleted).toBe(1);
    expect(graph.events.get(created.eventId)?.deleted).toBe(true);
    expect(updates.find((u) => u.where.id === 'sess-9')?.patch).toMatchObject({ graph_event_id: null, teams_join_url: null, sync_status: 'cancelled' });
  });

  it('recreates when the event exists but the join URL was cleared (revert after override)', async () => {
    const graph = new MockGraphClient();
    const old = await graph.createCalendarEvent({ transactionId: 'old', subject: 's', startLocal: 'a', endLocal: 'b', timeZone: 'UTC', attendeeUpns: [] });
    const { db, updates } = fakeDb([claimed({ graph_event_id: old.eventId, teams_join_url: null })]);
    const summary = await runProvisionMeetings(db, graph);
    expect(summary.provisioned).toBe(1);
    expect(graph.events.get(old.eventId)?.deleted).toBe(true);
    const u = updates.find((x) => x.patch.sync_status === 'provisioned')!;
    expect(u.patch.graph_event_id).not.toBe(old.eventId);
  });

  it('degrades to manual recording when the tenant rejects recordAutomatically, and honours GRAPH_RECORDING_MODE=manual', async () => {
    const graph = new MockGraphClient();
    graph.failure = 'record-automatically-400';
    const { db, updates } = fakeDb([claimed()]);
    const summary = await runProvisionMeetings(db, graph);
    expect(summary.provisioned).toBe(1);
    const u = updates.find((x) => x.patch.sync_status === 'provisioned')!;
    expect(String(u.patch.sync_error)).toMatch(/without recordAutomatically/);

    const graph2 = new MockGraphClient();
    const f2 = fakeDb([claimed()]);
    await runProvisionMeetings(f2.db, graph2, { recordAutomatically: false });
    expect([...graph2.meetings.values()][0].options?.recordAutomatically).toBe(false);
  });
});
