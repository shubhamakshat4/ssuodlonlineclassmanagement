'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Server-side errors are reported by instrumentation; this covers client render errors.
    console.error(JSON.stringify({ level: 'error', scope: 'client', message: error.message, digest: error.digest }));
  }, [error]);
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">The error has been logged. Please try again; if it keeps happening, tell the ODL office and quote the reference below.</p>
      {error.digest ? <code className="rounded bg-muted px-2 py-1 text-xs">{error.digest}</code> : null}
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
