import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Alert, Badge, PageHeader } from '@/components/ui/primitives';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import type { ClassSessionView, Recording } from '@/lib/db/types';
import { formatIst } from '@/lib/domain/time';
import { recordingDaysRemaining } from '@shared/sessions.ts';

export const dynamic = 'force-dynamic';

/**
 * Inline player. The <video> element requests /api/recordings/{id}/play, follows the 302 to the
 * short-lived OneDrive URL, and uses range requests so seeking works. Nothing is re-hosted.
 */
export default async function RecordingPlayerPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  await requireRole('student');
  const supabase = await createClient();
  const [{ data: session }, { data: recording }] = await Promise.all([
    supabase.from('v_class_sessions').select('*').eq('id', sessionId).maybeSingle(),
    supabase.from('recordings').select('*').eq('class_session_id', sessionId).eq('status', 'available').order('recorded_at').limit(1).maybeSingle(),
  ]);
  if (!session || !recording) notFound(); // RLS hides expired / other-batch recordings → 404
  const s = session as ClassSessionView;
  const r = recording as Recording;
  const days = recordingDaysRemaining(new Date(), r.expires_at);
  const src = `/api/recordings/${sessionId}/play`;

  return (
    <>
      <PageHeader
        eyebrow="Recording"
        title={s.subject_name}
        description={`${formatIst(s.scheduled_start)} · ${s.teacher_name ?? ''}${s.topic ? ` · ${s.topic}` : ''}`}
        actions={
          <Link href="/student/recordings" className="text-sm text-primary underline">
            ← All recordings
          </Link>
        }
      />
      <div className="grid gap-4">
        <video controls preload="metadata" className="w-full max-w-4xl rounded-lg bg-black" src={src} data-testid="recording-video">
          Your browser cannot play this video.{' '}
          <a href={src} target="_blank" rel="noreferrer">
            Open it in a new tab
          </a>
          .
        </video>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Badge variant={days <= 3 ? 'warning' : 'secondary'}>
            Available for {days} more day{days === 1 ? '' : 's'}
          </Badge>
          <a href={src} target="_blank" rel="noreferrer" className="text-primary underline">
            Open in a new tab
          </a>
        </div>
        <Alert>Recordings are streamed from the university&apos;s Microsoft 365 storage and are for enrolled students only. Do not share the link.</Alert>
      </div>
    </>
  );
}
