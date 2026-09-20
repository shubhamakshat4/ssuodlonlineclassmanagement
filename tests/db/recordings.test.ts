import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asUser, createTestDb, expectDenied, SERVICE, type TestDb } from './harness';
import * as F from './fixtures';

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.close();
});

describe('recording jobs (database side)', () => {
  it('v_sessions_awaiting_recording lists completed Teams sessions from the last 48 h without a recording', async () => {
    const rows = await db.rows<{ id: string; subject_name: string }>(SERVICE, 'select id, subject_name from v_sessions_awaiting_recording');
    // seed: past_no_rec ended 3 days ago (outside 48 h) → nothing yet
    expect(rows).toHaveLength(0);
    await db.sudo(`update class_sessions set scheduled_start = now() - interval '3 hours', scheduled_end = now() - interval '2 hours' where id = $1`, [F.SESSION_PAST_NO_REC]);
    const after = await db.rows<{ id: string; subject_name: string }>(SERVICE, 'select id, subject_name from v_sessions_awaiting_recording');
    expect(after.map((r) => r.id)).toEqual([F.SESSION_PAST_NO_REC]);
    expect(after[0].subject_name).toBe('Marketing Management');
    // custom-link sessions are never harvested
    await db.sudo(`update class_sessions set provider = 'custom' where id = $1`, [F.SESSION_PAST_NO_REC]);
    expect(await db.rows(SERVICE, 'select id from v_sessions_awaiting_recording')).toHaveLength(0);
    await db.sudo(`update class_sessions set provider = 'teams' where id = $1`, [F.SESSION_PAST_NO_REC]);
  });

  it('a harvested recording becomes visible to enrolled students only, with days remaining', async () => {
    await db.exec(SERVICE, `insert into recordings (class_session_id, graph_recording_id, drive_id, drive_item_id, recorded_at, expires_at) values ($1, 'rec-x', 'd', 'i', now() - interval '2 hours', now() - interval '2 hours' + interval '30 days')`, [
      F.SESSION_PAST_NO_REC,
    ]);
    const aarav = await db.rows<{ id: string; expires_at: Date }>(asUser(F.STUDENT_AARAV), 'select id, expires_at from recordings where class_session_id = $1', [F.SESSION_PAST_NO_REC]);
    expect(aarav).toHaveLength(1);
    expect(await db.rows(asUser(F.STUDENT_KABIR), 'select id from recordings where class_session_id = $1', [F.SESSION_PAST_NO_REC])).toHaveLength(0);
    expect(await db.rows(asUser(F.STUDENT_MEERA_ON_HOLD), 'select id from recordings where class_session_id = $1', [F.SESSION_PAST_NO_REC])).toHaveLength(0);
    // the session's teacher (Kavita) sees it; Anand does not
    expect(await db.rows(asUser(F.TEACHER_KAVITA), 'select id from recordings where class_session_id = $1', [F.SESSION_PAST_NO_REC])).toHaveLength(1);
    expect(await db.rows(asUser(F.TEACHER_ANAND), 'select id from recordings where class_session_id = $1', [F.SESSION_PAST_NO_REC])).toHaveLength(0);
    // no longer awaiting
    expect(await db.rows(SERVICE, 'select id from v_sessions_awaiting_recording')).toHaveLength(0);
  });

  it('expire_recordings flips only past-due available rows and is service-only', async () => {
    const [{ n }] = await db.exec<{ n: number }>(SERVICE, 'select expire_recordings() as n');
    expect(n).toBe(0); // the seeded expired row is already 'expired'
    await db.sudo(`update recordings set expires_at = now() - interval '1 minute' where id = $1`, [F.RECORDING_AVAILABLE]);
    const [{ n: n2 }] = await db.exec<{ n: number }>(SERVICE, 'select expire_recordings() as n');
    expect(n2).toBe(1);
    const [r] = await db.sudo<{ status: string }>('select status from recordings where id = $1', [F.RECORDING_AVAILABLE]);
    expect(r.status).toBe('expired');
    expect(await db.rows(asUser(F.STUDENT_AARAV), 'select id from recordings where id = $1', [F.RECORDING_AVAILABLE])).toHaveLength(0);
    await expectDenied(db.rows(asUser(F.ADMIN), 'select expire_recordings()'));
    await expectDenied(db.rows(asUser(F.STUDENT_AARAV), 'select expire_recordings()'));
  });

  it('students cannot read recordings of a batch they are not enrolled in even through the view join', async () => {
    const rows = await db.rows(asUser(F.STUDENT_AARAV), 'select r.id from recordings r join v_class_sessions v on v.id = r.class_session_id where v.batch_code = $1', ['MBA-ODL-2025']);
    expect(rows).toHaveLength(0);
  });
});
