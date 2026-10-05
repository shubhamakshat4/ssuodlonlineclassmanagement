/**
 * Turn an existing account into a faculty account.
 *
 *   npm run accounts:make-teacher -- akshat.s@srisriuniversity.edu.in
 *   npm run accounts:make-teacher -- akshat.s@srisriuniversity.edu.in --apply
 *   npm run accounts:make-teacher -- <email> --apply --name "Test Faculty" --force
 *
 * Somebody who was mapped as a student - usually while testing - cannot also be a teacher: the portal
 * decides what you see from your single role. So the student record is removed and the role changed.
 *
 * Removing a student record also removes their attendance, so if there is any, the script refuses
 * unless --force is given. Nobody should lose an attendance history by accident.
 *
 * The address is checked against the Microsoft tenant first, and its object id stored, so the teacher
 * can be named co-organiser on their Teams meetings.
 */
import './_env';
import { createClient } from '@supabase/supabase-js';
import type { GraphEnv } from '../supabase/functions/_shared/graph/index.ts';

const env = process.env as GraphEnv & NodeJS.ProcessEnv;
const args = process.argv.slice(2);
const email = (args.find((a) => a.includes('@')) ?? '').trim().toLowerCase();
const APPLY = args.includes('--apply');
const FORCE = args.includes('--force');
const nameIndex = args.indexOf('--name');
const NEW_NAME = nameIndex === -1 ? null : args[nameIndex + 1];

async function graphUser(address: string): Promise<{ id: string; displayName: string } | null> {
  if (!env.MS_TENANT_ID || !env.MS_CLIENT_ID || !env.MS_CLIENT_SECRET) return null;
  const tokenRes = await fetch(`https://login.microsoftonline.com/${env.MS_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.MS_CLIENT_ID,
      client_secret: env.MS_CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  });
  const token = ((await tokenRes.json()) as { access_token?: string }).access_token;
  if (!token) return null;
  const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(address)}?$select=id,displayName,accountEnabled,assignedPlans`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const u = (await r.json()) as {
    id?: string;
    displayName?: string;
    accountEnabled?: boolean;
    assignedPlans?: { service?: string; capabilityStatus?: string }[];
  };
  if (!u.id) return null;
  const teams = (u.assignedPlans ?? []).some((p) => /teams/i.test(p.service ?? '') && p.capabilityStatus === 'Enabled');
  if (!u.accountEnabled) console.log('  warning: that Microsoft account is disabled');
  if (!teams) console.log('  warning: that Microsoft account has no enabled Teams plan, so co-organiser will not work');
  return { id: u.id, displayName: u.displayName ?? '' };
}

async function main() {
  if (!email) {
    console.error('usage: npm run accounts:make-teacher -- <email> [--apply] [--name "Full Name"] [--force]');
    process.exit(2);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local');
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: profileRow } = await admin.from('profiles').select('id, role, full_name, is_active').eq('email', email).maybeSingle();
  const profile = profileRow as { id: string; role: string; full_name: string; is_active: boolean } | null;
  if (!profile) throw new Error(`no portal account with the email ${email}`);
  console.log(`${email}: ${profile.full_name}, currently a ${profile.role}${profile.is_active ? '' : ' (deactivated)'}`);

  const { data: already } = await admin.from('teachers').select('employee_code').eq('id', profile.id).maybeSingle();
  if (already) {
    console.log(`  already a teacher (${(already as { employee_code: string }).employee_code}) - nothing to do`);
    return;
  }

  const { data: studentRow } = await admin.from('students').select('roll_number, batch_id').eq('id', profile.id).maybeSingle();
  const { count: attendance } = await admin.from('attendance').select('id', { count: 'exact', head: true }).eq('student_id', profile.id);
  if (studentRow) {
    const s = studentRow as { roll_number: string | null; batch_id: string };
    const { data: batch } = await admin.from('batches').select('code').eq('id', s.batch_id).maybeSingle();
    console.log(`  student record to remove: roll ${s.roll_number ?? '(none)'}, class group ${(batch as { code: string } | null)?.code ?? '?'}`);
    if (attendance) {
      console.log(`  ${attendance} attendance row(s) would be deleted with it`);
      if (!FORCE) {
        console.log('  refusing: pass --force if that attendance history really can be lost');
        return;
      }
    }
  } else {
    console.log('  no student record to remove');
  }

  const found = await graphUser(email);
  console.log(`  Microsoft account: ${found ? `${found.displayName} (${found.id})` : 'NOT FOUND in the tenant - co-organiser will not work'}`);

  const { data: codes } = await admin.from('teachers').select('employee_code').order('employee_code', { ascending: false }).limit(1);
  const highest = ((codes ?? []) as { employee_code: string }[])[0]?.employee_code ?? 'F000';
  const employeeCode = `F${String(Number(highest.replace(/\D/g, '')) + 1).padStart(3, '0')}`;
  const fullName = NEW_NAME ?? profile.full_name;
  console.log(`  would become teacher ${employeeCode}, "${fullName}"`);

  if (!APPLY) {
    console.log('\ndry run - pass --apply to make the change');
    return;
  }

  if (studentRow) {
    const { error } = await admin.from('students').delete().eq('id', profile.id);
    if (error) throw new Error(`could not remove the student record: ${error.message}`);
    console.log('  removed the student record');
  }

  const patch: Record<string, string> = { role: 'teacher' };
  if (NEW_NAME) patch.full_name = NEW_NAME;
  const { error: profileError } = await admin.from('profiles').update(patch).eq('id', profile.id);
  if (profileError) throw new Error(`could not change the role: ${profileError.message}`);

  const { error: teacherError } = await admin
    .from('teachers')
    .insert({ id: profile.id, employee_code: employeeCode, entra_upn: email, entra_user_id: found?.id ?? null, department: 'ODL' });
  if (teacherError) throw new Error(`could not create the teacher record: ${teacherError.message}`);

  // profiles.role is what the portal and the database policies read; app_metadata is kept in step so the
  // account looks like every other one the ODL office created.
  const { data: user } = await admin.auth.admin.getUserById(profile.id);
  await admin.auth.admin.updateUserById(profile.id, {
    app_metadata: { ...(user?.user?.app_metadata ?? {}), role: 'teacher', provisioned_by: 'admin' },
  });

  console.log(`\n${email} is now faculty ${employeeCode}. They sign in with the password they already had.`);
  console.log('They will see no classes until a subject is assigned to them on Admin -> Class groups,');
  console.log('or a class is created for them with Admin -> Sessions -> Add an extra class.');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
