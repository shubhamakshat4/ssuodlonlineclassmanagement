/**
 * CSV import specifications (pure: no I/O). One spec per admin entity: the columns, how a raw row
 * is validated, and a sample template. The runner in csv-import.ts does the database work.
 */
import { z } from 'zod';
import { toCsv } from '@/lib/domain/csv';

export type EntityKey = 'programs' | 'batches' | 'subjects' | 'batch_subjects' | 'teachers' | 'subject_teachers' | 'timetable' | 'holidays' | 'students';

export interface ColumnDoc {
  name: string;
  required: boolean;
  description: string;
}

export interface CsvSpec<T> {
  key: EntityKey;
  title: string;
  /** one-line purpose */
  summary: string;
  /** shown above the column table */
  notes: string[];
  columns: ColumnDoc[];
  /** matching key used to decide "already exists" (documented for users) */
  matchOn: string;
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  sampleRows: string[][];
}

const CODE = (max: number) =>
  z
    .string()
    .trim()
    .regex(new RegExp(`^[A-Za-z0-9_-]{2,${max}}$`), `2–${max} letters, digits, - or _`)
    .transform((s) => s.toUpperCase());
const EMAIL = z.string().trim().email('must be an email address').transform((s) => s.toLowerCase());
const DATE = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD');
const TIME = z
  .string()
  .trim()
  .regex(/^\d{1,2}:\d{2}$/, 'use HH:MM (24h)')
  .transform((s) => s.padStart(5, '0'));
const OPT = <T extends z.ZodTypeAny>(s: T) => z.preprocess((v) => (v === '' || v === undefined ? undefined : v), s.optional());
const INT = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

const DAYS: Record<string, number> = { sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6 };
const DAY = z.preprocess((v) => {
  const s = String(v ?? '')
    .trim()
    .toLowerCase();
  if (/^[0-6]$/.test(s)) return Number(s);
  return DAYS[s] ?? s;
}, z.number({ invalid_type_error: 'use Mon..Sun or 0..6' }).int().min(0).max(6));

const BOOL = z.preprocess((v) => {
  const s = String(v ?? '')
    .trim()
    .toLowerCase();
  if (['', 'no', 'n', 'false', '0'].includes(s)) return false;
  if (['yes', 'y', 'true', '1'].includes(s)) return true;
  return s;
}, z.boolean({ invalid_type_error: 'use yes/no' }));

// ---------------------------------------------------------------------------

export const programsSpec: CsvSpec<{ code: string; name: string; is_active: boolean }> = {
  key: 'programs',
  title: 'Programmes',
  summary: 'Degree programmes (e.g. BBA-ODL). Import these first.',
  notes: ['A row whose code already exists updates the name and active flag.'],
  matchOn: 'code',
  columns: [
    { name: 'code', required: true, description: 'Short unique code, letters/digits/-/_ (e.g. BBA-ODL)' },
    { name: 'name', required: true, description: 'Full programme name' },
    { name: 'is_active', required: false, description: 'yes / no (default yes)' },
  ],
  schema: z.object({ code: CODE(20), name: z.string().trim().min(2), is_active: OPT(BOOL).transform((v) => v ?? true) }),
  sampleRows: [
    ['BBA-ODL', 'Bachelor of Business Administration (ODL)', 'yes'],
    ['MBA-ODL', 'Master of Business Administration (ODL)', 'yes'],
  ],
};

export const batchesSpec: CsvSpec<{ code: string; name: string; program_code: string; intake_year: number; current_semester: number; start_date?: string; end_date?: string; is_active: boolean }> = {
  key: 'batches',
  title: 'Batches',
  summary: 'Intake cohorts of a programme. Needs programmes to exist.',
  notes: ['A row whose code already exists is updated.', 'program_code must match an imported programme.'],
  matchOn: 'code',
  columns: [
    { name: 'code', required: true, description: 'Unique batch code (e.g. BBA-ODL-2026)' },
    { name: 'name', required: true, description: 'Display name' },
    { name: 'program_code', required: true, description: 'Programme code' },
    { name: 'intake_year', required: true, description: 'e.g. 2026' },
    { name: 'current_semester', required: false, description: '1–12 (default 1)' },
    { name: 'start_date', required: false, description: 'YYYY-MM-DD' },
    { name: 'end_date', required: false, description: 'YYYY-MM-DD' },
    { name: 'is_active', required: false, description: 'yes / no (default yes)' },
  ],
  schema: z.object({
    code: CODE(30),
    name: z.string().trim().min(2),
    program_code: CODE(20),
    intake_year: INT(2000, 2100),
    current_semester: OPT(INT(1, 12)).transform((v) => v ?? 1),
    start_date: OPT(DATE),
    end_date: OPT(DATE),
    is_active: OPT(BOOL).transform((v) => v ?? true),
  }),
  sampleRows: [
    ['BBA-ODL-2026', 'BBA ODL 2026 intake', 'BBA-ODL', '2026', '1', '2026-07-01', '2029-06-30', 'yes'],
    ['MBA-ODL-2026', 'MBA ODL 2026 intake', 'MBA-ODL', '2026', '1', '2026-07-01', '2028-06-30', 'yes'],
  ],
};

