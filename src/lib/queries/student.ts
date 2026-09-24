import 'server-only';
import type { createClient } from '@/lib/supabase/server';

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface ClassGroup {
  id: string;
  code: string;
  name: string;
  semester: number;
  program_name: string;
  program_code: string;
}

export interface StudentEnrolment {
  status: string;
  roll_number: string;
  intake_session: string | null;
  enrollment_no: string | null;
  /** primary class group (programme + semester) */
  primary: ClassGroup | null;
  /** optional second group, e.g. a back semester being repeated */
  secondary: ClassGroup | null;
  groups: ClassGroup[];
}

interface Row {
  status: string;
  roll_number: string;
  intake_session: string | null;
  enrollment_no: string | null;
  batch_id: string;
  secondary_batch_id: string | null;
}

/** The signed-in student's enrolment with both class groups resolved. */
export async function studentEnrolment(supabase: Supabase, studentId: string): Promise<StudentEnrolment | null> {
  const { data } = await supabase.from('students').select('status, roll_number, intake_session, enrollment_no, batch_id, secondary_batch_id').eq('id', studentId).maybeSingle();
  const s = data as Row | null;
  if (!s) return null;

  const ids = [s.batch_id, s.secondary_batch_id].filter(Boolean) as string[];
  const { data: groupRows } = await supabase.from('v_class_groups').select('id, code, name, semester, program_name, program_code').in('id', ids);
  const byId = new Map(((groupRows ?? []) as ClassGroup[]).map((g) => [g.id, g]));
  const primary = byId.get(s.batch_id) ?? null;
  const secondary = s.secondary_batch_id ? (byId.get(s.secondary_batch_id) ?? null) : null;

  return {
    status: s.status,
    roll_number: s.roll_number,
    intake_session: s.intake_session,
    enrollment_no: s.enrollment_no,
    primary,
    secondary,
    groups: [primary, secondary].filter(Boolean) as ClassGroup[],
  };
}
