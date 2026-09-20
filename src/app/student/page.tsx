import { requireRole } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/primitives';

export default async function StudentHome() {
  const user = await requireRole('student');
  return <PageHeader title={`Welcome, ${user.fullName}`} description="Dashboard content arrives in a later phase." />;
}
