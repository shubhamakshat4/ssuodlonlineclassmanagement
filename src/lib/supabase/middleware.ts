import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { publicEnv } from '@/lib/env';
import { decideRoute, isProtectedPath, type Role } from '@/lib/auth/routing';

/**
 * Refreshes the Supabase session cookie and gates protected routes by profile role.
 * Server Components re-check with requireRole(); this is the first line, not the only one.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getUser() validates the JWT with the auth server; never trust getSession() here.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  let role: Role | null = null;
  let mustChangePassword = false;

  if (user) {
    const { data: profile } = await supabase.from('profiles').select('role, is_active').eq('id', user.id).maybeSingle();
    if (profile?.is_active) role = profile.role as Role;
    mustChangePassword = user.app_metadata?.must_change_password === true;
  }

  // Signed in but no active profile: only allow the sign-out and error routes.
  if (user && !role && (isProtectedPath(pathname) || pathname === '/')) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/error';
    url.search = '?reason=no-profile';
    return NextResponse.redirect(url);
  }

  const decision = decideRoute(pathname, role, mustChangePassword);
  if (decision.action === 'redirect' && decision.to) {
    if (decision.to === '/api/unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (decision.to === '/api/forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const url = request.nextUrl.clone();
    const [path, search] = decision.to.split('?');
    url.pathname = path;
    url.search = search ? `?${search}` : '';
    const redirect = NextResponse.redirect(url);
    // carry refreshed auth cookies on the redirect too
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c.name, c.value));
    return redirect;
  }

  return response;
}
