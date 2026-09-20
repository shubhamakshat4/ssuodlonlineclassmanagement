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
      <Button onClick={signIn} disabled={busy} size="lg" variant="outline" className="w-full gap-3" data-testid="google-signin">
        <GoogleGlyph />
        {busy ? 'Redirecting to Google…' : 'Continue with Google'}
      </Button>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
      <path fill="#FBBC05" d="M10.5 28.6A14.4 14.4 0 0 1 9.5 24c0-1.6.3-3.2.8-4.6l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}
