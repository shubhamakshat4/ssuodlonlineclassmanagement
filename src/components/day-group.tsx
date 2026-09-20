import { SessionCard } from '@/components/session-card';
import type { ClassSessionView } from '@/lib/db/types';
import { DAY_NAMES } from '@/lib/domain/time';

/** A day of sessions with a date pill on the left — shared by student and teacher lists. */
export function DayGroup({ date, sessions, leadMinutes, showBatch, actions }: { date: string; sessions: ClassSessionView[]; leadMinutes: number; showBatch?: boolean; actions?: (s: ClassSessionView) => React.ReactNode }) {
  const d = new Date(`${date}T12:00:00+05:30`);
  const dayName = DAY_NAMES[new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)))).getUTCDay()];
  const month = d.toLocaleString('en-IN', { month: 'short', timeZone: 'Asia/Kolkata' });
  return (
    <section className="grid gap-3 sm:grid-cols-[88px_1fr]">
      <div className="flex items-center gap-3 sm:flex-col sm:items-start sm:gap-0 sm:pt-1">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{dayName.slice(0, 3)}</div>
        <div className="text-2xl font-semibold leading-none tracking-tight">{date.slice(8, 10)}</div>
        <div className="text-xs text-muted-foreground">{month}</div>
      </div>
      <div className="grid gap-3">
        {sessions.map((s) => (
          <SessionCard key={s.id} session={s} leadMinutes={leadMinutes} showBatch={showBatch} actions={actions?.(s)} />
        ))}
      </div>
    </section>
  );
}
