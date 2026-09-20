import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { publicEnv } from '@/lib/env';

/**
 * GET /api/recordings/{sessionId}/play
 * Browsers cannot attach the Supabase JWT to a plain navigation, so this route forwards the
 * caller's access token to the `recording-play` Edge Function (which does the authorisation and
 * the Graph call) and relays its 302. Nothing is cached; the download URL is short-lived.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return NextResponse.json({ error: 'Invalid session id' }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const fnUrl = `${publicEnv.supabaseUrl}/functions/v1/recording-play?session_id=${encodeURIComponent(sessionId)}`;
  const res = await fetch(fnUrl, {
    headers: { Authorization: `Bearer ${session.access_token}`, apikey: publicEnv.supabaseAnonKey },
    redirect: 'manual',
    cache: 'no-store',
  });

  if (res.status === 302 || res.status === 301 || res.status === 307) {
    const location = res.headers.get('location');
    if (location) return NextResponse.redirect(location, { status: 302, headers: { 'Cache-Control': 'no-store' } });
  }
  const body = await res.text();
  let message = body;
  try {
    message = (JSON.parse(body) as { error?: string }).error ?? body;
  } catch {
    /* plain text */
  }
  return NextResponse.json({ error: message || `Playback failed (${res.status})` }, { status: res.status >= 400 ? res.status : 502 });
}
