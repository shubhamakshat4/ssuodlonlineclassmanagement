/**
 * Apply the project's GoTrue settings through the Supabase Management API, so they are not something
 * somebody has to remember to click in the dashboard.
 *
 *   npm run auth:config            show the settings that matter and what they would become
 *   npm run auth:config -- --apply write them
 *
 * Needs SUPABASE_ACCESS_TOKEN (a personal access token) in .env.local.
 *
 * The one that matters most is the minimum password length. GoTrue enforces it on every password,
 * including one set through the Admin API, so it has to be at most the length of the first-login
 * password the ODL office hands to students.
 */
import './_env';
import { PASSWORD_MIN_LENGTH } from '../src/lib/auth/password.ts';
import { appConfig } from '../src/lib/env.ts';

const APPLY = process.argv.includes('--apply');

const DESIRED: Record<string, unknown> = {
  password_min_length: PASSWORD_MIN_LENGTH,
  password_required_characters: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789',
  // Students and staff are created by the ODL office; nobody signs themselves up. The
  // before_user_created hook enforces this too, and is what actually refuses the request.
  external_email_enabled: true,
  external_google_enabled: false,
  mailer_autoconfirm: true,
};

function projectRef(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const ref = /https:\/\/([a-z0-9]+)\.supabase\.co/i.exec(url)?.[1];
  if (!ref) throw new Error(`Could not read the project ref from NEXT_PUBLIC_SUPABASE_URL (${url || 'unset'})`);
  return ref;
}

async function main() {
  if (appConfig.studentDefaultPassword.length < PASSWORD_MIN_LENGTH) {
    throw new Error(
      `STUDENT_DEFAULT_PASSWORD is ${appConfig.studentDefaultPassword.length} characters but the policy needs ${PASSWORD_MIN_LENGTH}. ` +
        'Lower PASSWORD_MIN_LENGTH in src/lib/auth/password.ts and supabase/config.toml, or choose a longer password.',
    );
  }

  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error('SUPABASE_ACCESS_TOKEN is not set - create one at supabase.com/dashboard/account/tokens and add it to .env.local');
  const ref = projectRef();
  const url = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const current = await fetch(url, { headers });
  if (!current.ok) throw new Error(`GET auth config failed: ${current.status} ${await current.text()}`);
  const now = (await current.json()) as Record<string, unknown>;

  let changes = 0;
  for (const [key, want] of Object.entries(DESIRED)) {
    const have = now[key];
    if (JSON.stringify(have) === JSON.stringify(want)) {
      console.log(`  = ${key}: ${JSON.stringify(have)}`);
      continue;
    }
    changes += 1;
    console.log(`  ${APPLY ? '~' : '-'} ${key}: ${JSON.stringify(have)} -> ${JSON.stringify(want)}`);
  }
  if (!changes) {
    console.log('\nnothing to change');
    return;
  }
  if (!APPLY) {
    console.log('\ndry run - pass --apply to write these');
    return;
  }
  const res = await fetch(url, { method: 'PATCH', headers, body: JSON.stringify(DESIRED) });
  if (!res.ok) throw new Error(`PATCH auth config failed: ${res.status} ${await res.text()}`);
  console.log(`\napplied ${changes} setting(s) to project ${ref}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
