import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asUser, createTestDb, expectDenied, type TestDb } from './harness';
import * as F from './fixtures';

const admin = asUser(F.ADMIN);
let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.close();
});

const insertSlot = (bs: string, teacher: string, day: number, start: string, end: string, from = '2026-07-01', to: string | null = null) =>
  db.rows(admin, `insert into timetable_slots (batch_subject_id, teacher_id, day_of_week, start_time, end_time, effective_from, effective_to) values ($1,$2,$3,$4,$5,$6,$7) returning id`, [
    bs,
    teacher,
    day,
    start,
    end,
    from,
    to,
  ]);

describe('timetable clash trigger', () => {
  // Seed: Anand teaches FM (BBA-2025) Mon 10:00–11:00 and Wed 10:00–11:00; Sat 10:00–11:30 SM (MBA-2025).
  it('rejects the same teacher double-booked across batches', async () => {
    const msg = await expectDenied(insertSlot(F.BS_MBA2025_SM, F.TEACHER_ANAND, 1, '10:30', '11:30'));
    expect(msg).toMatch(/Teacher clash/i);
    expect(msg).toMatch(/Anand/);
  });

  it('rejects the same batch double-booked with another teacher', async () => {
    const msg = await expectDenied(insertSlot(F.BS_BBA2025_MM, F.TEACHER_KAVITA, 1, '10:00', '10:30'));
    expect(msg).toMatch(/Batch clash/i);
    expect(msg).toMatch(/BBA-ODL-2025/);
  });

  it('allows back-to-back slots and other days', async () => {
    expect(await insertSlot(F.BS_BBA2025_MM, F.TEACHER_KAVITA, 1, '11:00', '12:00')).toHaveLength(1);
    expect(await insertSlot(F.BS_BBA2025_MM, F.TEACHER_KAVITA, 5, '10:00', '11:00')).toHaveLength(1);
  });

  it('allows an overlapping slot when the effective date ranges do not overlap', async () => {
    // End the seeded Monday FM slot on 31 Dec; a slot starting 1 Jan no longer clashes.
    await db.sudo(`update timetable_slots set effective_to = '2026-12-31' where id = $1`, [F.SLOT_FM_MON]);
    expect(await insertSlot(F.BS_BBA2025_MM, F.TEACHER_KAVITA, 1, '10:00', '11:00', '2027-01-01', null)).toHaveLength(1);
    // ...but a slot that starts on the last effective day still clashes
    const msg = await expectDenied(insertSlot(F.BS_BBA2025_MM, F.TEACHER_KAVITA, 1, '10:00', '11:00', '2026-12-31', null));
    expect(msg).toMatch(/clash/i);
    await db.sudo(`update timetable_slots set effective_to = null where id = $1`, [F.SLOT_FM_MON]);
  });

  it('ignores inactive slots and re-checks on update', async () => {
    await db.run(
      admin,
      async (c) => {
        await c.query(`update timetable_slots set is_active = false where id = $1`, [F.SLOT_FM_MON]);
        const r = await c.query(
          `insert into timetable_slots (batch_subject_id, teacher_id, day_of_week, start_time, end_time, effective_from) values ($1,$2,1,'10:00','11:00','2026-07-01') returning id`,
          [F.BS_BBA2025_MM, F.TEACHER_KAVITA],
        );
        expect(r.rowCount).toBe(1);
        // Reactivating the original now clashes with the new one
        let failed = false;
        try {
          await c.query(`update timetable_slots set is_active = true where id = $1`, [F.SLOT_FM_MON]);
        } catch (e) {
          failed = true;
          expect((e as Error).message).toMatch(/clash/i);
        }
        expect(failed).toBe(true);
      },
      { commit: false },
    );
  });

  it('enforces end > start and the day range', async () => {
    await expectDenied(insertSlot(F.BS_BBA2025_MM, F.TEACHER_KAVITA, 2, '11:00', '10:00'));
    await expectDenied(insertSlot(F.BS_BBA2025_MM, F.TEACHER_KAVITA, 7, '10:00', '11:00'));
  });

  it('holidays: one global per date, one per batch per date', async () => {
    await db.run(admin, async (c) => {
      await c.query(`insert into holidays (date, name) values ('2026-12-25', 'Christmas')`);
      let dup = false;
      try {
        await c.query(`insert into holidays (date, name) values ('2026-12-25', 'Again')`);
      } catch {
        dup = true;
      }
      expect(dup).toBe(true);
    });
    await db.run(admin, async (c) => {
      await c.query(`insert into holidays (date, name, batch_id) values ('2026-12-26', 'Batch break', $1)`, [F.BATCH_BBA_2025]);
      await c.query(`insert into holidays (date, name, batch_id) values ('2026-12-26', 'Batch break', $1)`, [F.BATCH_MBA_2025]);
    });
  });
});
