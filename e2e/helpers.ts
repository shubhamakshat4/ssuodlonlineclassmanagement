/**
 * E2E helpers. Require a running app plus NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
 * and SUPABASE_SERVICE_ROLE_KEY in the environment.
 *
 * The suite is data-agnostic: instead of hard-coded seed accounts it resolves a real student,
 * teacher and session from whatever data is loaded, so it runs against the demo seed and against
 * the live ODL data alike.
 *
 * Students sign in with Google in production, which cannot be automated. For E2E we mint a magic
 * link with the Admin API and open it — the resulting session is identical for the app.
 */
import 'dotenv/config';
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import type { Page } from '@playwright/test';

export const ADMIN = { email: 'odl.admin@srisriuniversity.edu.in', password: 'AdminPass12345' };
/** Password we set on the picked faculty account so the teacher journey can sign in. */
export const TEACHER_TEST_PASSWORD = 'FacultyTest12345';

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
  /** upcoming session of the student's group, moved to "live" by makeLive() */
  sessionId: string;
  originalStart: string;
  originalEnd: string;
  /** the Teams link the session had when the fixture was taken, restored after each spec */
  originalJoinUrl: string | null;
  /** another upcoming session of the same group, left in the future */
  laterSessionId: string;
}

/** Pick a student, their teacher and two upcoming sessions from the live data. */
export async function loadFixture(): Promise<Fixture> {
  const admin = adminClient();
  const { data: sessions, error } = await admin
    .from('v_class_sessions')
    .select('id, batch_id, batch_code, teacher_id, scheduled_start, scheduled_end, teams_join_url, effective_join_url')
    .eq('status', 'scheduled')
    .gt('scheduled_end', new Date().toISOString())
    .order('scheduled_start')
    .limit(400);
  if (error) throw new Error(error.message);
  if (!sessions?.length) throw new Error('no upcoming sessions in the database — load data first');

  // a group that has at least two upcoming sessions and at least one student with a real login
  for (const s of sessions) {
    if (!s.effective_join_url) continue; // need a joinable class for the join journey
    const inGroup = sessions.filter((x) => x.batch_id === s.batch_id);
    if (inGroup.length < 2) continue;
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

    return {
      studentEmail: student.profiles.email,
      studentId: student.id,
      groupId: s.batch_id,
      groupCode: s.batch_code,
      otherStudentEmail: otherStudent.profiles.email,
      teacherEmail: teacher.email,
      teacherId: teacher.id,
      sessionId: s.id,
      originalStart: s.scheduled_start,
      originalEnd: s.scheduled_end,
      originalJoinUrl: s.teams_join_url,
      laterSessionId: inGroup[1].id,
    };
  }
  throw new Error('could not find a class group with two sessions and an active student');
}

/** Move a session so its join window is open right now, with a working link. */
export async function makeLive(sessionId: string, joinUrl?: string | null) {
  const admin = adminClient();
  await admin
    .from('class_sessions')
    .update({
      scheduled_start: new Date(Date.now() - 60_000).toISOString(),
      scheduled_end: new Date(Date.now() + 3600_000).toISOString(),
      status: 'scheduled',
      ...(joinUrl ? { teams_join_url: joinUrl, provider: 'teams', sync_status: 'provisioned' } : {}),
    })
    .eq('id', sessionId);
}

/** Put a session back where it was, restore its link, and clear any attendance the test created. */
export async function restoreSession(sessionId: string, start: string, end: string, studentId?: string, joinUrl?: string | null) {
  const admin = adminClient();
  if (studentId) await admin.from('attendance').delete().eq('class_session_id', sessionId).eq('student_id', studentId);
  await admin
    .from('class_sessions')
    .update({
      scheduled_start: start,
      scheduled_end: end,
      status: 'scheduled',
      ...(joinUrl ? { teams_join_url: joinUrl, provider: 'teams', sync_status: 'provisioned', join_url_override: null } : {}),
    })
    .eq('id', sessionId);
}

/** Remove any override a test left behind. */
export async function clearOverride(sessionId: string) {
  const admin = adminClient();
  await admin.from('class_sessions').update({ join_url_override: null }).eq('id', sessionId);
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
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
