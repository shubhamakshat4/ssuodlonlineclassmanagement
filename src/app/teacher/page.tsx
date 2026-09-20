import { requireRole } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/primitives';

export default async function TeacherHome() {
  const user = await requireRole('teacher');
  return <PageHeader title={`Welcome, ${user.fullName}`} description="Dashboard content arrives in a later phase." />;
}
