import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { toCsv } from '@/lib/domain/csv';
import { formatIst, istDate, istTime } from '@/lib/domain/time';
import { attendanceReport } from '@/lib/queries/attendance';

/** CSV export of the attendance report (long format: one row per student per class). */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const q = request.nextUrl.searchParams;
  const batchId = q.get('batch') ?? '';
  const from = q.get('from') ?? '';
  const to = q.get('to') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(batchId) || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: 'batch, from and to are required' }, { status: 400 });
  }
  const subjectId = q.get('subject') || undefined;
  const supabase = await createClient();
  const report = await attendanceReport(supabase, { batchId, subjectId, from, to });

  const rows: unknown[][] = [];
  for (const s of report.sessions) {
    for (const st of report.students) {
      const a = report.joins.get(`${s.id}:${st.id}`);
      rows.push([
        report.sessions[0]?.batch_code ?? '',
        s.subject_code,
        s.subject_name,
        istDate(new Date(s.scheduled_start)),
        istTime(new Date(s.scheduled_start)),
        istTime(new Date(s.scheduled_end)),
        s.teacher_name ?? '',
        st.roll_number,
        st.full_name,
        st.email,
        st.status,
        a ? 'Y' : 'N',
        a ? formatIst(a.clicked_at) : '',
        a?.ip ?? '',
      ]);
    }
  }
  const csv = toCsv(['batch', 'subject_code', 'subject', 'date', 'start_ist', 'end_ist', 'teacher', 'roll_number', 'student', 'email', 'enrolment_status', 'joined_from_portal', 'joined_at_ist', 'ip'], rows);
  await supabase.rpc('log_audit', { p_action: 'attendance.exported', p_entity: 'batches', p_entity_id: batchId, p_payload: { from, to, subjectId: subjectId ?? null, rows: rows.length } });
  const name = `attendance_${report.sessions[0]?.batch_code ?? batchId}_${from}_${to}.csv`;
  return new NextResponse('﻿' + csv, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' },
  });
}
