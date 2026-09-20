import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ROLE_HOME, safeNextPath, type Role } from '@/lib/auth/routing';

/**
 * OAuth / magic-link callback. Exchanges the code for a session, then applies the
 * post-sign-in checks that the database guards cannot express as redirects:
 *   - no active profile  -> sign out, explain
 *   - Google session on a non-student profile -> sign out, explain (the DB trigger already
 *     blocks the identity link; this is the friendly message for the edge case)
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  const next = safeNextPath(url.searchParams.get('next'), '');
  const providerError = url.searchParams.get('error_description') ?? url.searchParams.get('error');

  const fail = (reason: string, detail?: string) => {
    const to = new URL('/auth/error', url.origin);
    to.searchParams.set('reason', reason);
    if (detail) to.searchParams.set('detail', detail);
    return NextResponse.redirect(to);
  };

  if (providerError) return fail('provider', providerError);

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return fail('exchange', error.message);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as 'magiclink' | 'recovery' | 'invite' | 'email' });
    if (error) return fail('exchange', error.message);
  } else {
    return fail('missing-code');
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail('no-session');

  const { data: profile } = await supabase.from('profiles').select('role, is_active').eq('id', user.id).maybeSingle();
  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    return fail('no-profile');
  }

  const provider = user.app_metadata?.provider;
  if (provider === 'google' && profile.role !== 'student') {
    await supabase.auth.signOut();
    return fail('google-not-student');
  }

  if (user.app_metadata?.must_change_password === true) {
    return NextResponse.redirect(new URL('/account/password', url.origin));
  }
  return NextResponse.redirect(new URL(next || ROLE_HOME[profile.role as Role], url.origin));
}
