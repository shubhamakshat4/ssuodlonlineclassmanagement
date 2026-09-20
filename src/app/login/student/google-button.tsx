'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/primitives';
import { createClient } from '@/lib/supabase/client';
import { safeNextPath } from '@/lib/auth/routing';

export function GoogleSignInButton({ next, hostedDomain, initialError }: { next: string; hostedDomain: string; initialError?: string }) {
  const [error, setError] = useState<string | undefined>(initialError);
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    setError(undefined);
    const supabase = createClient();
    const target = safeNextPath(next, '/student');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(target)}`,
        // `hd` is a hint for the Google account chooser only; the domain is enforced server-side.
        queryParams: { hd: hostedDomain, prompt: 'select_account' },
      },
    });
    if (error) {
      setError(error.message);
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3">
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <Button onClick={signIn} disabled={busy} size="lg" data-testid="google-signin">
        {busy ? 'Redirecting to Google…' : 'Continue with Google'}
      </Button>
    </div>
  );
}
