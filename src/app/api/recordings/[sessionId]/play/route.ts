import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { publicEnv } from '@/lib/env';
import { LIMITS, rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * GET /api/recordings/{sessionId}/play
 *
 * Browsers cannot attach the Supabase JWT to a plain navigation, so this route forwards the caller's
 * access token to the `recording-play` Edge Function, which does the authorisation and the Graph call.
 *
 * The function answers in one of two ways, and both have to be relayed:
 *   302  the recording is a OneDrive item - follow the short-lived download URL
 *   200/206  the bytes themselves, which is what Graph gives when the service account has no OneDrive
 *
 * This route used to handle only the redirect, so a perfectly good video came back as a 502 and the
 * player sat there buffering nothing. The body is now streamed through, with Range passed both ways so
 * seeking works.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return NextResponse.json({ error: 'Invalid session id' }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const range = request.headers.get('range');
  // The limit is on starting playback, not on the dozens of range requests a player makes while
  // seeking through one video - those are the same authorised stream continuing.
  if (!range && !(await rateLimit(`play:${session.user.id}`, LIMITS.play.limit, LIMITS.play.windowSeconds))) {
    return NextResponse.json({ error: 'Too many playback requests. Please wait a minute.' }, { status: 429, headers: { 'Retry-After': '60' } });
  }

  const fnUrl = `${publicEnv.supabaseUrl}/functions/v1/recording-play?session_id=${encodeURIComponent(sessionId)}`;
  const res = await fetch(fnUrl, {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: publicEnv.supabaseAnonKey,
      ...(range ? { Range: range } : {}),
    },
    redirect: 'manual',
    cache: 'no-store',
  });

  if (res.status === 301 || res.status === 302 || res.status === 307) {
    const location = res.headers.get('location');
    if (location) return NextResponse.redirect(location, { status: 302, headers: { 'Cache-Control': 'no-store' } });
  }

  if (res.ok && res.body) {
    const headers = new Headers({ 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' });
    for (const h of ['content-type', 'content-length', 'content-range']) {
      const v = res.headers.get(h);
      if (v) headers.set(h, v);
    }
    if (!headers.has('content-type')) headers.set('content-type', 'video/mp4');
    return new NextResponse(res.body, { status: res.status, headers });
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
