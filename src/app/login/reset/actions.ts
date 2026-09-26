'use server';

import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { clientIp, LIMITS, rateLimit } from '@/lib/rate-limit';
import { validatePassword } from '@/lib/auth/password';

/**
 * Password reset by security question, so nothing depends on email delivery: Supabase's built-in
 * mailer is rate limited to a couple of messages an hour, which is useless for a 600-student cohort,
 * and many students have no university mailbox yet.
 *
 * Answers are compared inside the database (check_security_answer), so no hash ever reaches this
 * process, let alone the browser. Both steps are rate limited per IP and per email, and the questions
 * are only revealed to someone who types the exact address of an account that has set them up.
 */

export interface ResetState {
  stage: 'email' | 'answer' | 'done';
  email?: string;
  questions?: { id: number; prompt: string }[];
  error?: string;
}

const GENERIC = 'We could not verify that. Check the address and your answers, or contact the ODL department.';

async function withinLimits(email: string): Promise<boolean> {
  const ip = clientIp(await headers());
  const [ipOk, emailOk] = await Promise.all([
    rateLimit(`reset:ip:${ip}`, LIMITS.resetIp.limit, LIMITS.resetIp.windowSeconds),
    rateLimit(`reset:email:${email}`, LIMITS.resetEmail.limit, LIMITS.resetEmail.windowSeconds),
  ]);
  return ipOk && emailOk;
}

/** Step 1: find the questions this person chose. */
export async function findQuestions(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  if (!email) return { stage: 'email', error: 'Enter your email address.' };
  if (!(await withinLimits(email))) return { stage: 'email', error: 'Too many attempts. Please wait 15 minutes and try again.' };

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('id, is_active').eq('email', email).maybeSingle();
  if (!profile || !profile.is_active) return { stage: 'email', error: GENERIC };

  const { data: answers } = await admin.from('security_answers').select('question_id').eq('user_id', profile.id);
  const ids = (answers ?? []).map((a) => (a as { question_id: number }).question_id);
  if (ids.length === 0) {
    return {
      stage: 'email',
      error: 'This account has no security questions set up yet, so it cannot be reset here. Contact the ODL department and they will set a new password for you.',
    };
  }
  const { data: questions } = await admin.from('security_questions').select('id, prompt').in('id', ids).order('id');
  return { stage: 'answer', email, questions: (questions ?? []) as { id: number; prompt: string }[] };
}

/** Step 2: check every answer, then set the new password. */
export async function resetPassword(prev: ResetState, formData: FormData): Promise<ResetState> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');
  const again = { stage: 'answer' as const, email, questions: prev.questions };

  if (!email) return { stage: 'email', error: 'Start again and enter your email address.' };
  if (!(await withinLimits(email))) return { ...again, error: 'Too many attempts. Please wait 15 minutes and try again.' };
  const policyError = validatePassword(password);
  if (policyError) return { ...again, error: policyError };
  if (password !== confirm) return { ...again, error: 'The two passwords do not match.' };

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('id, is_active').eq('email', email).maybeSingle();
  if (!profile || !profile.is_active) return { ...again, error: GENERIC };

  const { data: rows } = await admin.from('security_answers').select('question_id').eq('user_id', profile.id);
  const ids = (rows ?? []).map((r) => (r as { question_id: number }).question_id);
  if (ids.length === 0) return { ...again, error: GENERIC };

  // Every question must be answered correctly.
  for (const id of ids) {
    const answer = String(formData.get(`answer_${id}`) ?? '').trim();
    if (!answer) return { ...again, error: 'Answer every question.' };
    const { data: ok, error } = await admin.rpc('check_security_answer', { p_user: profile.id, p_question: id, p_answer: answer });
    if (error) return { ...again, error: 'Could not check your answers. Please try again.' };
    if (ok !== true) return { ...again, error: GENERIC };
  }

  const { data: user } = await admin.auth.admin.getUserById(profile.id);
  const { error: setError } = await admin.auth.admin.updateUserById(profile.id, {
    password,
    app_metadata: { ...(user?.user?.app_metadata ?? {}), must_change_password: false },
  });
  if (setError) return { ...again, error: setError.message };
  await admin.rpc('log_audit', { p_action: 'auth.password_reset_by_questions', p_entity: 'profiles', p_entity_id: profile.id, p_payload: {} });
  return { stage: 'done', email };
}