export const subjectsSpec: CsvSpec<{ program_code: string; code: string; name: string; credits?: number }> = {
  key: 'subjects',
  title: 'Subjects',
  summary: 'Subjects belong to a programme. Needs programmes to exist.',
  notes: ['A row whose programme + code already exists is updated.'],
  matchOn: 'program_code + code',
  columns: [
    { name: 'program_code', required: true, description: 'Programme code' },
    { name: 'code', required: true, description: 'Subject code, unique within the programme (e.g. BBA101)' },
    { name: 'name', required: true, description: 'Subject name' },
    { name: 'credits', required: false, description: '0–20' },
  ],
  schema: z.object({ program_code: CODE(20), code: CODE(20), name: z.string().trim().min(2), credits: OPT(INT(0, 20)) }),
  sampleRows: [
    ['BBA-ODL', 'BBA101', 'Principles of Management', '4'],
    ['BBA-ODL', 'BBA102', 'Business Communication', '3'],
  ],
};

export const batchSubjectsSpec: CsvSpec<{ batch_code: string; subject_code: string; semester: number; is_active: boolean }> = {
  key: 'batch_subjects',
  title: 'Batch subjects (offerings)',
  summary: 'Which subject a batch studies in which semester. Needs batches and subjects.',
  notes: ['The subject must belong to the batch’s programme.', 'Existing batch + subject + semester rows are skipped.'],
  matchOn: 'batch_code + subject_code + semester',
  columns: [
    { name: 'batch_code', required: true, description: 'Batch code' },
    { name: 'subject_code', required: true, description: 'Subject code (from the batch’s programme)' },
    { name: 'semester', required: true, description: '1–12' },
    { name: 'is_active', required: false, description: 'yes / no (default yes)' },
  ],
  schema: z.object({ batch_code: CODE(30), subject_code: CODE(20), semester: INT(1, 12), is_active: OPT(BOOL).transform((v) => v ?? true) }),
  sampleRows: [
    ['BBA-ODL-2026', 'BBA101', '1', 'yes'],
    ['BBA-ODL-2026', 'BBA102', '1', 'yes'],
  ],
};

export const teachersSpec: CsvSpec<{ employee_code: string; full_name: string; email: string; entra_upn: string; department?: string; phone?: string }> = {
  key: 'teachers',
  title: 'Teachers',
  summary: 'Creates the faculty login (invite email) and profile.',
  notes: [
    'Each new row creates an account and sends a "set your password" email; the teacher must set a 12-character password on first sign-in.',
    'Rows whose email already exists are skipped (edit them on the Teachers page).',
    'entra_upn is the teacher’s Microsoft 365 sign-in, used to add them as Teams co-organiser.',
  ],
  matchOn: 'email',
  columns: [
    { name: 'employee_code', required: true, description: 'Unique staff code (e.g. T010)' },
    { name: 'full_name', required: true, description: 'Name as shown to students' },
    { name: 'email', required: true, description: 'Login email (receives the invite)' },
    { name: 'entra_upn', required: true, description: 'Microsoft 365 UPN (e.g. name@srisriuniversity.onmicrosoft.com)' },
    { name: 'department', required: false, description: 'Free text' },
    { name: 'phone', required: false, description: 'Free text' },
  ],
  schema: z.object({
    employee_code: z.string().trim().min(1).transform((s) => s.toUpperCase()),
    full_name: z.string().trim().min(2),
    email: EMAIL,
    entra_upn: EMAIL,
    department: OPT(z.string().trim()),
    phone: OPT(z.string().trim()),
  }),
  sampleRows: [
    ['T010', 'Dr. Meera Krishnan', 'meera.krishnan@srisriuniversity.edu.in', 'meera.krishnan@srisriuniversity.onmicrosoft.com', 'Management', '+91 90000 00010'],
    ['T011', 'Prof. Arjun Sethi', 'arjun.sethi@srisriuniversity.edu.in', 'arjun.sethi@srisriuniversity.onmicrosoft.com', 'Finance', ''],
  ],
};

