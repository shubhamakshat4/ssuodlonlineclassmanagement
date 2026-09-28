/**
 * Put a faculty member's real Microsoft 365 address on their portal record.
 *
 *   npm run faculty:microsoft -- --pending             who still has no Microsoft address
 *   npm run faculty:microsoft                          dry run
 *   npm run faculty:microsoft -- --apply               update the records
 *   npm run faculty:microsoft -- --apply --recreate    ...and rebuild their upcoming Teams meetings
 *
 * The address becomes two things: the teacher's sign-in email, and the entra_upn the provisioner names
 * as co-organiser on the Teams meeting. Each one is checked against the tenant first - an address the
 * tenant does not know, or one without a Teams plan, is reported and skipped rather than written.
 *
 * --recreate matters because of how the provisioner works: a session that already has a meeting is only
 * ever *patched*, and a patch changes the times, not the participants. To get a co-organiser onto a
 * meeting that already exists, the meeting has to be rebuilt, which gives it a new join link. Students
 * read the link from the portal, so that is safe - but a link somebody copied out by hand will die.
 */
import './_env';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { GraphEnv } from '../supabase/functions/_shared/graph/index.ts';

const env = process.env as GraphEnv & NodeJS.ProcessEnv;
const APPLY = process.argv.includes('--apply');
const RECREATE = process.argv.includes('--recreate');
const PENDING = process.argv.includes('--pending');

/** A UPN we invented at import time, rather than one IT gave us. */
const PLACEHOLDER = /@srisriuniversity\.onmicrosoft\.com$/i;

/** employee_code -> the address IT confirmed. Add to this list as more arrive. */
const MAPPING: { code: string; name: string; address: string }[] = [
  { code: 'F017', name: 'Mr. Rushikesh Dattatray Joshi', address: 'rushikesh.j@srisriuniversity.edu.in' },
  { code: 'F018', name: 'Mr. Sankar Maharana', address: 'sankar.m@srisriuniversity.edu.in' },
  { code: 'F016', name: 'Mr. Harshvardhan Pandey', address: 'harshvardhan.p@srisriuniversity.edu.in' },
  // Awaiting a university account - these three were given as personal gmail addresses, which the
  // tenant does not know and which therefore cannot be named as co-organiser:
  // F020 Ms. Sasmita Panda, F015 Guru Ashis Kumar Das, F021 Ms. Shivangi Mitra
];

async function token(): Promise<string> {
  const r = await fetch(`https://login.microsoftonline.com/${env.MS_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.MS_CLIENT_ID!,
      client_secret: env.MS_CLIENT_SECRET!,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  });
  const j = (await r.json()) as { access_token?: string; error_description?: string };
  if (!j.access_token) throw new Error(`could not get a Graph token: ${j.error_description ?? 'unknown error'}`);
  return j.access_token;
}

async function resolve(t: string, address: string) {
  const r = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(address)}?$select=id,displayName,userPrincipalName,accountEnabled,userType,assignedPlans`,
    { headers: { Authorization: `Bearer ${t}` } },
  );
  const u = (await r.json()) as {
    id?: string;
    displayName?: string;
    accountEnabled?: boolean;
    userType?: string;
    assignedPlans?: { service?: string; capabilityStatus?: string }[];
  };
  if (!u.id) return { ok: false as const, why: 'the tenant has no account with that address' };
  if (u.userType === 'Guest') return { ok: false as const, why: 'that is a guest account; a co-organiser must belong to the tenant' };
  if (!u.accountEnabled) return { ok: false as const, why: 'the account is disabled' };
  if (!(u.assignedPlans ?? []).some((p) => /teams/i.test(p.service ?? '') && p.capabilityStatus === 'Enabled')) {
    return { ok: false as const, why: 'the account has no enabled Teams plan' };
  }
  return { ok: true as const, id: u.id, displayName: u.displayName ?? '' };
}

interface PendingRow {
  id: string;
  employee_code: string;
  entra_upn: string;
  profiles: { full_name: string; email: string };
}

