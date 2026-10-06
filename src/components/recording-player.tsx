import Link from 'next/link';
import { Alert, Badge } from '@/components/ui/primitives';
import { recordingDaysRemaining } from '@shared/sessions.ts';

/**
 * Inline player, shared by the student, faculty and admin pages.
 *
 * The <video> element requests /api/recordings/{id}/play, which hands off to the recording-play Edge
 * Function. Who may watch is decided there by the same RLS policy the pages use - an enrolled student
 * while it lasts, the teacher of that class, or an admin - so there is one rule, not three.
 */
export function RecordingPlayer({ sessionId, expiresAt, durationSeconds, backHref, backLabel }: {
  sessionId: string;
  expiresAt: string;
  durationSeconds?: number | null;
  backHref: string;
  backLabel: string;
}) {
  const src = `/api/recordings/${sessionId}/play`;
  const days = recordingDaysRemaining(new Date(), expiresAt);

  return (
    <div className="grid gap-4">
      <video controls preload="metadata" className="w-full max-w-4xl rounded-lg bg-black" src={src} data-testid="recording-video">
        Your browser cannot play this video.{' '}
        <a href={src} target="_blank" rel="noreferrer">
          Open it directly
        </a>
        .
      </video>
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <Badge variant={days <= 3 ? 'warning' : 'secondary'}>{days <= 0 ? 'Expires today' : `${days} day${days === 1 ? '' : 's'} left`}</Badge>
        {durationSeconds ? <span>{Math.round(durationSeconds / 60)} minutes</span> : null}
        <Link href={backHref} className="font-medium text-primary hover:underline">
          {backLabel}
        </Link>
      </div>
      <Alert>Recordings are streamed from the university&apos;s Microsoft 365. They are never copied or re-hosted, and they disappear when the retention period ends.</Alert>
    </div>
  );
}
