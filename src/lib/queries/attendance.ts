import 'server-only';
import type { createClient } from '@/lib/supabase/server';
import type { Attendance, ClassSessionView, Student } from '@/lib/db/types';
import { addDays } from '@/lib/domain/time';
import { istDayStart } from '@/lib/queries/sessions';

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface ReportParams {
  batchId: string;
  subjectId?: string;
  from: string; // IST date
  to: string; // IST date, inclusive
}

export interface ReportStudent extends Student {
  full_name: string;
  email: string;
}

export interface AttendanceReport {
  params: ReportParams;
  sessions: ClassSessionView[];
  students: ReportStudent[];
  /** key `${sessionId}:${studentId}` */
  joins: Map<string, Attendance>;
}

/** Sessions of a batch (optionally one subject) in a date range, all enrolled students, and their joins. */
export async function attendanceReport(supabase: Supabase, params: ReportParams): Promise<AttendanceReport> {
  let q = supabase
    .from('v_class_sessions')
    .select('*')
    .eq('batch_id', params.batchId)
    .neq('status', 'cancelled')
    .gte('scheduled_start', istDayStart(params.from).toISOString())
    .lt('scheduled_start', istDayStart(addDays(params.to, 1)).toISOString())
    .order('scheduled_start');
  if (params.subjectId) q = q.eq('subject_id', params.subjectId);
  const [{ data: sessions }, { data: students }] = await Promise.all([
    q,
    supabase.from('students').select('*, profiles!inner(full_name, email)').eq('batch_id', params.batchId).order('roll_number'),
  ]);
  const sessionRows = (sessions ?? []) as ClassSessionView[];
  const studentRows = ((students ?? []) as (Student & { profiles: { full_name: string; email: string } })[]).map((s) => ({
    ...s,
    full_name: s.profiles.full_name,
    email: s.profiles.email,
  }));
  const joins = new Map<string, Attendance>();
  if (sessionRows.length) {
    const { data: att } = await supabase
      .from('attendance')
      .select('*')
      .in(
        'class_session_id',
        sessionRows.map((s) => s.id),
      );
    for (const a of (att ?? []) as Attendance[]) joins.set(`${a.class_session_id}:${a.student_id}`, a);
  }
  return { params, sessions: sessionRows, students: studentRows, joins };
}
