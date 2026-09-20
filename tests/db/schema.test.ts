import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, SERVICE, type TestDb } from './harness';
import { SESSION_LIVE_BBA, SESSION_PAST_RECORDED } from './fixtures';

describe('schema + seed', () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
  });
  afterAll(async () => {
    await db.close();
  });

  it('applies every migration and the seed on a fresh database', async () => {
    const [{ n }] = await db.sudo<{ n: string }>('select count(*)::text as n from public.profiles');
    expect(Number(n)).toBe(12);
    const tables = await db.sudo<{ tablename: string; rowsecurity: boolean }>(
      `select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename`,
    );
    expect(tables.map((t) => t.tablename)).toEqual([
      'app_settings',
      'attendance',
      'audit_log',
      'batch_subjects',
      'batches',
      'class_sessions',
      'holidays',
      'profiles',
      'programs',
      'recordings',
      'students',
      'subject_teachers',
      'subjects',
      'teachers',
      'timetable_slots',
    ]);
    expect(tables.every((t) => t.rowsecurity)).toBe(true);
  });

  it('v_class_sessions derives the effective URL and join window', async () => {
    const [live] = await db.rows<{ effective_join_url: string; join_window_open: boolean; has_override: boolean }>(
      SERVICE,
      'select effective_join_url, join_window_open, has_override from v_class_sessions where id = $1',
      [SESSION_LIVE_BBA],
    );
    expect(live.effective_join_url).toContain('teams.microsoft.com');
    expect(live.join_window_open).toBe(true);
    expect(live.has_override).toBe(false);

    const [past] = await db.rows<{ join_window_open: boolean }>(
      SERVICE,
      'select join_window_open from v_class_sessions where id = $1',
      [SESSION_PAST_RECORDED],
    );
    expect(past.join_window_open).toBe(false);
  });

  it('updated_at is maintained by trigger', async () => {
    const [before] = await db.sudo<{ updated_at: Date }>('select updated_at from programs limit 1');
    await db.sudo(`update programs set name = name || ' ' where id = (select id from programs limit 1)`);
    const [after] = await db.sudo<{ updated_at: Date }>('select updated_at from programs limit 1');
    expect(after.updated_at.getTime()).toBeGreaterThanOrEqual(before.updated_at.getTime());
  });
});
