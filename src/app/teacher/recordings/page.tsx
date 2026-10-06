import Link from 'next/link';
import { PlayCircle, Video } from 'lucide-react';
import { Badge, Card, CardContent, EmptyState, PageHeader } from '@/components/ui/primitives';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import type { AppSettings, Recording } from '@/lib/db/types';
import { appConfig } from '@/lib/env';
import { formatIst } from '@/lib/domain/time';
import { recordingDaysRemaining } from '@shared/sessions.ts';

export const metadata = { title: 'Recordings — Faculty' };
export const dynamic = 'force-dynamic';

type Row = Recording & {
  class_sessions: { id: string; scheduled_start: string; topic: string | null; batch_subjects: { batches: { code: string }; subjects: { name: string; code: string } } };
};

/** A faculty member's own class recordings. RLS returns only the ones for classes they taught. */
export default async function TeacherRecordingsPage() {
  await requireRole('teacher');
  const supabase = await createClient();
  const [{ data }, { data: settings }] = await Promise.all([
    supabase
      .from('recordings')
      .select('*, class_sessions!inner(id, scheduled_start, topic, batch_subjects!inner(batches!inner(code), subjects!inner(name, code)))')
      .eq('status', 'available')
      .order('recorded_at', { ascending: false }),
    supabase.from('app_settings').select('recording_retention_days').eq('id', 1).maybeSingle(),
  ]);
  const rows = (data ?? []) as unknown as Row[];
  const retention = (settings as Pick<AppSettings, 'recording_retention_days'> | null)?.recording_retention_days ?? appConfig.recordingRetentionDays;
  const now = new Date();

  return (
    <>
      <PageHeader
        eyebrow="Faculty"
        title="Recordings"
        description={`Recordings of your own classes. They stay available for ${retention} days after the class, then disappear automatically.`}
      />
      {rows.length === 0 ? (
        <EmptyState icon={Video}>
          No recordings yet. They appear within an hour or two of a class ending, and only when the class was actually recorded in Teams.
        </EmptyState>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((r) => {
          const s = r.class_sessions;
          const days = recordingDaysRemaining(now, r.expires_at);
          return (
            <Card key={r.id}>
              <CardContent className="flex items-start gap-4 pt-5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                  <PlayCircle className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <Link href={`/teacher/recordings/${s.id}`} className="font-semibold tracking-tight text-primary hover:underline">
                    {s.batch_subjects.subjects.name}
                  </Link>
                  <div className="mt-0.5 text-sm text-muted-foreground">
                    {s.batch_subjects.batches.code} · {formatIst(s.scheduled_start)}
                    {s.topic ? ` · ${s.topic}` : ''}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge variant={days <= 3 ? 'warning' : 'secondary'}>{days <= 0 ? 'Expires today' : `${days} day${days === 1 ? '' : 's'} left`}</Badge>
                    {r.duration_seconds ? <span className="text-xs text-muted-foreground">{Math.round(r.duration_seconds / 60)} min</span> : null}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
