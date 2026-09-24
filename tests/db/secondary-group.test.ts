/**
 * Classes are timetabled per programme + semester (a "class group"). A student follows one group and
 * may follow a second one (e.g. a semester they missed). Both must be visible; nothing else may leak.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asUser, createTestDb, expectDenied, SERVICE, type TestDb } from './harness';
import * as F from './fixtures';

const aarav = asUser(F.STUDENT_AARAV);
const admin = asUser(F.ADMIN);

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.close();
});

describe('secondary class group', () => {
  it('starts empty and the student sees only their primary group', async () => {
    const [s] = await db.rows<{ secondary_batch_id: string | null }>(admin, 'select secondary_batch_id from students where id = $1', [F.STUDENT_AARAV]);
    expect(s.secondary_batch_id).toBeNull();
    const ids = await db.rows<{ id: string }>(aarav, 'select id from batches order by id');
    expect(ids.map((b) => b.id)).toEqual([F.BATCH_BBA_2025]);
    expect(await db.rows(aarav, 'select id from class_sessions where id = $1', [F.SESSION_LIVE_MBA])).toHaveLength(0);
  });

  it('adding a second group reveals that group’s sessions, subjects and recordings too', async () => {
    await db.exec(admin, 'update students set secondary_batch_id = $2 where id = $1', [F.STUDENT_AARAV, F.BATCH_MBA_2025]);

    const batches = await db.rows<{ id: string }>(aarav, 'select id from batches');
    expect(batches.map((b) => b.id).sort()).toEqual([F.BATCH_BBA_2025, F.BATCH_MBA_2025].sort());

    // sessions from both groups
    const sessions = await db.rows<{ id: string }>(aarav, 'select id from v_class_sessions');
    expect(sessions.map((s) => s.id)).toContain(F.SESSION_LIVE_BBA);
    expect(sessions.map((s) => s.id)).toContain(F.SESSION_LIVE_MBA);
    // still nothing from the third batch
    expect(sessions.map((s) => s.id)).not.toContain(F.SESSION_BBA2026_UPCOMING);

    // the other group's recording becomes visible
    expect((await db.rows<{ id: string }>(aarav, 'select id from recordings')).map((r) => r.id).sort()).toEqual([F.RECORDING_AVAILABLE, F.RECORDING_OTHER_BATCH].sort());

    // and they may now record attendance in the second group's live class
    await db.run(aarav, async (c) => {
      const r = await c.query('insert into attendance (class_session_id, student_id) values ($1,$2) returning id', [F.SESSION_LIVE_MBA, F.STUDENT_AARAV]);
      expect(r.rowCount).toBe(1);
    });
  });

  it('removing it takes the access away again', async () => {
    await db.exec(admin, 'update students set secondary_batch_id = null where id = $1', [F.STUDENT_AARAV]);
    expect(await db.rows(aarav, 'select id from v_class_sessions where id = $1', [F.SESSION_LIVE_MBA])).toHaveLength(0);
    await expectDenied(db.rows(aarav, 'insert into attendance (class_session_id, student_id) values ($1,$2)', [F.SESSION_LIVE_MBA, F.STUDENT_AARAV]));
  });

  it('a group cannot be its own secondary', async () => {
    const msg = await expectDenied(db.rows(admin, 'update students set secondary_batch_id = batch_id where id = $1', [F.STUDENT_AARAV]));
    expect(msg).toMatch(/students_distinct_groups/);
  });

  it('students cannot give themselves a second group', async () => {
    const r = await db.run(aarav, async (c) => c.query('update students set secondary_batch_id = $2 where id = $1', [F.STUDENT_AARAV, F.BATCH_MBA_2025]));
    expect(r.rowCount).toBe(0);
  });

  it('an on-hold student sees nothing even with two groups', async () => {
    await db.exec(admin, `update students set secondary_batch_id = $2, status = 'on_hold' where id = $1`, [F.STUDENT_AARAV, F.BATCH_MBA_2025]);
    expect(await db.rows(aarav, 'select id from v_class_sessions')).toHaveLength(0);
    expect(await db.rows(aarav, 'select id from batches')).toHaveLength(0);
    await db.exec(admin, `update students set secondary_batch_id = null, status = 'active' where id = $1`, [F.STUDENT_AARAV]);
  });

  it('v_class_groups counts primary and secondary members separately', async () => {
    await db.exec(admin, 'update students set secondary_batch_id = $2 where id = $1', [F.STUDENT_AARAV, F.BATCH_MBA_2025]);
    const [mba] = await db.rows<{ primary_students: string; secondary_students: string; code: string }>(SERVICE, 'select code, primary_students, secondary_students from v_class_groups where id = $1', [
      F.BATCH_MBA_2025,
    ]);
    expect(Number(mba.primary_students)).toBe(2); // Kabir + Sneha
    expect(Number(mba.secondary_students)).toBe(1); // Aarav, attending as a second group
    await db.exec(admin, 'update students set secondary_batch_id = null where id = $1', [F.STUDENT_AARAV]);
  });
});
