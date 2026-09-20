'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatCountdown, joinWindow } from '@shared/sessions.ts';

interface Props {
  sessionId: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: string;
  leadMinutes: number;
  hasUrl: boolean;
  /** already clicked earlier (attendance row exists) */
  joined?: boolean;
  label?: string;
}

/**
 * Join Now. Enabled only inside the join window (mirrors the DB trigger). On click it opens a tab
 * first (popup-blocker friendly), calls POST /api/sessions/{id}/join, then navigates that tab.
 */
export function JoinButton({ sessionId, scheduledStart, scheduledEnd, status, leadMinutes, hasUrl, joined, label }: Props) {
  const [now, setNow] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(Boolean(joined));

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!now) return <Button disabled>Join Now</Button>;
  const w = joinWindow(now, scheduledStart, scheduledEnd, leadMinutes, status);

  async function join() {
    setBusy(true);
    setError(null);
    const tab = window.open('', '_blank');
    try {
      const res = await fetch(`/api/sessions/${sessionId}/join`, { method: 'POST' });
      const body = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        tab?.close();
        setError(body.error ?? 'Could not join.');
        return;
      }
      setDone(true);
      if (tab) tab.location.href = body.url;
      else window.location.href = body.url;
    } catch {
      tab?.close();
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (w.state === 'cancelled') return <Button disabled variant="secondary">{status === 'completed' ? 'Ended' : 'Cancelled'}</Button>;
  if (w.state === 'ended') return <Button disabled variant="secondary">Class over</Button>;
  if (w.state === 'before') {
    return (
      <Button disabled variant="secondary" title={`Opens ${leadMinutes} minutes before the class`}>
        Opens in {formatCountdown(w.opensInMs)}
      </Button>
    );
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={join} disabled={busy || !hasUrl} data-testid={`join-${sessionId}`} title={hasUrl ? undefined : 'Meeting link not ready yet'}>
        {busy ? 'Opening…' : done ? (label ?? 'Rejoin') : (label ?? 'Join Now')}
      </Button>
      {!hasUrl ? <span className="text-xs text-muted-foreground">Link not ready yet</span> : null}
      {error ? <span className="max-w-56 text-right text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
