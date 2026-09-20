import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { appConfig } from '@/lib/env';
import type { UserRole } from '@/lib/db/types';
import { ActionError } from '@/lib/actions';

export interface ProvisionInput {
  email: string;
  fullName: string;
  phone?: string | null;
  role: UserRole;
}

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
}

/**
 * Create the auth user + profile for a new person (SPEC §6).
 *   student: auth user with confirmed email and no password — Google links to it on first sign-in.
 *   teacher/admin: invite email (magic link) + `must_change_password` so the first login sets a password.
 * Returns the new user id. Rolls back the auth user if the profile insert fails.
 */
export async function provisionUser(input: ProvisionInput): Promise<string> {
  const email = input.email.trim().toLowerCase();
  if (input.role === 'student') {
    const domain = email.split('@')[1] ?? '';
    if (domain !== appConfig.allowedStudentDomain.toLowerCase()) {
      throw new ActionError(`Student email must be @${appConfig.allowedStudentDomain}.`, { email: 'Wrong domain' });
    }
  }

  const admin = createAdminClient();
  let userId: string;

  if (input.role === 'student') {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: input.fullName },
      app_metadata: { role: 'student', provisioned_by: 'admin' },
    });
    if (error || !data.user) throw new ActionError(userCreateError(error?.message, email));
    userId = data.user.id;
  } else {
    // Created with a random password the person never sees; the "set your password" email that
    // follows is the invite. app_metadata is stamped at creation so the DB guard admits the row.
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      password: randomPassword(),
      user_metadata: { full_name: input.fullName },
      app_metadata: { role: input.role, must_change_password: true, provisioned_by: 'admin' },
    });
    if (error || !data.user) throw new ActionError(userCreateError(error?.message, email));
    userId = data.user.id;
    const { error: mailError } = await admin.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent('/account/password')}`,
    });
    if (mailError) console.error('invite email failed', mailError.message);
  }

  const { error: profileError } = await admin
    .from('profiles')
    .insert({ id: userId, role: input.role, full_name: input.fullName, email, phone: input.phone ?? null });
  if (profileError) {
    await admin.auth.admin.deleteUser(userId);
    throw new ActionError(`Could not create profile: ${profileError.message}`);
  }
  return userId;
}

/** Re-send the invite/magic link for a staff account (or a recovery link if already accepted). */
export async function resendInvite(userId: string, email: string) {
  const admin = createAdminClient();
  const { error } = await admin.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent('/account/password')}`,
  });
  if (error) throw new ActionError(error.message);
  await admin.auth.admin.updateUserById(userId, { app_metadata: { must_change_password: true } });
}

/** Delete the auth user (cascades to profiles/students/teachers). */
export async function deleteUser(userId: string) {
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new ActionError(error.message);
}

/** Change the login email in auth as well as the profile. */
export async function updateUserEmail(userId: string, email: string) {
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { email: email.toLowerCase(), email_confirm: true });
  if (error) throw new ActionError(error.message);
}

function randomPassword() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('') + 'Aa1';
}

function userCreateError(message: string | undefined, email: string) {
  if (!message) return 'Could not create the account.';
  if (/already|exists|registered/i.test(message)) {
    return `An auth account already exists for ${email} but has no portal profile. Remove it in the Supabase dashboard (Authentication → Users) or use a different email.`;
  }
  if (/Missing required environment variable/.test(message)) return message;
  return message;
}
