import { AppShell, type NavItem } from '@/components/app-shell';
import { requireRole } from '@/lib/auth/session';

const NAV: NavItem[] = [{ href: '/student', label: 'My classes' }, { href: '/student/timetable', label: 'Timetable' }, { href: '/student/recordings', label: 'Recordings' }, { href: '/student/profile', label: 'Profile' }];

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole('student');
  return (
    <AppShell user={user} nav={NAV}>
      {children}
    </AppShell>
  );
}
