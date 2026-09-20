/**
 * Database test harness.
 *
 * `applySupabaseProject(client)` — applies tests/db/supabase-shim.sql, then every file in
 *   supabase/migrations in name order, then supabase/seed.sql. Used to build the template DB.
 *
 * `createTestDb()` — clones the template into a fresh database for one test file and returns
 *   helpers that run SQL *as a Supabase role with JWT claims*, which is exactly how PostgREST
 *   executes user queries: `set local role authenticated` + `request.jwt.claims`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Client, Pool, type PoolClient } from 'pg';

export const TEMPLATE_DB = 'ssu_template';

const ROOT = path.resolve(__dirname, '..', '..');

export async function applySupabaseProject(client: Client) {
  await client.query(fs.readFileSync(path.join(__dirname, 'supabase-shim.sql'), 'utf8'));
  const dir = path.join(ROOT, 'supabase', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    try {
      await client.query(fs.readFileSync(path.join(dir, f), 'utf8'));
    } catch (e) {
      throw new Error(`Migration ${f} failed: ${(e as Error).message}`);
    }
  }
  try {
    await client.query(fs.readFileSync(path.join(ROOT, 'supabase', 'seed.sql'), 'utf8'));
  } catch (e) {
    throw new Error(`seed.sql failed: ${(e as Error).message}`);
  }
}

export type DbRole = 'anon' | 'authenticated' | 'service_role';

export interface Actor {
  /** auth.uid() — null for anon / service contexts */
  uid: string | null;
  role?: DbRole;
  email?: string;
}

export const ANON: Actor = { uid: null, role: 'anon' };
export const SERVICE: Actor = { uid: null, role: 'service_role' };
export const asUser = (uid: string, email?: string): Actor => ({ uid, role: 'authenticated', email });

export interface TestDb {
  pool: Pool;
  /** Run `fn` inside a transaction as the actor. Rolled back unless `commit` is true. */
  run<T>(actor: Actor, fn: (c: PoolClient) => Promise<T>, opts?: { commit?: boolean }): Promise<T>;
  /** Single query as actor (rolled back). Returns rows. */
  rows<T = Record<string, unknown>>(actor: Actor, sql: string, params?: unknown[]): Promise<T[]>;
  /** Single statement as actor, committed. Returns rows. */
  exec<T = Record<string, unknown>>(actor: Actor, sql: string, params?: unknown[]): Promise<T[]>;
  /** Superuser query, committed (fixtures / assertions that bypass RLS). */
  sudo<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

let counter = 0;

export async function createTestDb(): Promise<TestDb> {
  const port = process.env.TEST_PG_PORT;
  const adminUrl = process.env.TEST_PG_ADMIN_URL;
  if (!port || !adminUrl) {
    throw new Error('Database tests need the global setup (vitest.config.ts globalSetup).');
  }
  const name = `ssu_t_${process.pid}_${Date.now()}_${counter++}`;
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`create database ${name} template ${TEMPLATE_DB}`);
  await admin.query(`alter database ${name} set search_path = public, extensions`);
  await admin.end();

  const pool = new Pool({
    connectionString: `postgres://postgres:postgres@127.0.0.1:${port}/${name}`,
    max: 4,
  });

  async function begin(c: PoolClient, actor: Actor) {
    await c.query('begin');
    const role = actor.role ?? (actor.uid ? 'authenticated' : 'anon');
    if (actor.uid || role === 'authenticated') {
      const claims = {
        sub: actor.uid,
        role: 'authenticated',
        email: actor.email ?? null,
        aud: 'authenticated',
      };
      await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    } else {
      await c.query(`select set_config('request.jwt.claims', '', true)`);
    }
    await c.query(`set local role ${role}`);
  }

  const db: TestDb = {
    pool,
    async run(actor, fn, opts) {
      const c = await pool.connect();
      try {
        await begin(c, actor);
        const result = await fn(c);
        await c.query(opts?.commit ? 'commit' : 'rollback');
        return result;
      } catch (e) {
        try {
          await c.query('rollback');
        } catch {
          /* ignore */
        }
        throw e;
      } finally {
        c.release();
      }
    },
    async rows<T>(actor: Actor, sql: string, params: unknown[] = []) {
      return db.run(actor, async (c) => (await c.query(sql, params)).rows as T[]);
    },
    async exec<T>(actor: Actor, sql: string, params: unknown[] = []) {
      return db.run(actor, async (c) => (await c.query(sql, params)).rows as T[], { commit: true });
    },
    async sudo<T>(sql: string, params: unknown[] = []) {
      return (await pool.query(sql, params)).rows as T[];
    },
    async close() {
      await pool.end();
      const a = new Client({ connectionString: adminUrl });
      await a.connect();
      await a.query(`drop database if exists ${name} with (force)`);
      await a.end();
    },
  };
  return db;
}

/** Assert that a query is rejected by RLS/trigger; returns the error message. */
export async function expectDenied(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error('Expected the statement to be denied, but it succeeded');
}
