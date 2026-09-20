import Link from 'next/link';
import { Settings2 } from 'lucide-react';

/** Teacher action: open the session page (override link, topic, roster). */
export function EditLink({ id, testId }: { id: string; testId?: string }) {
  return (
    <Link
      href={`/teacher/sessions/${id}`}
      className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-3 text-sm font-medium shadow-sm transition-colors hover:border-primary/40 hover:bg-primary-soft/60"
      data-testid={testId}
    >
      <Settings2 className="h-4 w-4" aria-hidden />
      Edit link / roster
    </Link>
  );
}
