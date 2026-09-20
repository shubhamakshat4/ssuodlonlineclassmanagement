import Link from 'next/link';
import { AlertTriangle, BookOpen, CalendarClock, GraduationCap, Layers, Users } from 'lucide-react';
import { StatusBadge, SyncBadge } from '@/components/session-badges';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, PageHeader, SectionTitle, Stat } from '@/components/ui/primitives';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/session';
import type { ClassSessionView } from '@/lib/db/types';
import { formatIstDate, formatIstTime, istDate } from '@/lib/domain/time';
import { todayAndUpcoming } from '@/lib/queries/sessions';

export const dynamic = 'force-dynamic';

const QUICK_LINKS = [
  { href: '/admin/timetable', label: 'Timetable builder', text: 'Weekly slots per batch with clash detection.' },
  { href: '/admin/sessions', label: 'Sessions', text: 'Cancel, reschedule, add an extra class.' },
  { href: '/admin/students', label: 'Students', text: 'Map new sign-ins to a batch, import CSV.' },
  { href: '/admin/attendance', label: 'Attendance report', text: 'Per batch and subject, CSV export.' },
];

export default async function AdminHome() {
  const user = await requireRole('admin');
  const supabase = await createClient();
  const head = { count: 'exact' as const, head: true };
  const nowIso = new Date().toISOString();
  const [programs, batches, students, teachers, failed, pending, unmapped, { todays }] = await Promise.all([
    supabase.from('programs').select('id', head),
    supabase.from('batches').select('id', head).eq('is_active', true),
    supabase.from('students').select('id', head).eq('status', 'active'),
    supabase.from('teachers').select('id', head),
    supabase.from('class_sessions').select('id', head).eq('sync_status', 'failed'),
    supabase.from('class_sessions').select('id', head).eq('sync_status', 'pending').eq('status', 'scheduled').gt('scheduled_end', nowIso),
    supabase.from('v_unmapped_students').select('id', head),
    todayAndUpcoming(supabase, 1),
  ]);
  const n = (r: { count: number | null }) => r.count ?? 0;

  return (
    <>
      <PageHeader eyebrow="Administration" title={`Welcome, ${user.fullName.split(' ')[0]}`} description={`${formatIstDate(new Date(`${istDate()}T12:00:00+05:30`))} · ODL online class administration`} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/admin/students">
          <Stat label="Active students" value={n(students)} icon={GraduationCap} hint={n(unmapped) ? `${n(unmapped)} signed in, not mapped` : 'all mapped'} tone={n(unmapped) ? 'warn' : 'default'} />
        </Link>
        <Link href="/admin/teachers">
          <Stat label="Faculty" value={n(teachers)} icon={Users} />
        </Link>
        <Link href="/admin/batches">
          <Stat label="Active batches" value={n(batches)} icon={Layers} hint={`${n(programs)} programme${n(programs) === 1 ? '' : 's'}`} />
        </Link>
        <Link href="/admin/sync-health">
          <Stat label="Meeting sync" value={n(failed) ? `${n(failed)} failed` : 'Healthy'} icon={n(failed) ? AlertTriangle : CalendarClock} hint={`${n(pending)} awaiting Teams link`} tone={n(failed) ? 'warn' : 'good'} />
        </Link>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section>
          <SectionTitle hint="All batches">Today&apos;s classes</SectionTitle>
          {todays.length === 0 ? (
            <EmptyState icon={BookOpen}>No classes scheduled today.</EmptyState>
          ) : (
            <Card>
              <CardContent className="divide-y divide-border p-0">
                {todays.map((s: ClassSessionView) => (
                  <div key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <span className="w-28 font-mono text-sm">
                      {formatIstTime(s.scheduled_start)}–{formatIstTime(s.scheduled_end)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{s.subject_name}</span>
                      <span className="text-muted-foreground"> · {s.batch_code} · {s.teacher_name}</span>
                    </span>
                    <StatusBadge status={s.status} />
                    <SyncBadge sync={s.sync_status} provider={s.provider} />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </section>
        <section>
          <SectionTitle>Quick actions</SectionTitle>
          <div className="grid gap-3">
            {QUICK_LINKS.map((q) => (
              <Link key={q.href} href={q.href}>
                <Card className="transition-shadow hover:shadow-float">
                  <CardHeader className="p-4">
                    <CardTitle>{q.label}</CardTitle>
                    <CardDescription>{q.text}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
