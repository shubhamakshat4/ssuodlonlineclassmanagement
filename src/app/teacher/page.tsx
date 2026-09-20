import Link from 'next/link';
import { SessionCard } from '@/components/session-card';
import { EmptyState, PageHeader } from '@/components/ui/primitives';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { formatIstDate } from '@/lib/domain/time';
import { joinLeadMinutes, todayAndUpcoming } from '@/lib/queries/sessions';

export const dynamic = 'force-dynamic';

export default async function TeacherHome() {
  const user = await requireRole('teacher');
  const supabase = await createClient();
  const [{ today, todays, upcoming }, lead] = await Promise.all([todayAndUpcoming(supabase, 1), joinLeadMinutes(supabase)]);

  return (
    <>
      <PageHeader title={`Today — ${formatIstDate(new Date(`${today}T12:00:00+05:30`))}`} description={`Signed in as ${user.fullName}. Join opens ${lead} minutes before each class.`} />
      <div className="grid gap-3">
        {todays.length === 0 ? <EmptyState>No classes today.</EmptyState> : null}
        {todays.map((s) => (
          <SessionCard
            key={s.id}
            session={s}
            leadMinutes={lead}
            showBatch
            actions={
              <Link href={`/teacher/sessions/${s.id}`} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted" data-testid={`edit-${s.id}`}>
                Edit link / roster
              </Link>
            }
          />
        ))}
      </div>
      {upcoming.length ? (
        <p className="mt-6 text-sm text-muted-foreground">
          {upcoming.length} class(es) tomorrow.{' '}
          <Link href="/teacher/upcoming" className="text-primary underline">
            See upcoming
          </Link>
        </p>
      ) : null}
    </>
  );
}
