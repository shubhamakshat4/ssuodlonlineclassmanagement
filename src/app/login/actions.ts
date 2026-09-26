'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { clientIp, LIMITS, rateLimit } from '@/lib/rate-limit';
import { createClient } from '@/lib/supabase/server';
import { ROLE_HOME, safeNextPath, type Role } from '@/lib/auth/routing';
import { resolveLoginEmail } from '@/lib/auth/resolve-login';

export interface LoginState {
  error?: string;
}

/** Email + password sign-in for every role. */
export async function signInWithPassword(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const typed = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const password = String(formData.get('password') ?? '');
  const next = safeNextPath(String(formData.get('next') ?? ''), '');

  if (!typed || !password) return { error: 'Enter your email and password.' };

  // Students may type their college address or their personal one; both lead to the same account.
  const resolved = await resolveLoginEmail(typed);
  if (resolved.ambiguous) {
    return { error: 'That address is on more than one student record. Please sign in with your college email, or contact the ODL department.' };
  }
  const email = resolved.email;

  const ip = clientIp(await headers());
  const [ipOk, emailOk] = await Promise.all([
    rateLimit(`login:ip:${ip}`, LIMITS.loginIp.limit, LIMITS.loginIp.windowSeconds),
    rateLimit(`login:email:${email}`, LIMITS.loginEmail.limit, LIMITS.loginEmail.windowSeconds),
  ]);
  if (!ipOk || !emailOk) return { error: 'Too many sign-in attempts. Please wait 15 minutes and try again.' };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return { error: 'Incorrect email or password.' };
  }

  const { data: profile } = await supabase.from('profiles').select('role, is_active').eq('id', data.user.id).maybeSingle();
  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    return { error: 'This account is not active. Contact the ODL office.' };
  }
  if (data.user.app_metadata?.must_change_password === true) redirect('/account/password');
  redirect(next || ROLE_HOME[profile.role as Role]);
}
