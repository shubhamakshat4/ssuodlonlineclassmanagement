'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validatePassword } from '@/lib/auth/password';
import { ROLE_HOME, type Role } from '@/lib/auth/routing';

export interface PasswordState {
  error?: string;
}

export async function changePassword(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');
  const policyError = validatePassword(password);
  if (policyError) return { error: policyError };
  if (password !== confirm) return { error: 'The two passwords do not match.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  // Clear the server-controlled flag. app_metadata can only be changed with the service role.
  if (user.app_metadata?.must_change_password === true) {
    const admin = createAdminClient();
    const { error: metaError } = await admin.auth.admin.updateUserById(user.id, {
      app_metadata: { ...user.app_metadata, must_change_password: false },
    });
    if (metaError) return { error: `Password changed, but the first-login flag could not be cleared: ${metaError.message}` };
    await supabase.rpc('log_audit', { p_action: 'auth.password_changed', p_entity: 'profiles', p_entity_id: user.id, p_payload: {} });
    // Refresh the session so the new app_metadata is in the JWT.
    await supabase.auth.refreshSession();
  }

  // Somebody who has never set security questions cannot reset their own password later, so ask now.
  const { count } = await createAdminClient().from('security_answers').select('user_id', { count: 'exact', head: true }).eq('user_id', user.id);
  if (!count) redirect('/account/security-questions');

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  redirect(profile ? ROLE_HOME[profile.role as Role] : '/');
}