/** Who still has an invented UPN, worst first, so IT can see what each one is holding up. */
async function listPending(admin: SupabaseClient) {
  const { data } = await admin.from('teachers').select('id, employee_code, entra_upn, profiles!inner(full_name, email)').order('employee_code');
  const teachers = ((data ?? []) as unknown as PendingRow[]).filter((t) => PLACEHOLDER.test(t.entra_upn));
  const rows: { code: string; name: string; upcoming: number; groups: string }[] = [];
  for (const t of teachers) {
    const { data: sessions } = await admin
      .from('v_class_sessions')
      .select('batch_code')
      .eq('teacher_id', t.id)
      .eq('status', 'scheduled')
      .gt('scheduled_start', new Date().toISOString());
    const list = (sessions ?? []) as { batch_code: string }[];
    rows.push({
      code: t.employee_code,
      name: t.profiles.full_name,
      upcoming: list.length,
      groups: [...new Set(list.map((s) => s.batch_code))].sort().join(', ') || '-',
    });
  }
  rows.sort((a, b) => b.upcoming - a.upcoming || a.code.localeCompare(b.code));
  const total = rows.reduce((n, r) => n + r.upcoming, 0);
  console.log(`${rows.length} faculty still have no Microsoft 365 address, covering ${total} upcoming classes.\n`);
  console.log('code | upcoming | name | class groups');
  for (const r of rows) console.log(`${r.code} | ${String(r.upcoming).padStart(3)} | ${r.name} | ${r.groups}`);
  console.log('\nAsk IT for a licensed account in the srisriuniversity.edu.in tenant for each, then add');
  console.log('them to MAPPING in this script and run:  npm run faculty:microsoft -- --apply --recreate');
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local');
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  if (PENDING) return listPending(admin);
  const t = await token();

  let updated = 0;
  let requeued = 0;
  for (const m of MAPPING) {
    const { data } = await admin.from('teachers').select('id, entra_upn, profiles!inner(full_name, email)').eq('employee_code', m.code).maybeSingle();
    const teacher = data as unknown as { id: string; entra_upn: string; profiles: { full_name: string; email: string } } | null;
    if (!teacher) {
      console.log(`  SKIP  ${m.code} ${m.name}: no teacher with that employee code`);
      continue;
    }

    const found = await resolve(t, m.address);
    if (!found.ok) {
      console.log(`  SKIP  ${m.code} ${teacher.profiles.full_name} -> ${m.address}`);
      console.log(`        ${found.why}`);
      continue;
    }

    const { count } = await admin
      .from('class_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('teacher_id', teacher.id)
      .eq('status', 'scheduled')
      .gt('scheduled_start', new Date().toISOString());

    if (!APPLY) {
      console.log(`  ${m.code} ${teacher.profiles.full_name}`);
      console.log(`     login    ${teacher.profiles.email} -> ${m.address}`);
      console.log(`     upn      ${teacher.entra_upn} -> ${m.address} (${found.displayName})`);
      console.log(`     meetings ${count ?? 0} upcoming${RECREATE ? ' would be rebuilt with a new link' : ' left alone; pass --recreate to rebuild them'}`);
      continue;
    }

    // auth first: if the address is taken, the profile must not drift away from it
    const { error: authError } = await admin.auth.admin.updateUserById(teacher.id, { email: m.address, email_confirm: true });
    if (authError) {
      console.log(`  FAILED ${m.code}: ${authError.message}`);
      continue;
    }
    const { error: profileError } = await admin.from('profiles').update({ email: m.address }).eq('id', teacher.id);
    if (profileError) {
      console.log(`  FAILED ${m.code} (profile): ${profileError.message}`);
      continue;
    }
    const { error: teacherError } = await admin.from('teachers').update({ entra_upn: m.address, entra_user_id: found.id }).eq('id', teacher.id);
    if (teacherError) {
      console.log(`  FAILED ${m.code} (teacher): ${teacherError.message}`);
      continue;
    }
    updated += 1;
    console.log(`  updated ${m.code} ${teacher.profiles.full_name} -> ${m.address}`);

    if (RECREATE) {
      // Keep graph_event_id and clear the join url: the provisioner then plans a "recreate", which
      // deletes the old meeting before making a new one, so nothing is orphaned in the calendar.
      const { error, count: n } = await admin
        .from('class_sessions')
        .update({ teams_join_url: null, sync_status: 'pending', sync_attempts: 0, sync_error: null }, { count: 'exact' })
        .eq('teacher_id', teacher.id)
        .eq('status', 'scheduled')
        .eq('provider', 'teams')
        .gt('scheduled_start', new Date().toISOString());
      if (error) console.log(`     could not re-queue meetings: ${error.message}`);
      else {
        requeued += n ?? 0;
        console.log(`     re-queued ${n ?? 0} meeting(s); the provisioner rebuilds them within a few minutes`);
      }
    }
  }

  if (!APPLY) {
    console.log('\ndry run - pass --apply to write, and --recreate to rebuild their meetings too');
    return;
  }
  console.log(`\nupdated ${updated} teacher(s)${RECREATE ? `, re-queued ${requeued} meeting(s)` : ''}`);
  if (updated) console.log('They now sign in with their university address, using the password they already had.');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
