/**
 * Apply supabase/migrations/*.sql to the database in SUPABASE_DB_URL, in order, skipping versions
 * already recorded in supabase_migrations.schema_migrations (the table the Supabase CLI uses, so
 * `supabase db push` stays consistent later). Each migration runs in its own transaction.
 *
 *   npm run db:migrate            # apply pending migrations
 *   npm run db:migrate -- --seed  # also run supabase/seed.sql afterwards (NEVER on production)
 */
import './_env';
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

async function main() {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error('SUPABASE_DB_URL is not set in .env.local');
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query('create schema if not exists supabase_migrations');
  await c.query('create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text)');
  const applied = new Set((await c.query('select version from supabase_migrations.schema_migrations')).rows.map((r: { version: string }) => r.version));

  const dir = path.resolve('supabase/migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  let n = 0;
  for (const f of files) {
    const version = f.split('_')[0];
    const name = f.replace(/^\d+_/, '').replace(/\.sql$/, '');
    if (applied.has(version)) {
      console.log('skip   ', f);
      continue;
    }
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    await c.query('begin');
    try {
      await c.query(sql);
      await c.query('insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3)', [version, name, [sql]]);
      await c.query('commit');
      console.log('applied', f);
      n++;
    } catch (e) {
      await c.query('rollback');
      console.error('FAILED ', f, '\n', (e as Error).message);
      process.exit(1);
    }
  }
  console.log(`${n} migration(s) applied, ${files.length - n} already present.`);

  if (process.argv.includes('--seed')) {
    const seed = fs.readFileSync(path.resolve('supabase/seed.sql'), 'utf8');
    await c.query('begin');
    try {
      await c.query(seed);
      await c.query('commit');
      console.log('seed applied');
    } catch (e) {
      await c.query('rollback');
      console.error('SEED FAILED\n', (e as Error).message);
      process.exit(1);
    }
  }
  await c.end();
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
