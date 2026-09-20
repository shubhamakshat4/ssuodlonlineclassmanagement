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

describe('claim_pending_sessions', () => {
  it('claims only future, scheduled, teams, pending sessions and returns teacher/subject context', async () => {
    const rows = await db.rows<{ id: string; subject_name: string; batch_code: string; teacher_upn: string; timezone: string }>(SERVICE, 'select * from claim_pending_sessions(10)');
    expect(rows.map((r) => r.id)).toEqual([F.SESSION_TOMORROW_PENDING]);
    expect(rows[0]).toMatchObject({ subject_name: 'Business Statistics', batch_code: 'BBA-ODL-2025', teacher_upn: 'rohit.verma@srisriuniversity.onmicrosoft.com', timezone: 'Asia/Kolkata' });
  });

  it('marks claimed rows provisioning with a claim timestamp (committed)', async () => {
    const rows = await db.exec<{ id: string }>(SERVICE, 'select id from claim_pending_sessions(10)');
    expect(rows).toHaveLength(1);
    const [s] = await db.sudo<{ sync_status: string; sync_claimed_at: Date | null }>('select sync_status, sync_claimed_at from class_sessions where id = $1', [F.SESSION_TOMORROW_PENDING]);
    expect(s.sync_status).toBe('provisioning');
    expect(s.sync_claimed_at).not.toBeNull();
    // second claim finds nothing
    expect(await db.rows(SERVICE, 'select id from claim_pending_sessions(10)')).toHaveLength(0);
  });

  it('recover_stuck_provisioning re-queues rows claimed too long ago', async () => {
    let [{ n }] = await db.rows<{ n: number }>(SERVICE, 'select recover_stuck_provisioning() as n');
    expect(n).toBe(0);
    await db.sudo(`update class_sessions set sync_claimed_at = now() - interval '20 minutes' where id = $1`, [F.SESSION_TOMORROW_PENDING]);
    [{ n }] = await db.exec<{ n: number }>(SERVICE, 'select recover_stuck_provisioning() as n');
    expect(n).toBe(1);
    const [s] = await db.sudo<{ sync_status: string; sync_error: string }>('select sync_status, sync_error from class_sessions where id = $1', [F.SESSION_TOMORROW_PENDING]);
    expect(s.sync_status).toBe('pending');
    expect(s.sync_error).toMatch(/recovered/);
  });

  it('two concurrent workers never claim the same row (SKIP LOCKED)', async () => {
    // create 4 pending future sessions
    for (let i = 1; i <= 4; i++) {
      await db.sudo(
        `insert into class_sessions (batch_subject_id, teacher_id, scheduled_start, scheduled_end) values ($1, $2, now() + ($3 || ' days')::interval, now() + ($3 || ' days')::interval + interval '1 hour')`,
        [F.BS_BBA2025_FM, F.TEACHER_ANAND, String(10 + i)],
      );
    }
    const a = await db.pool.connect();
    const b = await db.pool.connect();
    try {
      await a.query('begin');
      await b.query('begin');
      const ra = await a.query('select id from claim_pending_sessions(3)');
      const rb = await b.query('select id from claim_pending_sessions(3)');
      const idsA = ra.rows.map((r: { id: string }) => r.id);
      const idsB = rb.rows.map((r: { id: string }) => r.id);
      expect(idsA).toHaveLength(3);
      expect(idsB.length).toBeGreaterThan(0);
      expect(idsA.filter((id: string) => idsB.includes(id))).toHaveLength(0);
      await a.query('rollback');
      await b.query('rollback');
    } finally {
      a.release();
      b.release();
    }
  });

  it('is not callable by app roles', async () => {
    await expectDenied(db.rows(asUser(F.ADMIN), 'select * from claim_pending_sessions(1)'));
    await expectDenied(db.rows(asUser(F.TEACHER_ANAND), 'select recover_stuck_provisioning()'));
  });

  it('v_sessions_needing_event_deletion lists cancelled/custom sessions that still have an event', async () => {
    expect(await db.rows(SERVICE, 'select id from v_sessions_needing_event_deletion')).toHaveLength(0);
    await db.exec(asUser(F.ADMIN), `update class_sessions set status = 'cancelled' where id = $1`, [F.SESSION_MBA_UPCOMING]);
    await db.exec(asUser(F.TEACHER_ANAND), `update class_sessions set join_url_override = 'https://zoom.us/j/1' where id = $1`, [F.SESSION_LIVE_BBA]);
    const rows = await db.rows<{ id: string }>(SERVICE, 'select id from v_sessions_needing_event_deletion order by id');
    expect(rows.map((r) => r.id).sort()).toEqual([F.SESSION_LIVE_BBA, F.SESSION_MBA_UPCOMING].sort());
  });
});
