import { AppShell, type NavItem } from '@/components/app-shell';
import { requireRole } from '@/lib/auth/session';

const NAV: NavItem[] = [{ href: '/admin', label: 'Overview' }, { href: '/admin/programs', label: 'Programmes' }, { href: '/admin/batches', label: 'Batches' }, { href: '/admin/subjects', label: 'Subjects' }, { href: '/admin/students', label: 'Students' }, { href: '/admin/teachers', label: 'Teachers' }, { href: '/admin/timetable', label: 'Timetable' }, { href: '/admin/holidays', label: 'Holidays' }, { href: '/admin/sessions', label: 'Sessions' }, { href: '/admin/sync-health', label: 'Sync health' }, { href: '/admin/attendance', label: 'Attendance' }, { href: '/admin/audit-log', label: 'Audit log' }, { href: '/admin/import', label: 'Import' }];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole('admin');
  return (
    <AppShell user={user} nav={NAV}>
      {children}
    </AppShell>
  );
}
