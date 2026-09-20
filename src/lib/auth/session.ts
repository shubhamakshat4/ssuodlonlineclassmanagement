import 'server-only';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ROLE_HOME, type Role } from '@/lib/auth/routing';

export interface CurrentUser {
  id: string;
  email: string;
  role: Role;
  fullName: string;
  mustChangePassword: boolean;
  provider: string | null;
}

/** Returns the signed-in user with their profile, or null. Validates the JWT server-side. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles').select('role, full_name, is_active, email').eq('id', user.id).maybeSingle();
  if (!profile || !profile.is_active) return null;
  return {
    id: user.id,
    email: profile.email ?? user.email ?? '',
    role: profile.role as Role,
    fullName: profile.full_name,
    mustChangePassword: user.app_metadata?.must_change_password === true,
    provider: (user.app_metadata?.provider as string | undefined) ?? null,
  };
}

/** Server Component guard: redirects to login when signed out. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

/** Server Component guard: redirects to the caller's own home when the role does not match. */
export async function requireRole(...roles: Role[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect(ROLE_HOME[user.role]);
  return user;
}
