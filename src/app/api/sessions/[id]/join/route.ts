import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import type { ClassSessionView } from '@/lib/db/types';
import { LIMITS, rateLimit } from '@/lib/rate-limit';

/**
 * POST /api/sessions/{id}/join  (SPEC §10)
 * Student: insert the attendance row (upsert; the DB trigger enforces enrolment + join window),
 *          then return the effective join URL. Teacher/admin: just return the URL.
 * Runs with the caller's session so RLS applies; the service role is never used here.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Invalid session id' }, { status: 400 });

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await rateLimit(`join:${user.id}`, LIMITS.join.limit, LIMITS.join.windowSeconds))) {
    return NextResponse.json({ error: 'Too many attempts. Please wait a minute and try again.' }, { status: 429, headers: { 'Retry-After': '60' } });
  }

  const supabase = await createClient();
  const { data: session } = await supabase.from('v_class_sessions').select('*').eq('id', id).maybeSingle();
  const s = session as ClassSessionView | null;
  if (!s) return NextResponse.json({ error: 'Class not found' }, { status: 404 });

  if (user.role === 'student') {
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = (forwarded ? forwarded.split(',')[0] : request.headers.get('x-real-ip'))?.trim() || null;
    const userAgent = request.headers.get('user-agent')?.slice(0, 500) ?? null;

    const { error } = await supabase
      .from('attendance')
      .upsert({ class_session_id: id, student_id: user.id, ip, user_agent: userAgent }, { onConflict: 'class_session_id,student_id', ignoreDuplicates: true });
    if (error) {
      // Trigger / RLS messages are written for humans; pass them through.
      const message = error.message.replace(/^.*?:\s*/, '');
      const status = /window|cancelled|completed/i.test(message) ? 409 : 403;
      return NextResponse.json({ error: message }, { status });
    }
  } else if (user.role === 'teacher' && s.teacher_id !== user.id) {
    return NextResponse.json({ error: 'Not your class' }, { status: 403 });
  }

  if (!s.effective_join_url) {
    return NextResponse.json({ error: 'The meeting link is not ready yet. Please try again in a few minutes.' }, { status: 409 });
  }
  return NextResponse.json({ url: s.effective_join_url, recorded: user.role === 'student' });
}
