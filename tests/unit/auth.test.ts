import { describe, expect, it } from 'vitest';
import { decideRoute, isProtectedPath, safeNextPath } from '@/lib/auth/routing';
import { validatePassword } from '@/lib/auth/password';

describe('decideRoute', () => {
  it('lets anonymous users reach public pages', () => {
    expect(decideRoute('/', null)).toEqual({ action: 'allow' });
    expect(decideRoute('/login', null)).toEqual({ action: 'allow' });
    expect(decideRoute('/login/student', null)).toEqual({ action: 'allow' });
    expect(decideRoute('/auth/callback', null)).toEqual({ action: 'allow' });
  });

  it('sends anonymous users to the right login page, remembering where they were going', () => {
    expect(decideRoute('/student/recordings', null)).toEqual({ action: 'redirect', to: '/login/student?next=%2Fstudent%2Frecordings' });
    expect(decideRoute('/teacher', null)).toEqual({ action: 'redirect', to: '/login?next=%2Fteacher' });
    expect(decideRoute('/admin/students', null)).toEqual({ action: 'redirect', to: '/login?next=%2Fadmin%2Fstudents' });
  });

  it('returns 401/403 markers for API routes instead of HTML redirects', () => {
    expect(decideRoute('/api/sessions/abc/join', null)).toEqual({ action: 'redirect', to: '/api/unauthorized' });
    expect(decideRoute('/api/admin/students', 'teacher')).toEqual({ action: 'redirect', to: '/api/forbidden' });
    expect(decideRoute('/api/sessions/abc/join', 'student')).toEqual({ action: 'allow' });
  });

  it('gates each area by role and bounces others to their own home', () => {
    expect(decideRoute('/student', 'student')).toEqual({ action: 'allow' });
    expect(decideRoute('/teacher', 'student')).toEqual({ action: 'redirect', to: '/student' });
    expect(decideRoute('/admin', 'teacher')).toEqual({ action: 'redirect', to: '/teacher' });
    expect(decideRoute('/admin/timetable', 'admin')).toEqual({ action: 'allow' });
    expect(decideRoute('/student/x', 'admin')).toEqual({ action: 'redirect', to: '/admin' });
    // prefix matching must not leak: /studentx is not /student
    expect(isProtectedPath('/studentx')).toBe(false);
    expect(isProtectedPath('/student/x')).toBe(true);
  });

  it('keeps signed-in users away from the login pages and landing page', () => {
    expect(decideRoute('/login', 'teacher')).toEqual({ action: 'redirect', to: '/teacher' });
    expect(decideRoute('/', 'student')).toEqual({ action: 'redirect', to: '/student' });
  });

  it('forces a password change before anything else', () => {
    expect(decideRoute('/teacher', 'teacher', true)).toEqual({ action: 'redirect', to: '/account/password' });
    expect(decideRoute('/account/password', 'teacher', true)).toEqual({ action: 'allow' });
    expect(decideRoute('/auth/signout', 'teacher', true)).toEqual({ action: 'allow' });
    expect(decideRoute('/teacher', 'teacher', false)).toEqual({ action: 'allow' });
  });
});

describe('safeNextPath', () => {
  it('only accepts same-origin relative paths', () => {
    expect(safeNextPath('/student/recordings', '/x')).toBe('/student/recordings');
    expect(safeNextPath('https://evil.example/', '/x')).toBe('/x');
    expect(safeNextPath('//evil.example', '/x')).toBe('/x');
    expect(safeNextPath('/a?u=http://b', '/x')).toBe('/x');
    expect(safeNextPath(null, '/x')).toBe('/x');
    expect(safeNextPath('', '/x')).toBe('/x');
  });
});

describe('validatePassword', () => {
  it('enforces 8+ chars with a letter and a digit', () => {
    expect(validatePassword('short1')).toMatch(/8 characters/);
    expect(validatePassword('abcdefghijklmnop')).toMatch(/digit/);
    expect(validatePassword('123456789012')).toMatch(/letter/);
    expect(validatePassword(' abcdefghijk1')).toMatch(/whitespace/);
    expect(validatePassword('TeacherPass12345')).toBeNull();
    // the first-login password the ODL office hands to students must satisfy the policy
    expect(validatePassword('srisri@26')).toBeNull();
  });
});
