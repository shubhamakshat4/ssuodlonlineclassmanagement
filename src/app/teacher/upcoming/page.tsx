import { CalendarDays } from 'lucide-react';
import { DayGroup } from '@/components/day-group';
import { EditLink } from '@/components/edit-link';
import { EmptyState, PageHeader } from '@/components/ui/primitives';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { addDays, istDate } from '@/lib/domain/time';
import { groupByIstDay, joinLeadMinutes, sessionsBetween } from '@/lib/queries/sessions';

export const dynamic = 'force-dynamic';

export default async function TeacherUpcomingPage() {
  await requireRole('teacher');
  const supabase = await createClient();
  const from = addDays(istDate(), 1);
  const [sessions, lead] = await Promise.all([sessionsBetween(supabase, from, addDays(from, 20)), joinLeadMinutes(supabase)]);

  return (
    <>
      <PageHeader eyebrow="Faculty" title="Upcoming classes" description="Tomorrow onward, for the next three weeks. Sessions are generated 21 days ahead from the timetable." />
      {sessions.length === 0 ? <EmptyState icon={CalendarDays}>Nothing scheduled yet.</EmptyState> : null}
      <div className="grid gap-8">
        {groupByIstDay(sessions).map((day) => (
          <DayGroup key={day.date} date={day.date} sessions={day.sessions} leadMinutes={lead} showBatch actions={(s) => <EditLink id={s.id} />} />
        ))}
      </div>
    </>
  );
}
