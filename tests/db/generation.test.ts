/**
 * Session generation against the real schema: expandSlots() output inserted with
 * ON CONFLICT DO NOTHING is idempotent, respects the unique constraint, and the rows are
 * visible to the right students. (The supabase-js job wrapper is exercised in production and
 * by the Edge Function; PostgREST is not available in this harness.)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asUser, createTestDb, SERVICE, type TestDb } from './harness';
import * as F from './fixtures';
import { expandSlots, type HolidayInput, type SlotInput } from '@shared/timetable.ts';

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.close();
});

async function loadInputs() {
  const slots = await db.sudo<SlotInput>(
    `select ts.id, ts.batch_subject_id, ts.teacher_id, ts.day_of_week, ts.start_time::text, ts.end_time::text,
            ts.effective_from::text, ts.effective_to::text, ts.is_active, bs.batch_id,
            (bs.is_active and b.is_active) as offering_active
       from timetable_slots ts
       join batch_subjects bs on bs.id = ts.batch_subject_id
       join batches b on b.id = bs.batch_id
      where ts.is_active`,
  );
  const holidays = await db.sudo<HolidayInput>(`select date::text, batch_id from holidays`);
  return { slots, holidays };
}

async function insertAll(rows: ReturnType<typeof expandSlots>) {
  let inserted = 0;
  for (const r of rows) {
    const res = await db.sudo(
      `insert into class_sessions (timetable_slot_id, batch_subject_id, teacher_id, scheduled_start, scheduled_end, status, sync_status, provider)
       values ($1,$2,$3,$4,$5,'scheduled','pending','teams')
       on conflict (timetable_slot_id, scheduled_start) do nothing returning id`,
      [r.timetable_slot_id, r.batch_subject_id, r.teacher_id, r.scheduled_start, r.scheduled_end],
    );
    inserted += res.length;
  }
  return inserted;
}

describe('session generation', () => {
  it('inserts generated sessions once and is idempotent on re-run', async () => {
    const { slots, holidays } = await loadInputs();
    const rows = expandSlots(slots, holidays, { from: '2026-10-01', horizonDays: 21, tz: 'Asia/Kolkata' });
    expect(rows.length).toBeGreaterThan(10);
    const first = await insertAll(rows);
    expect(first).toBe(rows.length);
    const second = await insertAll(rows);
    expect(second).toBe(0);
    const [{ n }] = await db.sudo<{ n: number }>(`select count(*)::int as n from class_sessions where timetable_slot_id is not null`);
    expect(n).toBe(rows.length);
  });

  it('skips the seeded holidays (Gandhi Jayanti 2 Oct is a Friday — no Friday slots; Dussehra 20 Oct is a Tuesday: no MM class)', async () => {
    const { slots, holidays } = await loadInputs();
    const rows = expandSlots(slots, holidays, { from: '2026-10-19', horizonDays: 7, tz: 'Asia/Kolkata' });
    const tue = rows.filter((r) => r.timetable_slot_id === F.SLOT_MM_TUE);
    expect(tue).toHaveLength(0);
    // and the MBA-only study break (Sun 8 Nov) removes only the BBA-2026 Sunday class? No — it is scoped to MBA, so BBA-2026 keeps its Sunday class.
    const nov = expandSlots(slots, holidays, { from: '2026-11-08', horizonDays: 1, tz: 'Asia/Kolkata' });
    expect(nov.some((r) => r.timetable_slot_id === F.SLOT_POM_SUN)).toBe(true);
  });

  it('generated sessions are visible only to enrolled students and their teacher', async () => {
    const { slots, holidays } = await loadInputs();
    const rows = expandSlots(slots, holidays, { from: '2026-11-02', horizonDays: 7, tz: 'Asia/Kolkata' });
    await insertAll(rows);
    const mon = rows.find((r) => r.timetable_slot_id === F.SLOT_FM_MON)!;
    const [{ id }] = await db.sudo<{ id: string }>(`select id from class_sessions where timetable_slot_id = $1 and scheduled_start = $2`, [mon.timetable_slot_id, mon.scheduled_start]);
    expect(await db.rows(asUser(F.STUDENT_AARAV), 'select id from v_class_sessions where id = $1', [id])).toHaveLength(1);
    expect(await db.rows(asUser(F.STUDENT_KABIR), 'select id from v_class_sessions where id = $1', [id])).toHaveLength(0);
    expect(await db.rows(asUser(F.TEACHER_ANAND), 'select id from v_class_sessions where id = $1', [id])).toHaveLength(1);
    expect(await db.rows(asUser(F.TEACHER_KAVITA), 'select id from v_class_sessions where id = $1', [id])).toHaveLength(0);
    const [v] = await db.rows<{ effective_join_url: string | null; sync_status: string }>(SERVICE, 'select effective_join_url, sync_status from v_class_sessions where id = $1', [id]);
    expect(v.effective_join_url).toBeNull();
    expect(v.sync_status).toBe('pending');
  });

  it('cron infrastructure is present but inert without pg_net/vault', async () => {
    const [r] = await db.sudo<{ id: number | null }>(`select public.invoke_edge_function('cron-generate-sessions') as id`);
    expect(r.id).toBeNull();
  });
});
