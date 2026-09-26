/**
 * E2E helpers. Require a running app plus NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
 * and SUPABASE_SERVICE_ROLE_KEY in the environment.
 *
 * The suite is data-agnostic: instead of hard-coded seed accounts it resolves a real student and
 * teacher from whatever data is loaded, so it runs against the demo seed and the live ODL data alike.
 *
 * It never moves a real class. The join journeys need a session that is live *now*, so the fixture
 * INSERTS a throwaway ad-hoc session for the chosen group and deletes it afterwards (attendance
 * cascades). Rewriting a real session's times was the earlier approach and it was unsafe: when a run
 * failed before the restore, the next run captured the displaced time as the "original", so the
 * class could never find its way back to its timetable slot.
 *
 * Students sign in with Google in production, which cannot be automated. For E2E we mint a magic
 * link with the Admin API and open it — the resulting session is identical for the app.
 */
import 'dotenv/config';
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import type { Page } from '@playwright/test';

/** Credentials come from .env.local: this repository is public, so no portal password lives in it. */
function required(name: string, what: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set - add it to .env.local (${what})`);
  return v;
}

export const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? 'odl.admin@srisriuniversity.edu.in',
  password: required('E2E_ADMIN_PASSWORD', 'the admin portal password'),
};
/** Password we set on the picked faculty account so the teacher journey can sign in. */
export const TEACHER_TEST_PASSWORD = required('E2E_TEACHER_PASSWORD', 'any password the suite may set on a test faculty account');
/** Topic stamped on sessions the suite creates, so a stray one is recognisable and sweepable. */
export const E2E_TOPIC = 'E2E test class (safe to delete)';

export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || key.startsWith('REPLACE')) throw new Error('E2E needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export interface Fixture {
  studentEmail: string;
  studentId: string;
  /** class group of that student */
  groupId: string;
  groupCode: string;
  /** a student in a different group */
  otherStudentEmail: string;
  teacherEmail: string;
  teacherId: string;
  /** throwaway session created by the fixture; the only session row the suite may modify */
  sessionId: string;
  /** a real, future class of the same group — read only, never moved */
  laterSessionId: string;
}

/** Pick a student and their teacher from the live data, then create a throwaway class for the run. */
export async function loadFixture(): Promise<Fixture> {
  const admin = adminClient();
  await disposeFixture(); // sweep up anything a crashed run left behind
  const { data: sessions, error } = await admin
    .from('v_class_sessions')
    .select('id, batch_id, batch_code, batch_subject_id, teacher_id, scheduled_start, teams_join_url, effective_join_url')
    .eq('status', 'scheduled')
    // comfortably in the future, so the "join opens later" assertion is not raced by a live class
    .gt('scheduled_start', new Date(Date.now() + 30 * 60_000).toISOString())
    .order('scheduled_start')
    .limit(400);
  if (error) throw new Error(error.message);
  if (!sessions?.length) throw new Error('no upcoming sessions in the database — load data first');

  for (const s of sessions) {
    if (!s.effective_join_url) continue; // the join journey needs a joinable class
    const { data: students } = await admin
      .from('students')
      .select('id, profiles!inner(email)')
      .eq('batch_id', s.batch_id)
      .eq('status', 'active')
      .limit(5);
    const student = (students as unknown as { id: string; profiles: { email: string } }[] | null)?.[0];
    if (!student) continue;
    const { data: other } = await admin
      .from('students')
      .select('id, profiles!inner(email)')
      .neq('batch_id', s.batch_id)
      .eq('status', 'active')
      .limit(1);
    const otherStudent = (other as unknown as { id: string; profiles: { email: string } }[] | null)?.[0];
    const { data: teacher } = await admin.from('profiles').select('id, email').eq('id', s.teacher_id).single();
    if (!teacher || !otherStudent) continue;

    // make sure the teacher can sign in with a password for the teacher journey
    await admin.auth.admin.updateUserById(teacher.id, {
      password: TEACHER_TEST_PASSWORD,
      app_metadata: { role: 'teacher', provisioned_by: 'admin', must_change_password: false },
    });

    const { data: created, error: insertError } = await admin
      .from('class_sessions')
      .insert({
        batch_subject_id: s.batch_subject_id,
        teacher_id: s.teacher_id,
        timetable_slot_id: null,
        scheduled_start: new Date(Date.now() - 60_000).toISOString(),
        scheduled_end: new Date(Date.now() + 3_600_000).toISOString(),
        status: 'scheduled',
        topic: E2E_TOPIC,
        provider: 'teams',
        teams_join_url: s.teams_join_url ?? s.effective_join_url,
        sync_status: 'provisioned',
      })
      .select('id')
      .single();
    if (insertError) throw new Error(`could not create the throwaway session: ${insertError.message}`);

    await clearSignInThrottle(teacher.email, student.profiles.email, ADMIN.email);

    return {
      studentEmail: student.profiles.email,
      studentId: student.id,
      groupId: s.batch_id,
      groupCode: s.batch_code,
      otherStudentEmail: otherStudent.profiles.email,
      teacherEmail: teacher.email,
      teacherId: teacher.id,
      sessionId: (created as { id: string }).id,
      laterSessionId: s.id,
    };
  }
  throw new Error('could not find a joinable upcoming class with an active student');
}

/**
 * Clear the sign-in throttle for the accounts this suite drives.
 *
 * A full run signs the same teacher in four times, so two runs inside the limiter's 15-minute window
 * exhaust the 8-attempt budget and every later spec fails with "Too many sign-in attempts". That is
 * the limiter working correctly; the suite simply has to reset the counters it consumes itself, the
 * same way it deletes its own throwaway sessions. Production behaviour is untouched.
 */
export async function clearSignInThrottle(...emails: string[]) {
  const admin = adminClient();
  const keys = emails.filter(Boolean).flatMap((e) => [`login:email:${e.toLowerCase()}`, `reset:email:${e.toLowerCase()}`]);
  if (keys.length) await admin.from('rate_limits').delete().in('key', keys);
  // The per-IP budget is shared by every account the run touches, so clear this machine's too.
  await admin.from('rate_limits').delete().like('key', 'login:ip:%');
}

/** Delete the throwaway session (attendance cascades) plus any left by an earlier run. */
export async function disposeFixture(f?: Pick<Fixture, 'sessionId'>) {
  const admin = adminClient();
  if (f?.sessionId) await admin.from('class_sessions').delete().eq('id', f.sessionId);
  await admin.from('class_sessions').delete().eq('topic', E2E_TOPIC);
}

/** Put the throwaway session's join window back over "now". Only ever called on a fixture session. */
export async function makeLive(sessionId: string) {
  const admin = adminClient();
  await admin
    .from('class_sessions')
    .update({
      scheduled_start: new Date(Date.now() - 60_000).toISOString(),
      scheduled_end: new Date(Date.now() + 3_600_000).toISOString(),
      status: 'scheduled',
    })
    .eq('id', sessionId)
    .eq('topic', E2E_TOPIC); // guard: a real class can never be moved by the suite
}

/** Remove any override a test left behind, and the attendance it wrote. */
export async function clearOverride(sessionId: string, studentId?: string) {
  const admin = adminClient();
  if (studentId) await admin.from('attendance').delete().eq('class_session_id', sessionId).eq('student_id', studentId);
  await admin.from('class_sessions').update({ join_url_override: null }).eq('id', sessionId).eq('topic', E2E_TOPIC);
}

export async function signInStudent(page: Page, email: string, baseURL = 'http://localhost:3000') {
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo: `${baseURL}/auth/callback?next=/student` } });
  if (error || !data.properties?.hashed_token) throw new Error(`generateLink failed for ${email}: ${error?.message}`);
  await page.goto(`${baseURL}/auth/callback?token_hash=${data.properties.hashed_token}&type=magiclink&next=/student`);
  await page.waitForURL(/\/student/);
}

export async function signInWithPassword(page: Page, email: string, password: string, baseURL = 'http://localhost:3000') {
  await page.goto(`${baseURL}/login`);
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button[type=submit]');
  // Report a rejected password straight away instead of timing out on the navigation.
  const landed = page.waitForURL((u) => !u.pathname.startsWith('/login')).then(() => 'ok' as const);
  const error = page.getByTestId('login-error');
  const refused = error
    .waitFor({ state: 'visible', timeout: 15_000 })
    .then(() => 'refused' as const)
    .catch(() => 'ok' as const);
  if ((await Promise.race([landed, refused])) === 'refused') {
    const detail = (await error.textContent())?.trim();
    throw new Error(`sign-in refused for ${email}: ${detail ?? 'no message'} - check E2E_ADMIN_PASSWORD / E2E_TEACHER_PASSWORD in .env.local, and npm run auth:set-password to make the account match`);
  }
  await landed;
}
