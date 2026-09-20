import { SessionCard } from '@/components/session-card';
import { Alert, EmptyState, PageHeader } from '@/components/ui/primitives';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { formatIstDate } from '@/lib/domain/time';
import { groupByIstDay, joinedSessionIds, joinLeadMinutes, todayAndUpcoming } from '@/lib/queries/sessions';

export const dynamic = 'force-dynamic';

export default async function StudentHome() {
  const user = await requireRole('student');
  const supabase = await createClient();
  const [{ todays, upcoming }, lead, student] = await Promise.all([
    todayAndUpcoming(supabase, 7),
    joinLeadMinutes(supabase),
    supabase.from('students').select('status, batches(code, name)').eq('id', user.id).maybeSingle(),
  ]);
  const joined = await joinedSessionIds(
    supabase,
    todays.map((s) => s.id),
  );
  const enrolment = student.data as { status: string; batches: { code: string; name: string } | null } | null;

  if (!enrolment) {
    return (
      <>
        <PageHeader title={`Hello, ${user.fullName.split(' ')[0]}`} description={user.email} />
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

  return (
    <>
      <PageHeader title={`Hello, ${user.fullName.split(' ')[0]}`} description={enrolment?.batches ? `${enrolment.batches.name} (${enrolment.batches.code})` : undefined} />

      {enrolment && enrolment.status !== 'active' ? (
        <Alert variant="warning" className="mb-6">
          Your enrolment is <strong>{enrolment.status.replace('_', ' ')}</strong>. Classes and recordings are not shown until the ODL office reactivates it.
        </Alert>
      ) : null}

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Today</h2>
        <div className="grid gap-3">
          {todays.length === 0 ? <EmptyState>No classes today.</EmptyState> : null}
          {todays.map((s) => (
            <SessionCard key={s.id} session={s} leadMinutes={lead} joined={joined.has(s.id)} />
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Join Now opens {lead} minutes before each class. Clicking it records that you <em>joined from the portal</em>; it is not a record of presence for the full session.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Next 7 days</h2>
        {upcoming.length === 0 ? <EmptyState>Nothing scheduled in the next 7 days.</EmptyState> : null}
        <div className="grid gap-6">
          {groupByIstDay(upcoming).map((day) => (
            <div key={day.date}>
              <h3 className="mb-2 text-sm font-medium text-muted-foreground">{formatIstDate(new Date(`${day.date}T12:00:00+05:30`))}</h3>
              <div className="grid gap-3">
                {day.sessions.map((s) => (
                  <SessionCard key={s.id} session={s} leadMinutes={lead} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
