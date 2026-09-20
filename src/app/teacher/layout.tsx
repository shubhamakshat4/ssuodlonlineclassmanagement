import { AppShell, type NavItem } from '@/components/app-shell';
import { requireRole } from '@/lib/auth/session';

const NAV: NavItem[] = [{ href: '/teacher', label: 'Today' }, { href: '/teacher/timetable', label: 'Timetable' }, { href: '/teacher/upcoming', label: 'Upcoming' }];

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole('teacher');
  return (
    <AppShell user={user} nav={NAV}>
      {children}
    </AppShell>
  );
}
