import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import { EditLink } from '@/components/edit-link';
import { SessionCard } from '@/components/session-card';
import { EmptyState, PageHeader, SectionTitle } from '@/components/ui/primitives';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { formatIstDate } from '@/lib/domain/time';
import { joinLeadMinutes, todayAndUpcoming } from '@/lib/queries/sessions';

export const dynamic = 'force-dynamic';

export default async function TeacherHome() {
  const user = await requireRole('teacher');
  const supabase = await createClient();
  const [{ today, todays, upcoming }, lead] = await Promise.all([todayAndUpcoming(supabase, 1), joinLeadMinutes(supabase)]);
  const liveCount = todays.filter((s) => s.join_window_open).length;

  return (
    <>
      <PageHeader
        eyebrow="Faculty"
        title={`Today, ${formatIstDate(new Date(`${today}T12:00:00+05:30`))}`}
        description={`${user.fullName} · ${todays.length === 0 ? 'no classes today' : `${todays.length} class${todays.length === 1 ? '' : 'es'} today`}${liveCount ? ` · ${liveCount} live now` : ''} · Join opens ${lead} min before class`}
        actions={
          <Link href="/teacher/upcoming" className="inline-flex h-10 items-center gap-2 rounded-lg border border-border-strong bg-surface px-4 text-sm font-medium shadow-sm hover:border-primary/40 hover:bg-primary-soft/60">
            <CalendarDays className="h-4 w-4" aria-hidden />
            Upcoming
          </Link>
        }
      />
      <SectionTitle>Your classes today</SectionTitle>
      <div className="grid gap-3">
        {todays.length === 0 ? <EmptyState icon={CalendarDays}>No classes today.</EmptyState> : null}
        {todays.map((s) => (
          <SessionCard key={s.id} session={s} leadMinutes={lead} showBatch actions={<EditLink id={s.id} testId={`edit-${s.id}`} />} />
        ))}
      </div>
      {upcoming.length ? (
        <p className="mt-6 text-sm text-muted-foreground">
          {upcoming.length} class{upcoming.length === 1 ? '' : 'es'} tomorrow ·{' '}
          <Link href="/teacher/upcoming" className="font-medium text-primary hover:underline">
            See upcoming
          </Link>
        </p>
      ) : null}
    </>
  );
}
