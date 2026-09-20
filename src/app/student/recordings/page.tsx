import Link from 'next/link';
import { Badge, Card, CardContent, EmptyState, PageHeader } from '@/components/ui/primitives';
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
      <PageHeader title="Recordings" description={`Class recordings stay available for ${retention} days after the class, then disappear automatically.`} />
      {rows.length === 0 ? <EmptyState>No recordings available right now. They usually appear within an hour or two after a class ends.</EmptyState> : null}
      <div className="grid gap-3">
        {rows.map((r) => {
          const days = recordingDaysRemaining(now, r.expires_at);
          return (
            <Card key={r.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
                <div>
                  <div className="font-medium">
                    {r.class_sessions.batch_subjects.subjects.name}
                    {r.class_sessions.topic ? <span className="text-muted-foreground"> · {r.class_sessions.topic}</span> : null}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Class on {formatIst(r.class_sessions.scheduled_start)}
                    {r.duration_seconds ? ` · ${Math.round(r.duration_seconds / 60)} min` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={days <= 3 ? 'warning' : 'secondary'}>
                    {days} day{days === 1 ? '' : 's'} left
                  </Badge>
                  <Link href={`/student/recordings/${r.class_session_id}`} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground" data-testid={`play-${r.class_session_id}`}>
                    Watch
                  </Link>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
