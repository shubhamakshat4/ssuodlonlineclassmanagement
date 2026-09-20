import { JoinButton } from '@/components/join-button';
import { Badge } from '@/components/ui/primitives';
import type { ClassSessionView } from '@/lib/db/types';
import { formatIstTime } from '@/lib/domain/time';

/** One class on a student/teacher dashboard. */
export function SessionCard({
  session,
  leadMinutes,
  joined,
  showBatch,
  actions,
}: {
  session: ClassSessionView;
  leadMinutes: number;
  joined?: boolean;
  showBatch?: boolean;
  actions?: React.ReactNode;
}) {
  const s = session;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-white p-4" data-testid={`session-${s.id}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm">
            {formatIstTime(s.scheduled_start)}–{formatIstTime(s.scheduled_end)}
          </span>
          <span className="font-medium">{s.subject_name}</span>
          {showBatch ? <Badge variant="outline">{s.batch_code}</Badge> : null}
          {s.status === 'cancelled' ? <Badge variant="destructive">Cancelled</Badge> : null}
          {s.has_override ? (
            <Badge variant="warning" data-testid="link-updated">
              Link updated
            </Badge>
          ) : null}
          {s.provider === 'custom' && s.status === 'scheduled' ? <Badge variant="secondary">Not on Teams — no recording</Badge> : null}
        </div>
        <div className="mt-1 text-sm text-muted-foreground">
          {s.teacher_name ?? 'Teacher TBA'}
          {s.topic ? ` · ${s.topic}` : ''}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {actions}
        <JoinButton sessionId={s.id} scheduledStart={s.scheduled_start} scheduledEnd={s.scheduled_end} status={s.status} leadMinutes={leadMinutes} hasUrl={Boolean(s.effective_join_url)} joined={joined} />
      </div>
    </div>
  );
}
