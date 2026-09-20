import Link from 'next/link';
import { CalendarDays, PlayCircle } from 'lucide-react';
import { DayGroup } from '@/components/day-group';
import { SessionCard } from '@/components/session-card';
import { Alert, EmptyState, PageHeader, SectionTitle } from '@/components/ui/primitives';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { formatIstDate } from '@/lib/domain/time';
import { groupByIstDay, joinedSessionIds, joinLeadMinutes, todayAndUpcoming } from '@/lib/queries/sessions';

export const dynamic = 'force-dynamic';

export default async function StudentHome() {
  const user = await requireRole('student');
  const supabase = await createClient();
  const [{ today, todays, upcoming }, lead, student] = await Promise.all([
    todayAndUpcoming(supabase, 7),
    joinLeadMinutes(supabase),
    supabase.from('students').select('status, batches(code, name)').eq('id', user.id).maybeSingle(),
  ]);
  const enrolment = student.data as { status: string; batches: { code: string; name: string } | null } | null;
  const firstName = user.fullName.split(' ')[0];

  if (!enrolment) {
    return (
      <>
        <PageHeader eyebrow="Student" title={`Hello, ${firstName}`} description={user.email} />
        <Alert variant="warning" data-testid="no-class-mapped">
          <p className="font-medium">No classes are assigned to you yet.</p>
          <p className="mt-1">
            Please contact the ODL department for more details. Once they map your account to your batch, your timetable and recordings will appear here
            automatically. Quote this email when you contact them: <strong>{user.email}</strong>.
          </p>
        </Alert>
      </>
    );
  }

  const joined = await joinedSessionIds(
    supabase,
    todays.map((s) => s.id),
  );
  const liveCount = todays.filter((s) => s.join_window_open).length;

  return (
    <>
      <PageHeader
        eyebrow={enrolment.batches ? `${enrolment.batches.name} · ${enrolment.batches.code}` : 'Student'}
        title={`Hello, ${firstName}`}
        description={`${formatIstDate(new Date(`${today}T12:00:00+05:30`))} · ${todays.length === 0 ? 'no classes today' : `${todays.length} class${todays.length === 1 ? '' : 'es'} today`}${liveCount ? ` · ${liveCount} live now` : ''}`}
        actions={
          <Link href="/student/recordings" className="inline-flex h-10 items-center gap-2 rounded-lg border border-border-strong bg-surface px-4 text-sm font-medium shadow-sm hover:border-primary/40 hover:bg-primary-soft/60">
            <PlayCircle className="h-4 w-4" aria-hidden />
            Recordings
          </Link>
        }
      />

      {enrolment.status !== 'active' ? (
        <Alert variant="warning" className="mb-6">
          Your enrolment is <strong>{enrolment.status.replace('_', ' ')}</strong>. Classes and recordings are not shown until the ODL office reactivates it.
        </Alert>
      ) : null}

      <section className="mb-10">
        <SectionTitle hint={`Join opens ${lead} min before class`}>Today</SectionTitle>
        <div className="grid gap-3">
          {todays.length === 0 ? <EmptyState icon={CalendarDays}>No classes today. Your next classes are listed below.</EmptyState> : null}
          {todays.map((s) => (
            <SessionCard key={s.id} session={s} leadMinutes={lead} joined={joined.has(s.id)} />
          ))}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Clicking <strong>Join Now</strong> records that you joined from the portal; it is not a record of presence for the full session.
        </p>
      </section>

      <section>
        <SectionTitle hint="Next 7 days">Coming up</SectionTitle>
        {upcoming.length === 0 ? <EmptyState icon={CalendarDays}>Nothing scheduled in the next 7 days.</EmptyState> : null}
        <div className="grid gap-8">
          {groupByIstDay(upcoming).map((day) => (
            <DayGroup key={day.date} date={day.date} sessions={day.sessions} leadMinutes={lead} />
          ))}
        </div>
      </section>
    </>
  );
}
