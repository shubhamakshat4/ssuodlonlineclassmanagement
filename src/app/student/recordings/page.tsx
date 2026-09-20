import Link from 'next/link';
import { Clock, PlayCircle, Video } from 'lucide-react';
import { Badge, EmptyState, PageHeader } from '@/components/ui/primitives';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import type { AppSettings, Recording } from '@/lib/db/types';
import { appConfig } from '@/lib/env';
import { formatIst } from '@/lib/domain/time';
import { recordingDaysRemaining } from '@shared/sessions.ts';

export const dynamic = 'force-dynamic';

type Row = Recording & { class_sessions: { scheduled_start: string; topic: string | null; batch_subjects: { subjects: { name: string; code: string } } } };

export default async function StudentRecordingsPage() {
  await requireRole('student');
  const supabase = await createClient();
  // RLS returns only recordings the student may watch (enrolled, available, not expired).
  const [{ data }, { data: settings }] = await Promise.all([
    supabase
      .from('recordings')
      .select('*, class_sessions!inner(scheduled_start, topic, batch_subjects!inner(subjects!inner(name, code)))')
      .order('recorded_at', { ascending: false }),
    supabase.from('app_settings').select('recording_retention_days').eq('id', 1).maybeSingle(),
  ]);
  const rows = (data ?? []) as unknown as Row[];
  const retention = (settings as Pick<AppSettings, 'recording_retention_days'> | null)?.recording_retention_days ?? appConfig.recordingRetentionDays;
  const now = new Date();

  return (
    <>
      <PageHeader eyebrow="Student" title="Recordings" description={`Class recordings stay available for ${retention} days after the class, then disappear automatically.`} />
      {rows.length === 0 ? <EmptyState icon={Video}>No recordings available right now. They usually appear within an hour or two after a class ends.</EmptyState> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((r) => {
          const days = recordingDaysRemaining(now, r.expires_at);
          return (
            <Link key={r.id} href={`/student/recordings/${r.class_session_id}`} className="group" data-testid={`play-${r.class_session_id}`}>
              <article className="flex h-full gap-4 rounded-xl border border-border bg-surface p-4 shadow-card transition-shadow hover:shadow-float">
                <span className="grid h-16 w-24 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-foreground to-[#3a4050] text-white">
                  <PlayCircle className="h-7 w-7 opacity-90 transition-transform group-hover:scale-110" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold tracking-tight">{r.class_sessions.batch_subjects.subjects.name}</div>
                  {r.class_sessions.topic ? <div className="truncate text-sm text-muted-foreground">{r.class_sessions.topic}</div> : null}
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{formatIst(r.class_sessions.scheduled_start)}</span>
                    {r.duration_seconds ? (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" aria-hidden />
                        {Math.round(r.duration_seconds / 60)} min
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2">
                    <Badge variant={days <= 3 ? 'warning' : 'secondary'}>
                      {days} day{days === 1 ? '' : 's'} left
                    </Badge>
                  </div>
                </div>
              </article>
            </Link>
          );
        })}
      </div>
    </>
  );
}
