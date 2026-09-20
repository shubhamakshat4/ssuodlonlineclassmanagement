'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ROLE_HOME, safeNextPath, type Role } from '@/lib/auth/routing';

export interface LoginState {
  error?: string;
}

/** Teacher / admin email + password sign-in. Students never reach this (Google only). */
export async function signInWithPassword(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const password = String(formData.get('password') ?? '');
  const next = safeNextPath(String(formData.get('next') ?? ''), '');

  if (!email || !password) return { error: 'Enter your email and password.' };

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
  if (profile.role === 'student') {
    // Students are Google-only. A student with a password should not exist; refuse anyway.
    await supabase.auth.signOut();
    return { error: 'Students sign in with their university Google account.' };
  }

  if (data.user.app_metadata?.must_change_password === true) redirect('/account/password');
  redirect(next || ROLE_HOME[profile.role as Role]);
}
