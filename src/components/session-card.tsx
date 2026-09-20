import { Clock, User } from 'lucide-react';
import { JoinButton } from '@/components/join-button';
import { Badge } from '@/components/ui/primitives';
import type { ClassSessionView } from '@/lib/db/types';
import { formatIstTime } from '@/lib/domain/time';
import { cn } from '@/lib/utils';

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
  const now = Date.now();
  const start = new Date(s.scheduled_start).getTime();
  const end = new Date(s.scheduled_end).getTime();
  const live = s.status === 'scheduled' && now >= start - leadMinutes * 60_000 && now <= end;
  const over = s.status === 'completed' || now > end;
  const cancelled = s.status === 'cancelled';

  return (
    <div
      className={cn(
        'group relative flex flex-wrap items-center gap-4 rounded-xl border bg-surface p-4 shadow-card transition-shadow hover:shadow-float',
        live ? 'border-accent/40 ring-1 ring-accent/15' : 'border-border',
        (over || cancelled) && 'opacity-80',
      )}
      data-testid={`session-${s.id}`}
    >
      {/* time column */}
      <div className={cn('flex w-24 shrink-0 flex-col rounded-lg px-3 py-2 text-center', live ? 'bg-accent-soft text-accent' : 'bg-surface-muted text-foreground/80')}>
        <span className="font-mono text-base font-semibold leading-tight">{formatIstTime(s.scheduled_start)}</span>
        <span className="font-mono text-xs text-muted-foreground">– {formatIstTime(s.scheduled_end)}</span>
      </div>

      {/* main */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {live ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent">
              <span className="live-dot inline-block h-2 w-2 rounded-full bg-accent" aria-hidden /> Live now
            </span>
          ) : null}
          <span className="truncate text-[15px] font-semibold tracking-tight">{s.subject_name}</span>
          {showBatch ? <Badge variant="outline">{s.batch_code}</Badge> : null}
          {cancelled ? <Badge variant="destructive">Cancelled</Badge> : null}
          {s.has_override ? (
            <Badge variant="warning" data-testid="link-updated">
              Link updated
            </Badge>
          ) : null}
          {s.provider === 'custom' && s.status === 'scheduled' ? <Badge variant="secondary">No recording</Badge> : null}
          {s.timetable_slot_id ? null : <Badge variant="info">Extra class</Badge>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" aria-hidden />
            {s.teacher_name ?? 'Teacher TBA'}
          </span>
          {s.topic ? (
            <span className="inline-flex items-center gap-1.5 truncate">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              {s.topic}
            </span>
          ) : null}
        </div>
      </div>

      {/* actions */}
      <div className="flex items-center gap-2">
        {actions}
        <JoinButton sessionId={s.id} scheduledStart={s.scheduled_start} scheduledEnd={s.scheduled_end} status={s.status} leadMinutes={leadMinutes} hasUrl={Boolean(s.effective_join_url)} joined={joined} />
      </div>
    </div>
  );
}
