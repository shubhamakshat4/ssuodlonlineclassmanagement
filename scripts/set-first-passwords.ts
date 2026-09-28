/**
 * Give every account that has no password the standard first-login one, so people can actually sign in.
 *
 *   npm run auth:first-passwords                 dry run - counts who would be given one
 *   npm run auth:first-passwords -- --apply      sets it
 *   npm run auth:first-passwords -- --apply --role teacher
 *
 * Students were originally created for Google sign-in, which meant no password at all. Moving to
 * password sign-in leaves 600-odd accounts that exist but cannot be signed in to; this fills that gap.
 *
 * It only ever touches an account whose password is unset, so a student who has already chosen their
 * own keeps it. Everyone it touches is flagged must_change_password, so the portal asks them to choose
 * their own before they can see anything else.
 */
import './_env';
import { Client } from 'pg';
import { createClient } from '@supabase/supabase-js';
import { appConfig } from '../src/lib/env.ts';
import { validatePassword } from '../src/lib/auth/password.ts';

const APPLY = process.argv.includes('--apply');
const roleArg = process.argv.indexOf('--role');
const ROLES = roleArg === -1 ? ['student', 'teacher'] : [process.argv[roleArg + 1]];

async function main() {
  const password = appConfig.studentDefaultPassword;
  const policyError = validatePassword(password);
  if (policyError) throw new Error(`STUDENT_DEFAULT_PASSWORD is not allowed by the policy: ${policyError}`);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local');
  if (!process.env.SUPABASE_DB_URL) throw new Error('SUPABASE_DB_URL must be set in .env.local (the Admin API cannot tell us who has no password)');

  // Only the database can say whose password is unset; the Admin API does not expose it.
  const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  const { rows } = await db.query<{ id: string; email: string; role: string }>(
    `select p.id, p.email, p.role
       from public.profiles p
       join auth.users u on u.id = p.id
      where p.role::text = any ($1::text[])
        and p.is_active
        and coalesce(u.encrypted_password, '') = ''
      order by p.role, p.email`,
    [ROLES],
  );
  await db.end();

  const byRole = rows.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.role]: (acc[r.role] ?? 0) + 1 }), {});
  console.log(`accounts with no password: ${rows.length} ${JSON.stringify(byRole)}`);
  if (!rows.length) {
    console.log('nothing to do - everyone can already sign in');
    return;
  }
  if (!APPLY) {
    for (const r of rows.slice(0, 5)) console.log(`  - ${r.role.padEnd(7)} ${r.email}`);
    if (rows.length > 5) console.log(`  ... and ${rows.length - 5} more`);
    console.log(`\ndry run - pass --apply to set "${password}" on all ${rows.length}`);
    return;
  }

  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  let done = 0;
  const failures: string[] = [];
  // A little concurrency, but not so much that GoTrue starts refusing us.
  const BATCH = 5;
  for (let i = 0; i < rows.length; i += BATCH) {
    await Promise.all(
      rows.slice(i, i + BATCH).map(async (r) => {
        const { data: existing } = await admin.auth.admin.getUserById(r.id);
        const { error } = await admin.auth.admin.updateUserById(r.id, {
          password,
          app_metadata: { ...(existing?.user?.app_metadata ?? {}), must_change_password: true },
        });
        if (error) failures.push(`${r.email}: ${error.message}`);
        else done += 1;
      }),
    );
    if (i % 100 === 0 || i + BATCH >= rows.length) console.log(`  ${Math.min(i + BATCH, rows.length)} / ${rows.length}`);
  }
  console.log(`\nset the first-login password on ${done} account(s)`);
  if (failures.length) {
    console.log(`${failures.length} failed:`);
    for (const f of failures.slice(0, 10)) console.log(`  ${f}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
