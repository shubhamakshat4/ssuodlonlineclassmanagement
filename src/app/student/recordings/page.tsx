import { EmptyState, PageHeader } from '@/components/ui/primitives';
import { requireRole } from '@/lib/auth/session';

export default async function StudentRecordingsPage() {
  await requireRole('student');
  return (
    <>
      <PageHeader title="Recordings" description="Class recordings stay available for 30 days after the class." />
      <EmptyState>Recordings appear here once they are harvested after class (Phase 10).</EmptyState>
    </>
  );
}
