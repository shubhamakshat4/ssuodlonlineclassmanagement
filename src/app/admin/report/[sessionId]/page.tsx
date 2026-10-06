import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardContent, PageHeader, Table, TBody, TD, TH, THead, TR } from '@/components/ui/primitives';
import { RecordingPlayer } from '@/components/recording-player';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import type { ClassSessionView, Recording } from '@/lib/db/types';
import { formatIst } from '@/lib/domain/time';

export const dynamic = 'force-dynamic';

/** One class: the recording, and who joined it. */
export default async function AdminClassReportPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  await requireRole('admin');
  const supabase = await createClient();
  const [{ data: session }, { data: recording }, { data: joins }] = await Promise.all([
    supabase.from('v_class_sessions').select('*').eq('id', sessionId).maybeSingle(),
    supabase.from('recordings').select('*').eq('class_session_id', sessionId).eq('status', 'available').order('recorded_at').limit(1).maybeSingle(),
    supabase.from('attendance').select('clicked_at, students!inner(roll_number, profiles!inner(full_name))').eq('class_session_id', sessionId).order('clicked_at'),
  ]);
  if (!session) notFound();
  const s = session as ClassSessionView;
  const r = recording as Recording | null;
  const attended = (joins ?? []) as unknown as { clicked_at: string; students: { roll_number: string | null; profiles: { full_name: string } } }[];

  return (
    <>
      <PageHeader
        eyebrow="Class report"
        title={s.subject_name}
        description={`${formatIst(s.scheduled_start)} · ${s.batch_code} · ${s.teacher_name ?? ''}${s.topic ? ` · ${s.topic}` : ''}`}
        actions={
          <Link href="/admin/report" className="text-sm text-primary underline">
            ← All classes
          </Link>
        }
      />

      {r ? (
        <RecordingPlayer sessionId={sessionId} expiresAt={r.expires_at} durationSeconds={r.duration_seconds} backHref="/admin/report" backLabel="All classes" />
      ) : (
        <Card>
          <CardContent className="pt-5 text-sm text-muted-foreground">
            No recording for this class. One appears within an hour of the class ending, provided it was recorded in Teams.
          </CardContent>
        </Card>
      )}

      <Card className="mt-6">
        <CardContent className="pt-5">
          <h2 className="mb-3 text-sm font-semibold tracking-tight">Joined from the portal ({attended.length})</h2>
          {attended.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody pressed Join Now for this class.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Student</TH>
                  <TH>Roll no.</TH>
                  <TH>Joined at</TH>
                </TR>
              </THead>
              <TBody>
                {attended.map((a, i) => (
                  <TR key={i}>
                    <TD>{a.students.profiles.full_name}</TD>
                    <TD className="whitespace-nowrap font-mono text-xs">{a.students.roll_number ?? '—'}</TD>
                    <TD className="whitespace-nowrap">{formatIst(a.clicked_at)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
