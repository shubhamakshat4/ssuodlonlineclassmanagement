/**
 * Set a portal password directly, without any email round trip.
 *
 *   npm run auth:set-password -- odl.admin@srisriuniversity.edu.in 'NewPassword2026'
 *   npm run auth:set-password -- odl.admin@srisriuniversity.edu.in --from-env E2E_ADMIN_PASSWORD
 *
 * The --from-env form reads the password from .env.local, so it never appears in shell history. Use it
 * to make an account match the value the test suites already expect.
 *
 * The Supabase dashboard only offers "send a recovery email", which is useless when the account's
 * mailbox does not exist yet (the ODL admin address and the 21 placeholder faculty logins). This uses
 * the Admin API with the service-role key, which sets the bcrypt hash in auth.users straight away.
 *
 * Passwords are never stored or compared by this application - Supabase Auth (GoTrue) owns them. The
 * app only enforces a policy (src/lib/auth/password.ts) on the forms that submit a new one, which this
 * script applies too.
 */
import './_env';
import { createClient } from '@supabase/supabase-js';
import { validatePassword } from '../src/lib/auth/password.ts';

const args = process.argv.slice(2);
const email = args[0];
const fromEnvIndex = args.indexOf('--from-env');
const password = fromEnvIndex === -1 ? args[1] : process.env[args[fromEnvIndex + 1] ?? ''];

async function main() {
  if (!email || !password) {
    console.error("usage: npm run auth:set-password -- <email> '<new password>'");
    console.error('   or: npm run auth:set-password -- <email> --from-env <ENV_VAR_HOLDING_THE_PASSWORD>');
    if (fromEnvIndex !== -1) console.error(`${args[fromEnvIndex + 1] ?? '(no variable named)'} is not set in .env.local`);
    process.exit(2);
  }
  const policyError = validatePassword(password);
  if (policyError) {
    console.error(policyError);
    process.exit(2);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local');
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // The Admin API has no lookup by email, so page through the users.
  let user: { id: string; email?: string; app_metadata: Record<string, unknown> } | undefined;
  for (let page = 1; page <= 20 && !user; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    if (!data.users.length) break;
    user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  }
  if (!user) throw new Error(`no account with the email ${email}`);

  const { error } = await admin.auth.admin.updateUserById(user.id, {
    password,
    // A password set here is deliberate, so do not force a change on next sign-in.
    app_metadata: { ...user.app_metadata, must_change_password: false },
  });
  if (error) throw new Error(error.message);
  console.log(`password set for ${email} (${user.id}) - they can sign in with it now`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
