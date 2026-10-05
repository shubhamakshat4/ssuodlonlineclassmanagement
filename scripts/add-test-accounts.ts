/**
 * Create the two test accounts the ODL office asked for.
 *
 *   npm run accounts:test             dry run
 *   npm run accounts:test -- --apply  create them
 *
 *   testuser02@srisriuniversity.edu.in  faculty, with its real Microsoft account as the co-organiser UPN
 *   testuser03@srisriuniversity.edu.in  student, in MA Hindu Studies Semester 1 (MHS-S1)
 *
 * Both get the standard first-login password and are asked to change it, exactly like a real account,
 * so testing goes through the same first-run flow everybody else sees. Re-running is safe: an account
 * that already exists is left alone.
 *
 * The student's details are deliberately marked as a test record rather than dressed up as a real
 * person, so nobody mistakes it for one of the 638 real students.
 */
import './_env';
import { createClient } from '@supabase/supabase-js';
import type { GraphEnv } from '../supabase/functions/_shared/graph/index.ts';
import { appConfig } from '../src/lib/env.ts';

const env = process.env as GraphEnv & NodeJS.ProcessEnv;
const APPLY = process.argv.includes('--apply');

const TEACHER = {
  email: 'testuser02@srisriuniversity.edu.in',
  fullName: 'Test Faculty (ODL testing)',
  department: 'ODL testing',
};
const STUDENT = {
  email: 'testuser03@srisriuniversity.edu.in',
  fullName: 'Test Student (ODL testing)',
  rollNumber: 'TEST-MHS-S1-01',
  groupCode: 'MHS-S1',
};

async function graphToken(): Promise<string | null> {
  if (!env.MS_TENANT_ID || !env.MS_CLIENT_ID || !env.MS_CLIENT_SECRET) return null;
  const r = await fetch(`https://login.microsoftonline.com/${env.MS_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.MS_CLIENT_ID,
      client_secret: env.MS_CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  });
  const j = (await r.json()) as { access_token?: string };
  return j.access_token ?? null;
}

async function graphUserId(t: string | null, address: string): Promise<string | null> {
  if (!t) return null;
  const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(address)}?$select=id`, {
    headers: { Authorization: `Bearer ${t}` },
  });
  const u = (await r.json()) as { id?: string };
  return u.id ?? null;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local');
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const password = appConfig.studentDefaultPassword;

  // The class group the test student joins.
  const { data: group } = await admin.from('batches').select('id, code, name').eq('code', STUDENT.groupCode).maybeSingle();
  if (!group) throw new Error(`no class group with the code ${STUDENT.groupCode}`);
  const batch = group as { id: string; code: string; name: string };

  // Next free employee code, so the test teacher does not collide with a real one.
  const { data: codes } = await admin.from('teachers').select('employee_code').order('employee_code', { ascending: false }).limit(1);
  const highest = ((codes ?? []) as { employee_code: string }[])[0]?.employee_code ?? 'F000';
  const employeeCode = `F${String(Number(highest.replace(/\D/g, '')) + 1).padStart(3, '0')}`;

  const t = await graphToken();
  const teacherGraphId = await graphUserId(t, TEACHER.email);
  const studentGraphId = await graphUserId(t, STUDENT.email);

  console.log('teacher  ', TEACHER.email, `-> ${employeeCode}, ${TEACHER.fullName}`);
  console.log('           Microsoft account:', teacherGraphId ? `found (${teacherGraphId})` : 'NOT FOUND in the tenant');
  console.log('student  ', STUDENT.email, `-> ${batch.code} ${batch.name}, roll ${STUDENT.rollNumber}`);
  console.log('           Microsoft account:', studentGraphId ? 'found' : 'not in the tenant (not needed for a student)');
  console.log('password ', password, '(both are asked to change it at first sign-in)');

  if (!APPLY) {
    console.log('\ndry run - pass --apply to create them');
    return;
  }

  for (const person of [
    { ...TEACHER, role: 'teacher' as const },
    { ...STUDENT, role: 'student' as const },
  ]) {
    const { data: existing } = await admin.from('profiles').select('id, role').eq('email', person.email).maybeSingle();
    if (existing) {
      console.log(`  exists  ${person.email} (${(existing as { role: string }).role}) - left alone`);
      continue;
    }

    const { data: created, error } = await admin.auth.admin.createUser({
      email: person.email,
      email_confirm: true,
      password,
      user_metadata: { full_name: person.fullName },
      app_metadata: { role: person.role, must_change_password: true, provisioned_by: 'admin' },
    });
    if (error || !created.user) {
      console.log(`  FAILED  ${person.email}: ${error?.message ?? 'no user returned'}`);
      continue;
    }
    const id = created.user.id;

    const { error: profileError } = await admin.from('profiles').insert({ id, role: person.role, full_name: person.fullName, email: person.email });
    if (profileError) {
      await admin.auth.admin.deleteUser(id);
      console.log(`  FAILED  ${person.email} (profile): ${profileError.message}`);
      continue;
    }

    const detail =
      person.role === 'teacher'
        ? await admin.from('teachers').insert({ id, employee_code: employeeCode, entra_upn: TEACHER.email, entra_user_id: teacherGraphId, department: TEACHER.department })
        : await admin.from('students').insert({ id, roll_number: STUDENT.rollNumber, batch_id: batch.id, college_email: STUDENT.email, status: 'active' });
    if (detail.error) {
      await admin.auth.admin.deleteUser(id);
      console.log(`  FAILED  ${person.email} (${person.role}): ${detail.error.message}`);
      continue;
    }
    console.log(`  created ${person.role.padEnd(7)} ${person.email}`);
  }

  console.log('\nBoth sign in at /login with the password above and are asked to choose their own.');
  console.log(`The test teacher has no classes yet: assign them a subject on Admin -> Class groups -> ${batch.code},`);
  console.log('or create a class for them with Admin -> Sessions -> Add an extra class.');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
