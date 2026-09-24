'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { joinWindow } from '@shared/sessions.ts';
import { formatIstTime } from '@/lib/domain/time';

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
 * Join Now. The button stays available at all times so students always know where to click; when the
 * class has not opened yet, pressing it explains when it will (the server enforces the window either
 * way — see the attendance trigger). Ended and cancelled classes are the only disabled states.
 */
export function JoinButton({ sessionId, scheduledStart, scheduledEnd, status, leadMinutes, hasUrl, joined, label }: Props) {
  const [now, setNow] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(Boolean(joined));

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!now) {
    return (
      <Button variant="accent" className="min-w-32" disabled>
        <Video className="h-4 w-4" aria-hidden />
        Join Now
      </Button>
    );
  }

  const w = joinWindow(now, scheduledStart, scheduledEnd, leadMinutes, status);

  async function join() {
    // Not open yet: say when, rather than silently doing nothing.
    if (w.state === 'before') {
      setError(null);
      setNote(`This class starts at ${formatIstTime(scheduledStart)}. You can join from ${formatIstTime(w.opensAt.toISOString())} — ${leadMinutes} minutes before the scheduled time.`);
      return;
    }
    setBusy(true);
    setNote(null);
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

  if (w.state === 'cancelled') {
    return (
      <Button disabled variant="secondary" className="min-w-32">
        {status === 'completed' ? 'Ended' : 'Cancelled'}
      </Button>
    );
  }
  if (w.state === 'ended') {
    return (
      <Button disabled variant="secondary" className="min-w-32">
        Class over
      </Button>
    );
  }

  const open = w.state === 'open';
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        onClick={join}
        disabled={busy || (open && !hasUrl)}
        variant={open ? 'accent' : 'outline'}
        className="min-w-32"
        data-testid={`join-${sessionId}`}
        title={open ? undefined : `Opens ${leadMinutes} minutes before the class`}
      >
        {done ? <ExternalLink className="h-4 w-4" aria-hidden /> : <Video className="h-4 w-4" aria-hidden />}
        {busy ? 'Opening…' : done ? (label ?? 'Rejoin') : (label ?? 'Join Now')}
      </Button>
      {open && !hasUrl ? <span className="text-xs text-muted-foreground">Link not ready yet</span> : null}
      {note ? (
        <span className="max-w-64 text-right text-xs text-muted-foreground" data-testid="join-note">
          {note}
        </span>
      ) : null}
      {error ? <span className="max-w-64 text-right text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
