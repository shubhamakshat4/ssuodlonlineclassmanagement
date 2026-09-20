/**
 * E2E helpers. Require a running Supabase (local `supabase start` with the seed, or a test project)
 * and these env vars: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
 *
 * Students sign in with Google in production, which cannot be automated. For E2E we mint a magic link
 * with the Admin API and open it — the session that results is identical to a Google one for the app.
 */
import 'dotenv/config';
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import type { Page } from '@playwright/test';

export const SEED = {
  studentEmail: 'aarav.sharma.odl25@srisriuniversity.edu.in',
  studentId: 'c0000000-0000-4000-8000-000000000001',
  teacherEmail: 'anand.mishra@srisriuniversity.edu.in',
  teacherPassword: 'TeacherPass12345',
  teacherId: 'b0000000-0000-4000-8000-000000000001',
  adminEmail: 'odl.admin@srisriuniversity.edu.in',
  adminPassword: 'AdminPass12345',
  liveSessionId: '30000000-0000-4000-8000-000000000005',
};

export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || key.startsWith('REPLACE')) throw new Error('E2E needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Sign a seeded student in through a magic link (stand-in for Google SSO). */
export async function signInStudent(page: Page, email = SEED.studentEmail, baseURL = 'http://localhost:3000') {
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo: `${baseURL}/auth/callback?next=/student` } });
  if (error || !data.properties?.hashed_token) throw new Error(`generateLink failed: ${error?.message}`);
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

/** Reset the seeded live session to its pristine state (no override) and clear the student's attendance on it. */
export async function resetLiveSession() {
  const admin = adminClient();
  await admin.from('attendance').delete().eq('class_session_id', SEED.liveSessionId).eq('student_id', SEED.studentId);
  await admin
    .from('class_sessions')
    .update({
      join_url_override: null,
      provider: 'teams',
      teams_join_url: 'https://teams.microsoft.com/l/meetup-join/seed-0005',
      sync_status: 'provisioned',
      scheduled_start: new Date(Date.now() - 5 * 60_000).toISOString(),
      scheduled_end: new Date(Date.now() + 55 * 60_000).toISOString(),
      status: 'scheduled',
    })
    .eq('id', SEED.liveSessionId);
}
