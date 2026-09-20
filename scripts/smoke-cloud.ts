/**
 * Smoke test against the live Supabase project using only the public URL + anon key:
 * real GoTrue password sign-in, real PostgREST queries (the same embeds the pages use), real RLS.
 *   npm run smoke:cloud
 */
import './_env';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
};

async function signIn(email: string, password: string) {
  const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`${email}: ${error.message}`);
  return { c, user: data.user! };
}

async function main() {
  // ---- anon -----------------------------------------------------------------
  const pub = createClient(url, anon);
  const anonRows = await pub.from('v_class_sessions').select('id').limit(5);
  check('anon sees no sessions', !anonRows.error && (anonRows.data?.length ?? 0) === 0, anonRows.error?.message);

  // ---- admin ----------------------------------------------------------------
  const admin = await signIn('odl.admin@srisriuniversity.edu.in', 'AdminPass12345');
  const prof = await admin.c.from('profiles').select('role').eq('id', admin.user.id).single();
  check('admin password login + profile', prof.data?.role === 'admin', prof.error?.message);
  const students = await admin.c.from('students').select('*, profiles!inner(full_name, email, is_active)').order('roll_number');
  check('admin students embed (profiles!inner)', !students.error && (students.data?.length ?? 0) >= 17, students.error?.message ?? `${students.data?.length} rows`);
  const sessions = await admin.c.from('v_class_sessions').select('*').gt('scheduled_end', new Date().toISOString()).order('scheduled_start');
  check('admin upcoming sessions via view', !sessions.error && (sessions.data?.length ?? 0) >= 30, sessions.error?.message ?? `${sessions.data?.length} rows`);
  const att = await admin.c.from('attendance').select('*, class_sessions!inner(scheduled_start, batch_subjects!inner(subjects!inner(name)))').limit(3);
  check('attendance nested embed', !att.error && (att.data?.length ?? 0) > 0, att.error?.message);
  const slots = await admin.c.from('timetable_slots').select('*, batch_subjects!inner(batch_id)').eq('is_active', true);
  check('timetable slots embed', !slots.error && (slots.data?.length ?? 0) === 11, slots.error?.message ?? `${slots.data?.length} rows`);
  const counts = await admin.c.from('class_sessions').select('id', { count: 'exact', head: true }).eq('sync_status', 'failed');
  check('head count query', !counts.error && counts.count === 1, counts.error?.message ?? `count=${counts.count}`);
  const auditRpc = await admin.c.rpc('log_audit', { p_action: 'smoke.test', p_entity: 'profiles', p_entity_id: admin.user.id, p_payload: { ok: true } });
  check('log_audit rpc', !auditRpc.error, auditRpc.error?.message);

  // ---- teacher --------------------------------------------------------------
  const teacher = await signIn('anand.mishra@srisriuniversity.edu.in', 'TeacherPass12345');
  const mine = await teacher.c.from('v_class_sessions').select('id, teacher_id').limit(50);
  check('teacher sees only own sessions', !mine.error && (mine.data?.length ?? 0) > 0 && mine.data!.every((s) => s.teacher_id === teacher.user.id), mine.error?.message);
  const target = (await teacher.c.from('v_class_sessions').select('id').eq('teacher_id', teacher.user.id).eq('status', 'scheduled').gt('scheduled_end', new Date().toISOString()).order('scheduled_start').limit(1)).data?.[0];
  const ov = await teacher.c.from('class_sessions').update({ join_url_override: 'https://meet.google.com/smoke-test-link' }).eq('id', target!.id).select('provider, teams_join_url, override_set_by').single();
  check('teacher override trigger side effects', ov.data?.provider === 'custom' && ov.data?.teams_join_url === null && ov.data?.override_set_by === teacher.user.id, ov.error?.message);
  const bad = await teacher.c.from('class_sessions').update({ join_url_override: 'http://insecure' }).eq('id', target!.id).select('id');
  check('teacher non-https override rejected', !!bad.error, bad.error?.message.slice(0, 60));
  const esc = await teacher.c.from('class_sessions').update({ status: 'cancelled' }).eq('id', target!.id).select('id');
  check('teacher cannot cancel', !!esc.error, esc.error?.message.slice(0, 60));
  const revert = await teacher.c.from('class_sessions').update({ join_url_override: null }).eq('id', target!.id).select('provider, sync_status').single();
  check('teacher revert re-queues', revert.data?.provider === 'teams' && revert.data?.sync_status === 'pending', revert.error?.message);
  // put the demo placeholder back so the demo stays tidy
  await admin.c.from('class_sessions').update({ teams_join_url: `https://teams.microsoft.com/l/meetup-join/demo/${target!.id.replace(/-/g, '').slice(0, 12)}`, sync_status: 'provisioned' }).eq('id', target!.id);
  const roster = await teacher.c.from('students').select('id, profiles!inner(full_name)').limit(50);
  check('teacher roster (batches taught only)', !roster.error && (roster.data?.length ?? 0) > 0 && (roster.data?.length ?? 0) < 17, roster.error?.message ?? `${roster.data?.length} rows`);

  // ---- student (magic link needs the service key; use the DB-level checks instead) -----------
  const other = await signIn('kavita.sen@srisriuniversity.edu.in', 'TeacherPass12345');
  const notMine = await other.c.from('v_class_sessions').select('id').eq('id', target!.id);
  check('colleague cannot see the session', !notMine.error && notMine.data?.length === 0, notMine.error?.message);

  console.log(failures === 0 ? '\nALL CLOUD SMOKE CHECKS PASSED' : `\n${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => {
  console.error('SMOKE FAILED:', e.message);
  process.exit(1);
});
