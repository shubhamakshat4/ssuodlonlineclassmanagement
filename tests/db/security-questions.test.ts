/**
 * Security questions let a student reset their own password with no email being sent. Answers are
 * hashed in the database and are never readable by a browser: only the service role may set or check
 * them, and the check happens inside the database so the hash never leaves it.
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

describe('security questions', () => {
  it('offers a list of active prompts to anyone signed in', async () => {
    const rows = await db.rows<{ id: number; prompt: string }>(aarav, 'select id, prompt from security_questions order by id');
    expect(rows.length).toBeGreaterThanOrEqual(5);
    expect(rows[0].prompt).toMatch(/\?$/);
  });

  it('stores an answer as a hash, never as text', async () => {
    await db.exec(SERVICE, `select set_security_answer($1::uuid, 1::smallint, '  Sunita  ')`, [F.STUDENT_AARAV]);
    const [row] = await db.rows<{ answer_hash: string }>(SERVICE, 'select answer_hash from security_answers where user_id = $1 and question_id = 1', [F.STUDENT_AARAV]);
    expect(row.answer_hash).not.toContain('Sunita');
    expect(row.answer_hash.startsWith('$2')).toBe(true);
  });

  it('accepts the answer ignoring case and surrounding spaces, and rejects a wrong one', async () => {
    await db.exec(SERVICE, `select set_security_answer($1::uuid, 1::smallint, 'Sunita')`, [F.STUDENT_AARAV]);
    const ok = async (answer: string) => {
      const [r] = await db.rows<{ ok: boolean }>(SERVICE, 'select check_security_answer($1::uuid, 1::smallint, $2::text) as ok', [F.STUDENT_AARAV, answer]);
      return r.ok;
    };
    expect(await ok('sunita')).toBe(true);
    expect(await ok('  SUNITA ')).toBe(true);
    expect(await ok('Anita')).toBe(false);
    expect(await ok('')).toBe(false);
  });

  it('re-setting an answer replaces it', async () => {
    await db.exec(SERVICE, `select set_security_answer($1::uuid, 1::smallint, 'First')`, [F.STUDENT_AARAV]);
    await db.exec(SERVICE, `select set_security_answer($1::uuid, 1::smallint, 'Second')`, [F.STUDENT_AARAV]);
    const [r] = await db.rows<{ a: boolean; b: boolean }>(SERVICE, 'select check_security_answer($1::uuid, 1::smallint, $2::text) as a, check_security_answer($1::uuid, 1::smallint, $3::text) as b', [
      F.STUDENT_AARAV,
      'first',
      'second',
    ]);
    expect(r).toEqual({ a: false, b: true });
    const [{ n }] = await db.rows<{ n: string }>(SERVICE, 'select count(*)::text as n from security_answers where user_id = $1', [F.STUDENT_AARAV]);
    expect(n).toBe('1');
  });

  it('a student can count their own answers but never read or write them', async () => {
    await db.exec(SERVICE, `select set_security_answer($1::uuid, 1::smallint, 'Sunita')`, [F.STUDENT_AARAV]);
    const [c] = await db.rows<{ n: number }>(aarav, 'select security_answer_count($1::uuid) as n', [F.STUDENT_AARAV]);
    expect(c.n).toBe(1);
    expect(await db.rows(aarav, 'select answer_hash from security_answers')).toHaveLength(0);
    await expectDenied(db.exec(aarav, `select set_security_answer($1::uuid, 2::smallint, 'x')`, [F.STUDENT_AARAV]));
    await expectDenied(db.exec(aarav, `select check_security_answer($1::uuid, 1::smallint, 'Sunita')`, [F.STUDENT_AARAV]));
  });

  it('not even an admin can read the hashes or verify an answer through the API', async () => {
    expect(await db.rows(admin, 'select answer_hash from security_answers')).toHaveLength(0);
    await expectDenied(db.exec(admin, `select check_security_answer($1::uuid, 1::smallint, 'Sunita')`, [F.STUDENT_AARAV]));
  });

  it('answers disappear with the account', async () => {
    await db.exec(SERVICE, `select set_security_answer($1::uuid, 3::smallint, 'Puri')`, [F.STUDENT_AARAV]);
    await db.sudo('delete from auth.users where id = $1', [F.STUDENT_AARAV]); // only the owner may touch auth.users
    const [{ n }] = await db.sudo<{ n: string }>('select count(*)::text as n from security_answers where user_id = $1', [F.STUDENT_AARAV]);
    expect(n).toBe('0');
  });
});
