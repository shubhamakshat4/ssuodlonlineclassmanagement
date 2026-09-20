/**
 * Vitest global setup for the database suite.
 *
 * Boots one embedded Postgres 17 cluster for the whole run, builds a template database
 * (shim + every migration + seed), and exposes the connection details through env vars.
 * Each test file then clones the template into its own database (fast: ~200 ms) so files
 * never see each other's writes.
 */
import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from 'pg';
import { applySupabaseProject, TEMPLATE_DB } from './harness';

export default async function globalSetup() {
  const port = 54_000 + Math.floor(Math.random() * 1_000);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssu-pg-'));
  const pg = new EmbeddedPostgres({
    databaseDir: dir,
    user: 'postgres',
    password: 'postgres',
    port,
    persistent: false,
    onLog: () => {},
    onError: () => {},
  });
  await pg.initialise();
  await pg.start();

  const adminUrl = `postgres://postgres:postgres@127.0.0.1:${port}/postgres`;
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`create database ${TEMPLATE_DB}`);
  await admin.query(`alter database ${TEMPLATE_DB} set search_path = public, extensions`);
  await admin.end();

  const tpl = new Client({ connectionString: `postgres://postgres:postgres@127.0.0.1:${port}/${TEMPLATE_DB}` });
  await tpl.connect();
  await applySupabaseProject(tpl);
  await tpl.end();

  process.env.TEST_PG_PORT = String(port);
  process.env.TEST_PG_ADMIN_URL = adminUrl;

  return async () => {
    try {
      await pg.stop();
    } finally {
      // Windows keeps a handle on the data dir for a moment after postgres exits; the dir is
      // in the OS temp folder, so leaving it behind on a stubborn lock is harmless.
      try {
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
      } catch {
        /* ignore */
      }
    }
  };
}
