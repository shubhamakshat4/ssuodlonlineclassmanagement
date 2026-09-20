/**
 * Pure route-gating rules shared by the middleware and unit tests.
 * No I/O here: the middleware resolves the session + role and asks this module what to do.
 */
export type Role = 'student' | 'teacher' | 'admin';

export const ROLE_HOME: Record<Role, string> = {
  student: '/student',
  teacher: '/teacher',
  admin: '/admin',
};

export interface RouteDecision {
  action: 'allow' | 'redirect';
  to?: string;
}

const PROTECTED_PREFIXES: Array<{ prefix: string; roles: Role[] }> = [
  { prefix: '/student', roles: ['student'] },
  { prefix: '/teacher', roles: ['teacher'] },
  { prefix: '/admin', roles: ['admin'] },
  { prefix: '/api/sessions', roles: ['student', 'teacher', 'admin'] },
  { prefix: '/api/admin', roles: ['admin'] },
  { prefix: '/api/teacher', roles: ['teacher', 'admin'] },
  { prefix: '/account', roles: ['student', 'teacher', 'admin'] },
];

const AUTH_PAGES = ['/login', '/login/student'];

function matches(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(prefix + '/');
}

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => matches(pathname, p.prefix));
}

/**
 * Decide what to do with a request.
 * @param pathname          request path
 * @param role              resolved profile role, or null when signed out / no profile
 * @param mustChangePassword app_metadata flag set by the admin at invite time
 */
export function decideRoute(pathname: string, role: Role | null, mustChangePassword = false): RouteDecision {
  const isApi = pathname.startsWith('/api/');

  // Forced password change beats everything except signing out and the change page itself.
  if (role && mustChangePassword && !isApi && !matches(pathname, '/account/password') && !matches(pathname, '/auth')) {
    return { action: 'redirect', to: '/account/password' };
  }

  // Signed-in users do not need the login pages or the landing page.
  if (role && (AUTH_PAGES.includes(pathname) || pathname === '/')) {
    return { action: 'redirect', to: ROLE_HOME[role] };
  }

  const rule = PROTECTED_PREFIXES.find((p) => matches(pathname, p.prefix));
  if (!rule) return { action: 'allow' };

  if (!role) {
    if (isApi) return { action: 'redirect', to: '/api/unauthorized' };
    const next = encodeURIComponent(pathname);
    return { action: 'redirect', to: pathname.startsWith('/student') ? `/login/student?next=${next}` : `/login?next=${next}` };
  }

  if (!rule.roles.includes(role)) {
    if (isApi) return { action: 'redirect', to: '/api/forbidden' };
    return { action: 'redirect', to: ROLE_HOME[role] };
  }

  return { action: 'allow' };
}

/** Only allow same-origin relative redirects after login. */
export function safeNextPath(next: string | null | undefined, fallback: string): string {
  if (!next) return fallback;
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('://')) return fallback;
  return next;
}
