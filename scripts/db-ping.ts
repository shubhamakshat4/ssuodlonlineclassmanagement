import './_env';
import { Client } from 'pg';
async function main() {
  const c = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
  await c.connect();
  const r = await c.query(`select version(), current_user, (select count(*) from pg_tables where schemaname='public') as public_tables, (select string_agg(extname, ',') from pg_extension) as ext`);
  console.log(JSON.stringify(r.rows[0]));
  await c.end();
}
main().catch((e) => { console.error('PING FAILED:', e.code ?? '', e.message); process.exit(1); });
