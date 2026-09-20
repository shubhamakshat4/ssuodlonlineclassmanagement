import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ANON, asUser, createTestDb, expectDenied, SERVICE, type TestDb } from './harness';
import * as F from './fixtures';

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.close();
});

describe('rate limiter', () => {
  it('allows up to the limit within a window, then blocks, then resets after the window', async () => {
    const hit = async () => (await db.exec<{ ok: boolean }>(SERVICE, `select rate_limit_hit('t:1', 3, 60) as ok`))[0].ok;
    expect([await hit(), await hit(), await hit()]).toEqual([true, true, true]);
    expect(await hit()).toBe(false);
    await db.sudo(`update rate_limits set window_start = now() - interval '61 seconds' where key = 't:1'`);
    expect(await hit()).toBe(true);
  });

  it('is invisible and uncallable for app roles', async () => {
    await expectDenied(db.rows(asUser(F.ADMIN), 'select * from rate_limits'));
    await expectDenied(db.rows(asUser(F.STUDENT_AARAV), `select rate_limit_hit('x', 1, 1)`));
    await expectDenied(db.rows(ANON, `select rate_limit_hit('x', 1, 1)`));
    await expectDenied(db.rows(asUser(F.STUDENT_AARAV), `insert into rate_limits (key, window_start) values ('x', now())`));
  });
});

describe('privilege boundaries (hardening pass)', () => {
  it('app roles cannot call job-only functions', async () => {
    for (const fn of ['claim_pending_sessions(1)', 'recover_stuck_provisioning()', 'expire_recordings()', 'rate_limits_cleanup()', "invoke_edge_function('x')"]) {
      await expectDenied(db.rows(asUser(F.ADMIN), `select ${fn}`));
      await expectDenied(db.rows(asUser(F.TEACHER_ANAND), `select ${fn}`));
      await expectDenied(db.rows(asUser(F.STUDENT_AARAV), `select ${fn}`));
    }
  });

  it('job views are not readable by app roles', async () => {
    for (const v of ['v_sessions_needing_event_deletion', 'v_sessions_awaiting_recording']) {
      await expectDenied(db.rows(asUser(F.ADMIN), `select * from ${v}`));
      await expectDenied(db.rows(ANON, `select * from ${v}`));
    }
  });

  it('a student cannot escalate by writing their own profile role or enrolment', async () => {
    const r1 = await db.run(asUser(F.STUDENT_AARAV), async (c) => c.query(`update profiles set role = 'admin' where id = $1`, [F.STUDENT_AARAV]));
    expect(r1.rowCount).toBe(0);
    const r2 = await db.run(asUser(F.STUDENT_MEERA_ON_HOLD), async (c) => c.query(`update students set status = 'active' where id = $1`, [F.STUDENT_MEERA_ON_HOLD]));
    expect(r2.rowCount).toBe(0);
    const r3 = await db.run(asUser(F.STUDENT_AARAV), async (c) => c.query(`update students set batch_id = $2 where id = $1`, [F.STUDENT_AARAV, F.BATCH_MBA_2025]));
    expect(r3.rowCount).toBe(0);
  });

  it('a teacher cannot escalate or touch other tables', async () => {
    const r1 = await db.run(asUser(F.TEACHER_ANAND), async (c) => c.query(`update profiles set role = 'admin' where id = $1`, [F.TEACHER_ANAND]));
    expect(r1.rowCount).toBe(0);
    await expectDenied(db.rows(asUser(F.TEACHER_ANAND), `insert into recordings (class_session_id, expires_at) values ($1, now())`, [F.SESSION_PAST_RECORDED]));
    await expectDenied(db.rows(asUser(F.TEACHER_ANAND), `insert into holidays (date, name) values ('2030-01-01', 'x')`));
    const r2 = await db.run(asUser(F.TEACHER_ANAND), async (c) => c.query(`update app_settings set join_window_lead_minutes = 120`));
    expect(r2.rowCount).toBe(0);
    const r3 = await db.run(asUser(F.TEACHER_ANAND), async (c) => c.query(`update teachers set entra_upn = 'x@y' where id = $1`, [F.TEACHER_KAVITA]));
    expect(r3.rowCount).toBe(0);
  });

  it('deactivating a profile removes all access immediately', async () => {
    await db.sudo(`update profiles set is_active = false where id = $1`, [F.STUDENT_AARAV]);
    expect(await db.rows(asUser(F.STUDENT_AARAV), 'select id from class_sessions')).toHaveLength(0);
    expect(await db.rows(asUser(F.STUDENT_AARAV), 'select id from recordings')).toHaveLength(0);
    await expectDenied(db.rows(asUser(F.STUDENT_AARAV), 'insert into attendance (class_session_id, student_id) values ($1, $2)', [F.SESSION_LIVE_BBA, F.STUDENT_AARAV]));
    await db.sudo(`update profiles set is_active = true where id = $1`, [F.STUDENT_AARAV]);
  });

  it('log_audit cannot be used to forge another actor and anon cannot call it', async () => {
    await expectDenied(db.rows(ANON, `select log_audit('x', 'y', null, '{}')`));
    await db.run(asUser(F.STUDENT_AARAV), async (c) => {
      await c.query(`select log_audit('student.note', 'profiles', $1, '{"actor_id":"a0000000-0000-4000-8000-000000000001"}')`, [F.STUDENT_AARAV]);
      await c.query('reset role');
      const r = await c.query(`select actor_id from audit_log where action = 'student.note'`);
      expect(r.rows[0].actor_id).toBe(F.STUDENT_AARAV);
    });
  });
});
