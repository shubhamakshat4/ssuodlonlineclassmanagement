import { describe, expect, it } from 'vitest';
import { MockGraphClient } from '@shared/graph/index.ts';
import type { DbClient } from '@shared/db.ts';
import { matchDriveItem, runHarvestRecordings, type AwaitingSession } from '@shared/jobs/harvest-recordings.ts';

const session = (over: Partial<AwaitingSession> = {}): AwaitingSession => ({
  id: 'sess-1',
  graph_online_meeting_id: 'mock-meeting-1',
  graph_event_id: 'mock-event-1',
  scheduled_start: '2026-09-14T04:30:00.000Z',
  scheduled_end: '2026-09-14T05:30:00.000Z',
  subject_name: 'Financial Management',
  batch_code: 'BBA-ODL-2025',
  ...over,
});

const item = (over: Partial<Parameters<typeof matchDriveItem>[1][number]> = {}) => ({
  driveId: 'drive-1',
  itemId: 'item-1',
  name: 'Financial Management — BBA-ODL-2025-20260914_1000-Meeting Recording.mp4',
  createdDateTime: '2026-09-14T05:31:00.000Z',
  sizeBytes: 400_000_000,
  durationSeconds: 3500,
  ...over,
});

describe('matchDriveItem', () => {
  it('matches by window and subject name, picks the closest to the hint', () => {
    const items = [item(), item({ itemId: 'item-2', createdDateTime: '2026-09-14T09:00:00.000Z' }), item({ itemId: 'other', name: 'Marketing Management-Recording.mp4' })];
    expect(matchDriveItem(session(), items)?.itemId).toBe('item-1');
    expect(matchDriveItem(session(), items, '2026-09-14T08:55:00.000Z')?.itemId).toBe('item-2');
  });
  it('rejects files outside the window or with another subject', () => {
    expect(matchDriveItem(session(), [item({ createdDateTime: '2026-09-13T05:31:00.000Z' })])).toBeNull();
    expect(matchDriveItem(session(), [item({ name: 'Business Statistics-Meeting Recording.mp4' })])).toBeNull();
  });
});

function fakeDb(sessions: AwaitingSession[], retention = 30) {
  const inserted: Record<string, unknown>[] = [];
  const audits: string[] = [];
  const db: DbClient = {
    from: (table: string) => {
      const api = {
        select: () => api,
        eq: () => api,
        single: () => Promise.resolve({ data: { recording_retention_days: retention }, error: null }),
        upsert: (row: Record<string, unknown>) => {
          inserted.push(row);
          return { select: () => Promise.resolve({ data: [{ id: 'r' }], error: null }) };
        },
        then: (resolve: (v: unknown) => void) => resolve({ data: table === 'v_sessions_awaiting_recording' ? sessions : [], error: null }),
      };
      return api;
    },
    rpc: (fn: string, args?: Record<string, unknown>) => {
      if (fn === 'log_audit') audits.push(String(args?.p_action));
      return Promise.resolve({ data: null, error: null });
    },
  };
  return { db, inserted, audits };
}

describe('runHarvestRecordings', () => {
  it('primary path: recording metadata from Graph + file located in the folder, expiry = recorded_at + 30 days', async () => {
    const graph = new MockGraphClient();
    graph.meetings.set('mock-meeting-1', { id: 'mock-meeting-1', joinUrl: 'u', options: null, recordings: [] });
    graph.addRecording('mock-meeting-1', { id: 'rec-1', createdDateTime: '2026-09-14T05:31:30.000Z' });
    graph.addDriveItem(item());
    const { db, inserted, audits } = fakeDb([session()]);
    const summary = await runHarvestRecordings(db, graph, { now: new Date('2026-09-14T06:30:00Z') });
    expect(summary).toMatchObject({ checked: 1, harvested: 1, pending: 0 });
    expect(inserted[0]).toMatchObject({
      class_session_id: 'sess-1',
      graph_recording_id: 'rec-1',
      drive_id: 'drive-1',
      drive_item_id: 'item-1',
      recorded_at: '2026-09-14T05:31:30.000Z',
      expires_at: '2026-10-14T05:31:30.000Z',
      status: 'available',
      duration_seconds: 3500,
    });
    expect(audits).toContain('recording.harvested');
  });

  it('waits for the primary path (pending) and only scans the folder after 6 h', async () => {
    const graph = new MockGraphClient();
    graph.meetings.set('mock-meeting-1', { id: 'mock-meeting-1', joinUrl: 'u', options: null, recordings: [] });
    graph.addDriveItem(item());
    const early = fakeDb([session()]);
    expect(await runHarvestRecordings(early.db, graph, { now: new Date('2026-09-14T06:30:00Z') })).toMatchObject({ pending: 1, harvested: 0 });
    const late = fakeDb([session()]);
    expect(await runHarvestRecordings(late.db, graph, { now: new Date('2026-09-14T12:00:00Z') })).toMatchObject({ harvested: 1 });
    expect(late.inserted[0].graph_recording_id).toBe('drive:item-1');
  });

  it('manual mode goes straight to the folder scan; sessions without a meeting id too', async () => {
    const graph = new MockGraphClient();
    graph.addDriveItem(item());
    const manual = fakeDb([session()]);
    expect(await runHarvestRecordings(manual.db, graph, { now: new Date('2026-09-14T06:00:00Z'), manualRecordingMode: true })).toMatchObject({ harvested: 1 });
    const noMeeting = fakeDb([session({ graph_online_meeting_id: null })]);
    expect(await runHarvestRecordings(noMeeting.db, graph, { now: new Date('2026-09-14T06:00:00Z') })).toMatchObject({ harvested: 1 });
  });

  it('records errors per session without stopping the run', async () => {
    const graph = new MockGraphClient();
    graph.failure = 'network';
    const { db, audits } = fakeDb([session(), session({ id: 'sess-2' })]);
    const summary = await runHarvestRecordings(db, graph, { now: new Date('2026-09-14T06:00:00Z') });
    expect(summary.errors).toHaveLength(2);
    expect(audits.filter((a) => a === 'recording.harvest_failed')).toHaveLength(2);
  });
});