export const subjectTeachersSpec: CsvSpec<{ batch_code: string; subject_code: string; teacher_email: string; is_primary: boolean }> = {
  key: 'subject_teachers',
  title: 'Teacher assignments',
  summary: 'Who teaches which subject for which batch. Needs batch subjects and teachers.',
  notes: ['Existing assignments are skipped.', 'teacher_email is the teacher’s login email.'],
  matchOn: 'batch_code + subject_code + teacher_email',
  columns: [
    { name: 'batch_code', required: true, description: 'Batch code' },
    { name: 'subject_code', required: true, description: 'Subject code' },
    { name: 'teacher_email', required: true, description: 'Teacher login email' },
    { name: 'is_primary', required: false, description: 'yes / no (default yes)' },
  ],
  schema: z.object({ batch_code: CODE(30), subject_code: CODE(20), teacher_email: EMAIL, is_primary: OPT(BOOL).transform((v) => v ?? true) }),
  sampleRows: [
    ['BBA-ODL-2026', 'BBA101', 'meera.krishnan@srisriuniversity.edu.in', 'yes'],
    ['BBA-ODL-2026', 'BBA102', 'arjun.sethi@srisriuniversity.edu.in', 'yes'],
  ],
};

export const timetableSpec: CsvSpec<{ batch_code: string; subject_code: string; teacher_email: string; day: number; start_time: string; end_time: string; effective_from: string; effective_to?: string }> = {
  key: 'timetable',
  title: 'Timetable slots',
  summary: 'Weekly recurring classes. Needs batch subjects and teachers.',
  notes: [
    'Times are IST, 24-hour (e.g. 18:00). Day accepts Mon/Tue/... or 0–6 (0 = Sunday).',
    'A slot that clashes with an existing one (same teacher or same batch at an overlapping time) is rejected and reported.',
    'An identical slot (same batch subject, teacher, day, start time and start date) is skipped.',
    'Sessions are generated nightly from these slots for the next 21 days (or use "Generate sessions now").',
  ],
  matchOn: 'batch_code + subject_code + teacher_email + day + start_time + effective_from',
  columns: [
    { name: 'batch_code', required: true, description: 'Batch code' },
    { name: 'subject_code', required: true, description: 'Subject code (must be offered to the batch)' },
    { name: 'teacher_email', required: true, description: 'Teacher login email' },
    { name: 'day', required: true, description: 'Mon, Tue, Wed, Thu, Fri, Sat, Sun (or 1..6, 0)' },
    { name: 'start_time', required: true, description: 'HH:MM IST' },
    { name: 'end_time', required: true, description: 'HH:MM IST, after start' },
    { name: 'effective_from', required: true, description: 'YYYY-MM-DD first date the slot applies' },
    { name: 'effective_to', required: false, description: 'YYYY-MM-DD last date (blank = open-ended)' },
  ],
  schema: z
    .object({
      batch_code: CODE(30),
      subject_code: CODE(20),
      teacher_email: EMAIL,
      day: DAY,
      start_time: TIME,
      end_time: TIME,
      effective_from: DATE,
      effective_to: OPT(DATE),
    })
    .refine((r) => r.end_time > r.start_time, { message: 'end_time must be after start_time', path: ['end_time'] })
    .refine((r) => !r.effective_to || r.effective_to >= r.effective_from, { message: 'effective_to must be on/after effective_from', path: ['effective_to'] }),
  sampleRows: [
    ['BBA-ODL-2026', 'BBA101', 'meera.krishnan@srisriuniversity.edu.in', 'Mon', '18:00', '19:00', '2026-07-01', ''],
    ['BBA-ODL-2026', 'BBA102', 'arjun.sethi@srisriuniversity.edu.in', 'Wed', '18:00', '19:00', '2026-07-01', '2026-12-31'],
  ],
};

export const holidaysSpec: CsvSpec<{ date: string; name: string; batch_code?: string }> = {
  key: 'holidays',
  title: 'Holidays',
  summary: 'No sessions are generated on these dates.',
  notes: ['Leave batch_code empty for a holiday that applies to every batch.', 'An existing date (for the same batch / all batches) is updated with the new name.'],
  matchOn: 'date + batch_code',
  columns: [
    { name: 'date', required: true, description: 'YYYY-MM-DD' },
    { name: 'name', required: true, description: 'Holiday name' },
    { name: 'batch_code', required: false, description: 'Batch code, or empty for all batches' },
  ],
  schema: z.object({ date: DATE, name: z.string().trim().min(2), batch_code: OPT(CODE(30)) }),
  sampleRows: [
    ['2026-10-02', 'Gandhi Jayanti', ''],
    ['2026-11-08', 'Study break', 'MBA-ODL-2025'],
  ],
};

