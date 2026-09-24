import { CalendarDays } from 'lucide-react';
import { DayGroup } from '@/components/day-group';
import { Alert, Badge, Card, CardContent, EmptyState, PageHeader, SectionTitle } from '@/components/ui/primitives';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import type { ClassSessionView } from '@/lib/db/types';
import { addDays, formatIstTime, istDate } from '@/lib/domain/time';
import { groupByIstDay, joinLeadMinutes, sessionsBetween } from '@/lib/queries/sessions';
import { studentEnrolment } from '@/lib/queries/student';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Timetable — SSU ODL' };

/** Full schedule for the student's class group(s), for the rest of the term. */
export default async function StudentTimetablePage() {
  const user = await requireRole('student');
  const supabase = await createClient();
  const [enrolment, lead] = await Promise.all([studentEnrolment(supabase, user.id), joinLeadMinutes(supabase)]);

  if (!enrolment || enrolment.groups.length === 0) {
    return (
      <>
        <PageHeader eyebrow="Student" title="Timetable" />
        <Alert variant="warning">
          <p className="font-medium">No classes are assigned to you yet.</p>
          <p className="mt-1">Please contact the ODL department for more details.</p>
        </Alert>
      </>
    );
  }

  const today = istDate();
  const sessions = await sessionsBetween(supabase, today, addDays(today, 120));
  const groupName = new Map(enrolment.groups.map((g) => [g.id, g]));

  // Weekly pattern: which weekday + time the classes fall on (this programme runs on Sundays).
  const pattern = new Map<string, { day: string; time: string; count: number }>();
  for (const s of sessions) {
    const d = new Date(s.scheduled_start);
    const day = d.toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'Asia/Kolkata' });
    const time = `${formatIstTime(s.scheduled_start)}–${formatIstTime(s.scheduled_end)}`;
    const key = `${day} ${time}`;
    pattern.set(key, { day, time, count: (pattern.get(key)?.count ?? 0) + 1 });
  }

  return (
    <>
      <PageHeader
        eyebrow="Student"
        title="Timetable"
        description={`Every scheduled class for ${enrolment.groups.map((g) => g.name).join(' and ')}. All times are IST.`}
      />

      {enrolment.secondary ? (
        <Alert variant="info" className="mb-6">
          You are attending two semesters: <strong>{enrolment.primary?.name}</strong> (primary) and <strong>{enrolment.secondary.name}</strong>. Classes from both
          appear below and on your dashboard.
        </Alert>
      ) : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        {enrolment.groups.map((g) => {
          const mine = sessions.filter((s) => s.batch_id === g.id);
          return (
            <Card key={g.id}>
              <CardContent className="pt-5">
                <div className="flex items-center gap-2">
                  <Badge variant={g.id === enrolment.primary?.id ? 'default' : 'info'}>{g.id === enrolment.primary?.id ? 'Primary' : 'Additional'}</Badge>
                  <span className="font-semibold tracking-tight">{g.name}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{g.program_name}</p>
                <p className="mt-2 text-sm">
                  <strong>{mine.length}</strong> class{mine.length === 1 ? '' : 'es'} scheduled ·{' '}
                  {new Set(mine.map((s) => s.subject_code)).size} subject{new Set(mine.map((s) => s.subject_code)).size === 1 ? '' : 's'}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {pattern.size ? (
        <div className="mb-8">
          <SectionTitle hint="when your classes usually run">Weekly pattern</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {[...pattern.values()]
              .sort((a, b) => b.count - a.count)
              .map((p) => (
                <span key={p.day + p.time} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm shadow-card">
                  <span className="font-medium">{p.day}</span> <span className="font-mono text-muted-foreground">{p.time}</span>{' '}
                  <span className="text-xs text-muted-foreground">× {p.count}</span>
                </span>
              ))}
          </div>
        </div>
      ) : null}

      <SectionTitle hint={`${sessions.length} upcoming`}>All scheduled classes</SectionTitle>
      {sessions.length === 0 ? <EmptyState icon={CalendarDays}>No classes scheduled yet for your semester.</EmptyState> : null}
      <div className="grid gap-8">
        {groupByIstDay(sessions).map((day) => (
          <DayGroup
            key={day.date}
            date={day.date}
            sessions={day.sessions}
            leadMinutes={lead}
            showBatch={enrolment.groups.length > 1}
            actions={(s: ClassSessionView) => (groupName.size > 1 ? <span className="text-xs text-muted-foreground">Sem {groupName.get(s.batch_id)?.semester ?? ''}</span> : null)}
          />
        ))}
      </div>
    </>
  );
}
