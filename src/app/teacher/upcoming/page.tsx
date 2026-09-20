import Link from 'next/link';
import { SessionCard } from '@/components/session-card';
import { EmptyState, PageHeader } from '@/components/ui/primitives';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { addDays, formatIstDate, istDate } from '@/lib/domain/time';
import { groupByIstDay, joinLeadMinutes, sessionsBetween } from '@/lib/queries/sessions';

export const dynamic = 'force-dynamic';

export default async function TeacherUpcomingPage() {
  await requireRole('teacher');
  const supabase = await createClient();
  const from = addDays(istDate(), 1);
  const [sessions, lead] = await Promise.all([sessionsBetween(supabase, from, addDays(from, 20)), joinLeadMinutes(supabase)]);

  return (
    <>
      <PageHeader title="Upcoming classes" description="Tomorrow onward, for the next three weeks." />
      {sessions.length === 0 ? <EmptyState>Nothing scheduled yet. Sessions are generated 21 days ahead from the timetable.</EmptyState> : null}
      <div className="grid gap-6">
        {groupByIstDay(sessions).map((day) => (
          <div key={day.date}>
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">{formatIstDate(new Date(`${day.date}T12:00:00+05:30`))}</h3>
            <div className="grid gap-3">
              {day.sessions.map((s) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  leadMinutes={lead}
                  showBatch
                  actions={
                    <Link href={`/teacher/sessions/${s.id}`} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">
                      Edit link / roster
                    </Link>
                  }
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
