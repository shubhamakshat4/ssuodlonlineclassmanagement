/** Row types mirroring supabase/migrations. Hand-maintained (no generated types without a linked project). */

export type UserRole = 'student' | 'teacher' | 'admin';
export type StudentStatus = 'active' | 'on_hold' | 'withdrawn' | 'graduated';
export type SessionStatus = 'scheduled' | 'cancelled' | 'completed';
export type MeetingProvider = 'teams' | 'custom';
export type SyncStatus = 'pending' | 'provisioning' | 'provisioned' | 'failed' | 'cancelled';
export type RecordingStatus = 'available' | 'expired' | 'failed';

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string;
  email: string;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Program {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
}

export interface Batch {
  id: string;
  program_id: string;
  name: string;
  code: string;
  intake_year: number;
  current_semester: number;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
}

export interface Subject {
  id: string;
  program_id: string;
  code: string;
  name: string;
  credits: number | null;
}

export interface BatchSubject {
  id: string;
  batch_id: string;
  subject_id: string;
  semester: number;
  is_active: boolean;
}

export interface Student {
  id: string;
  /** NULL until the university issues one */
  roll_number: string | null;
  /** primary class group (programme + semester) */
  batch_id: string;
  /** optional second class group, e.g. a back semester being repeated */
  secondary_batch_id: string | null;
  status: StudentStatus;
  enrollment_no: string | null;
  intake_session: string | null;
  /** @srisriuniversity.edu.in address, NULL until the university issues one */
  college_email: string | null;
  /** the student's own address */
  personal_email: string | null;
}

/** public.v_class_groups */
export interface ClassGroupView {
  id: string;
  code: string;
  name: string;
  program_id: string;
  program_code: string;
  program_name: string;
  semester: number;
  is_active: boolean;
  primary_students: number;
  secondary_students: number;
  subjects: number;
  upcoming_sessions: number;
}

export interface Teacher {
  id: string;
  employee_code: string;
  entra_upn: string;
  entra_user_id: string | null;
  department: string | null;
}

export interface SubjectTeacher {
  id: string;
  batch_subject_id: string;
  teacher_id: string;
  is_primary: boolean;
}

export interface TimetableSlot {
  id: string;
  batch_subject_id: string;
  teacher_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
}

export interface Holiday {
  id: string;
  date: string;
  name: string;
  batch_id: string | null;
}

export interface ClassSession {
  id: string;
  batch_subject_id: string;
  teacher_id: string;
  timetable_slot_id: string | null;
  scheduled_start: string;
  scheduled_end: string;
  status: SessionStatus;
  topic: string | null;
  provider: MeetingProvider;
  graph_event_id: string | null;
  graph_online_meeting_id: string | null;
  teams_join_url: string | null;
  join_url_override: string | null;
  override_set_by: string | null;
  override_set_at: string | null;
  sync_status: SyncStatus;
  sync_attempts: number;
  sync_error: string | null;
  created_at: string;
  updated_at: string;
}

/** public.v_class_sessions */
export interface ClassSessionView extends ClassSession {
  effective_join_url: string | null;
  has_override: boolean;
  join_window_opens_at: string;
  join_window_open: boolean;
  batch_id: string;
  semester: number;
  batch_code: string;
  batch_name: string;
  subject_id: string;
  subject_code: string;
  subject_name: string;
  teacher_name: string | null;
}

export interface Attendance {
  id: string;
  class_session_id: string;
  student_id: string;
  clicked_at: string;
  ip: string | null;
  user_agent: string | null;
}

export interface Recording {
  id: string;
  class_session_id: string;
  graph_recording_id: string | null;
  drive_id: string | null;
  drive_item_id: string | null;
  recorded_at: string | null;
  duration_seconds: number | null;
  size_bytes: number | null;
  expires_at: string;
  status: RecordingStatus;
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface AppSettings {
  id: 1;
  allowed_student_domain: string;
  join_window_lead_minutes: number;
  recording_retention_days: number;
  session_generation_horizon_days: number;
  timezone: string;
}