export const studentsSpec: CsvSpec<{
  roll_number?: string;
  full_name: string;
  college_email?: string;
  personal_email?: string;
  phone?: string;
  batch_code: string;
  secondary_batch_code?: string;
  status: 'active' | 'on_hold' | 'withdrawn' | 'graduated';
}> = {
  key: 'students',
  title: 'Students',
  summary: 'Creates student records mapped to a class group, with the first-login password.',
  notes: [
    'Give college_email, personal_email, or both. Leave a column empty when you do not have it - do not invent an address.',
    'The student signs in with the college email when there is one, otherwise with the personal email.',
    'New students get the standard first-login password and are asked to choose their own when they sign in.',
    'roll_number is optional: leave it empty for admissions the university has not issued one for yet.',
    'A row whose login email already exists but is not yet mapped is mapped (roll number + group); a fully mapped student is skipped.',
    'secondary_batch_code is for a student who also attends another semester (e.g. repeating a missed one). Leave it empty otherwise.',
    'status: active, on_hold, withdrawn, graduated (default active).',
  ],
  matchOn: 'college_email, else personal_email',
  columns: [
    { name: 'full_name', required: true, description: 'Student name' },
    { name: 'college_email', required: false, description: 'University address, e.g. @srisriuniversity.edu.in. Empty if none has been issued' },
    { name: 'personal_email', required: false, description: "The student's own address. Becomes the login when there is no college email" },
    { name: 'roll_number', required: false, description: 'University roll number, if issued' },
    { name: 'phone', required: false, description: 'Free text' },
    { name: 'batch_code', required: true, description: 'Primary class group, e.g. BBA-S1 (programme + semester)' },
    { name: 'secondary_batch_code', required: false, description: 'Optional second class group the student also attends, e.g. a back semester' },
    { name: 'status', required: false, description: 'active / on_hold / withdrawn / graduated' },
  ],
  schema: z
    .object({
      full_name: z.string().trim().min(2),
      college_email: OPT(EMAIL),
      personal_email: OPT(EMAIL),
      roll_number: OPT(z.string().trim().min(2).transform((s) => s.toUpperCase())),
      phone: OPT(z.string().trim()),
      batch_code: CODE(30),
      secondary_batch_code: OPT(CODE(30)),
      status: OPT(z.enum(['active', 'on_hold', 'withdrawn', 'graduated'])).transform((v) => v ?? 'active'),
    })
    .refine((r) => Boolean(r.college_email || r.personal_email), { message: 'give college_email, personal_email, or both' }),
  sampleRows: [
    ['Nikhil Rao', 'nikhil.rao.odl26@srisriuniversity.edu.in', 'nikhil.rao@gmail.com', 'ODL26BBA010', '+91 98000 00010', 'BBA-S1', '', 'active'],
    ['Priya Menon', '', 'priya.menon88@gmail.com', '', '', 'BBA-S1', '', 'active'],
    ['Arun Das', 'arun.das.odl25@srisriuniversity.edu.in', '', 'ODL25BBA011', '', 'BBA-S2', 'BBA-S1', 'active'],
  ],
};

/** Recommended import order. */
export const SPECS = [programsSpec, batchesSpec, subjectsSpec, batchSubjectsSpec, teachersSpec, subjectTeachersSpec, timetableSpec, holidaysSpec, studentsSpec] as const;

export function specFor(key: string): (typeof SPECS)[number] | undefined {
  return SPECS.find((s) => s.key === key);
}

/** Header + sample rows as CSV text (UTF-8, CRLF, no BOM — Excel and Sheets both open it). */
export function templateCsv(spec: (typeof SPECS)[number]): string {
  return toCsv(
    spec.columns.map((c) => c.name),
    spec.sampleRows.map((r) => [...r]),
  );
}

export interface RowIssue {
  line: number;
  message: string;
}

/** Validate parsed CSV objects against a spec. Pure; returns typed rows and per-line issues. */
export function validateRows<T>(spec: CsvSpec<T>, headers: string[], rows: Record<string, string>[]): { ok: T[]; issues: RowIssue[]; lineOf: (i: number) => number } {
  const issues: RowIssue[] = [];
  const missing = spec.columns.filter((c) => c.required && !headers.includes(c.name)).map((c) => c.name);
  if (missing.length) {
    issues.push({ line: 1, message: `Missing required column(s): ${missing.join(', ')}. Expected header: ${spec.columns.map((c) => c.name).join(',')}` });
    return { ok: [], issues, lineOf: (i) => i + 2 };
  }
  const ok: T[] = [];
  const okLines: number[] = [];
  rows.forEach((raw, i) => {
    const line = i + 2;
    const parsed = spec.schema.safeParse(raw);
    if (parsed.success) {
      ok.push(parsed.data);
      okLines.push(line);
    } else {
      issues.push({ line, message: parsed.error.issues.map((x) => `${x.path.join('.') || 'row'}: ${x.message}`).join('; ') });
    }
  });
  return { ok, issues, lineOf: (i) => okLines[i] ?? i + 2 };
}
