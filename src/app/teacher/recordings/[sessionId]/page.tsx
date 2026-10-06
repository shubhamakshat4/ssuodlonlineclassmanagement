import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/primitives';
import { RecordingPlayer } from '@/components/recording-player';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import type { ClassSessionView, Recording } from '@/lib/db/types';
import { formatIst } from '@/lib/domain/time';

export const dynamic = 'force-dynamic';

export default async function TeacherRecordingPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  await requireRole('teacher');
  const supabase = await createClient();
  const [{ data: session }, { data: recording }] = await Promise.all([
    supabase.from('v_class_sessions').select('*').eq('id', sessionId).maybeSingle(),
    supabase.from('recordings').select('*').eq('class_session_id', sessionId).eq('status', 'available').order('recorded_at').limit(1).maybeSingle(),
  ]);
  // RLS hides another teacher's classes and expired recordings, so both become a 404.
  if (!session || !recording) notFound();
  const s = session as ClassSessionView;
  const r = recording as Recording;

  return (
    <>
      <PageHeader
        eyebrow="Recording"
        title={s.subject_name}
        description={`${formatIst(s.scheduled_start)} · ${s.batch_code}${s.topic ? ` · ${s.topic}` : ''}`}
        actions={
          <Link href="/teacher/recordings" className="text-sm text-primary underline">
            ← All recordings
          </Link>
        }
      />
      <RecordingPlayer sessionId={sessionId} expiresAt={r.expires_at} durationSeconds={r.duration_seconds} backHref="/teacher/recordings" backLabel="All recordings" />
    </>
  );
}
