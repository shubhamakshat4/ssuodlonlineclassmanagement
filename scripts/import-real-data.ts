/**
 * Load the real ODL data from the workbooks in docs/ into the database.
 *
 *   npm run data:import            dry run — parses everything, prints a summary, writes nothing
 *   npm run data:import -- --apply clears demo data and writes the real data
 *
 * Sources
 *   docs/ODL Sunday Online Timetable.xlsx        programmes, semesters, subjects, faculty, 331 dated classes
 *   docs/Master Enrollment ... Feb 2025 ...      per-programme sheets (roll no + SSU email)
 *   docs/Master Enrollment ... Aug 2025 ...      master sheet (roll no + SSU email)
 *   docs/Master Enrollment ... Feb 2026 ...      master sheet (roll no + SSU email)
 *   docs/August 2026 Batch - 1st Sem <prog> ...  new admissions (no roll no / SSU email yet)
 *
 * Model: a "class group" (batches row) is a programme + semester, e.g. BBA-S4. The intake session the
 * student was admitted in is kept on the student record. Timetable rows become dated class_sessions.
 */
import './_env';
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import XLSX from 'xlsx';
import { zonedTimeToUtc } from '../supabase/functions/_shared/time.ts';

const DOCS = path.resolve('docs');
const TZ = 'Asia/Kolkata';
const APPLY = process.argv.includes('--apply');

// ---------------------------------------------------------------------------
// Programmes
// ---------------------------------------------------------------------------
interface Prog { code: string; name: string; level: 'UG' | 'PG'; timetableLabel: string; rollTag: string }
const PROGRAMS: Prog[] = [
  { code: 'BBA', name: 'Bachelor of Business Administration (ODL)', level: 'UG', timetableLabel: 'BBA', rollTag: 'BBA' },
  { code: 'BCOM', name: 'Bachelor of Commerce (ODL)', level: 'UG', timetableLabel: 'B.Com', rollTag: 'BCM' },
  { code: 'MBA', name: 'Master of Business Administration (ODL)', level: 'PG', timetableLabel: 'MBA', rollTag: 'MBA' },
  { code: 'MAY', name: 'Master of Arts (Yoga) (ODL)', level: 'PG', timetableLabel: 'MA Yoga', rollTag: 'MAY' },
  { code: 'MHS', name: 'Master of Arts (Hindu Studies) (ODL)', level: 'PG', timetableLabel: 'MA Hindu Studies', rollTag: 'MHS' },
  { code: 'MOD', name: 'Master of Performing Arts (Odissi Dance) (ODL)', level: 'PG', timetableLabel: 'MPA Odissi Dance', rollTag: 'MOD' },
];
const byTimetableLabel = new Map(PROGRAMS.map((p) => [p.timetableLabel, p]));

/** "MASTER OF ARTS (YOGA)" / sheet names / course-code prefixes -> programme code */
function programFromText(raw: string): string | null {
  const s = raw.toUpperCase();
  if (/HINDU/.test(s)) return 'MHS';
  if (/YOGA/.test(s)) return 'MAY';
  if (/ODISSI|PERFORMING/.test(s)) return 'MOD';
  if (/BUSINESS ADMINISTRATION/.test(s)) return /MASTER/.test(s) ? 'MBA' : 'BBA';
  if (/\bMBA\b/.test(s)) return 'MBA';
  if (/\bBBA\b/.test(s)) return 'BBA';
  if (/COMMERCE|B\.?COM/.test(s)) return 'BCOM';
  return null;
}
/** Admission session -> semester being studied in the Sep–Dec 2026 term. */
const SESSION_SEMESTER: Record<string, number> = { 'feb-2025': 4, 'aug-2025': 3, 'feb-2026': 2, 'aug-2026': 1 };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const clean = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
const excelDate = (n: number) => new Date(Date.UTC(1899, 11, 30 + Number(n))).toISOString().slice(0, 10);

function parseTimeRange(raw: string): { start: string; end: string } | null {
  const m = clean(raw).match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*[–\-—]\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return null;
  const to24 = (h: string, min: string, ap: string) => {
    let hh = Number(h) % 12;
    if (/pm/i.test(ap)) hh += 12;
    return `${String(hh).padStart(2, '0')}:${min}`;
  };
  return { start: to24(m[1], m[2], m[3]), end: to24(m[4], m[5], m[6]) };
}

/** "Dr. Ravish Mathew, Asst. Prof." -> { name, designation } */
function parseFaculty(raw: string) {
  const full = clean(raw);
  const [namePart, ...rest] = full.split(',');
  return { full, name: clean(namePart), designation: clean(rest.join(',')) || null };
}

/** Deterministic placeholder login for faculty until IT supplies the real addresses. */
function facultyEmail(name: string, taken: Set<string>) {
  const base = name
    .replace(/^(dr|prof|mr|ms|mrs|guru)\.?\s+/i, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join('.');
  let email = `${base || 'faculty'}@srisriuniversity.edu.in`;
  let n = 2;
  while (taken.has(email)) email = `${base}${n++}@srisriuniversity.edu.in`;
  taken.add(email);
  return email;
}

function studentEmail(ssu: string, personal: string, name: string, rollOrSeq: string, taken: Set<string>) {
  const ssuClean = clean(ssu).toLowerCase();
  if (ssuClean.endsWith('@srisriuniversity.edu.in') && !taken.has(ssuClean)) {
    taken.add(ssuClean);
    return { email: ssuClean, placeholder: false };
  }
  // No university address yet (new admissions): park a deterministic placeholder the ODL office can replace.
  const base =
    clean(name)
      .toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .join('.') || 'student';
  let email = `${base}.${rollOrSeq.toLowerCase()}@srisriuniversity.edu.in`.replace(/\.{2,}/g, '.');
  let n = 2;
  while (taken.has(email)) email = `${base}.${rollOrSeq.toLowerCase()}${n++}@srisriuniversity.edu.in`;
  taken.add(email);
  return { email, placeholder: true, personal: clean(personal).toLowerCase() || null };
}

function sheetRows(file: string, sheet: string) {
  const wb = XLSX.readFile(path.join(DOCS, file));
  const raw = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheet], { header: 1, blankrows: false, defval: '' });
  const hi = raw.findIndex((r) => r.some((c) => /applicant name|name of the student/i.test(String(c))));
  if (hi < 0) return { headers: [] as string[], rows: [] as Record<string, string>[] };
  const headers = raw[hi].map((c) => clean(c));
  const rows = raw.slice(hi + 1).map((r) => {
    const o: Record<string, string> = {};
    headers.forEach((h, i) => (o[h] = clean(r[i])));
    return o;
  });
  return { headers, rows };
}
const col = (r: Record<string, string>, ...names: RegExp[]) => {
  for (const re of names) {
    const k = Object.keys(r).find((h) => re.test(h));
    if (k && r[k]) return r[k];
  }
  return '';
};

// ---------------------------------------------------------------------------
// Parse: timetable
// ---------------------------------------------------------------------------
interface TTRow { date: string; startTime: string; endTime: string; programCode: string; semester: number; courseCode: string; courseName: string; facultyFull: string; classType: string; details: string }

function parseTimetable() {
  const wb = XLSX.readFile(path.join(DOCS, 'ODL Sunday Online Timetable.xlsx'));
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['MASTER TIMETABLE'], { defval: '' });
  const out: TTRow[] = [];
  const problems: string[] = [];
  rows.forEach((r, i) => {
    const line = i + 2;
    const ps = clean(r['Programme / Semester']);
    const m = ps.match(/^(.*?)\s*[–\-—]\s*Semester\s*(\d+)$/i);
    if (!m) return problems.push(`row ${line}: cannot parse "${ps}"`);
    const prog = byTimetableLabel.get(clean(m[1]));
    if (!prog) return problems.push(`row ${line}: unknown programme "${m[1]}"`);
    const t = parseTimeRange(String(r.Time));
    if (!t) return problems.push(`row ${line}: cannot parse time "${r.Time}"`);
    const date = typeof r.Date === 'number' ? excelDate(r.Date) : clean(r.Date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return problems.push(`row ${line}: cannot parse date "${r.Date}"`);
    out.push({
      date,
      startTime: t.start,
      endTime: t.end,
      programCode: prog.code,
      semester: Number(m[2]),
      courseCode: clean(r['Course Code']).replace(/\s+/g, '-').toUpperCase(),
      courseName: clean(r['Course / Session']),
      facultyFull: clean(r.Faculty),
      classType: clean(r['Class Type']),
      details: clean(r.Details),
    });
  });
  return { rows: out, problems };
}

// ---------------------------------------------------------------------------
// Parse: students
// ---------------------------------------------------------------------------
interface StudentRow { name: string; email: string; personalEmail: string | null; placeholderEmail: boolean; phone: string | null; roll: string; enrollmentNo: string | null; programCode: string; semester: number; intake: string }

function parseStudents() {
  const taken = new Set<string>();
  const rolls = new Set<string>();
  const out: StudentRow[] = [];
  const problems: string[] = [];
  let seq = 0;

  const add = (r: { name: string; ssu: string; personal: string; phone: string; roll: string; enroll: string; programText: string; intakeKey: string; intakeLabel: string }) => {
    const programCode = programFromText(r.programText);
    if (!programCode) return problems.push(`${r.name || '(no name)'}: unknown programme "${r.programText}"`);
    const semester = SESSION_SEMESTER[r.intakeKey];
    if (!semester) return problems.push(`${r.name}: unknown intake "${r.intakeKey}"`);
    if (!r.name) return problems.push(`row with enrollment ${r.enroll || '?'}: missing name`);
    seq++;
    const roll = r.roll || `TMP-${programCode}-${r.intakeKey.toUpperCase().replace('-', '')}-${String(seq).padStart(4, '0')}`;
    if (rolls.has(roll)) return problems.push(`${r.name}: duplicate roll number ${roll}`);
    rolls.add(roll);
    const e = studentEmail(r.ssu, r.personal, r.name, roll, taken);
    out.push({
      name: r.name.replace(/\s+/g, ' ').trim(),
      email: e.email,
      personalEmail: clean(r.personal).toLowerCase() || null,
      placeholderEmail: Boolean(e.placeholder),
      phone: clean(r.phone).split(/\s+/)[0] || null,
      roll,
      enrollmentNo: clean(r.enroll) || null,
      programCode,
      semester,
      intake: r.intakeLabel,
    });
  };

  // Feb 2025 — per-programme sheets carry roll + SSU email
  const feb25 = 'Master Enrollment No. & Roll No. - ODL Feb 2025 Session - MAY, MHS, MOD, BBA, BCM (6 Jun 25) Final.xlsx';
  for (const sheet of XLSX.readFile(path.join(DOCS, feb25)).SheetNames) {
    if (/Master Enrol/i.test(sheet)) continue; // no roll numbers on the combined sheet
    const { rows } = sheetRows(feb25, sheet);
    rows.forEach((r) =>
      add({
        name: col(r, /name of the student/i, /applicant name/i),
        ssu: col(r, /ssu email/i),
        personal: col(r, /^email id$/i, /email id/i),
        phone: col(r, /mobile/i),
        roll: col(r, /^roll/i),
        enroll: col(r, /enrollment no/i),
        programText: col(r, /^programme$/i) || sheet,
        intakeKey: 'feb-2025',
        intakeLabel: 'Feb-2025 (2025-27)',
      }),
    );
  }

  // Aug 2025 and Feb 2026 — one master sheet each, with roll + SSU email
  for (const [file, key, label] of [
    ['Master Enrollment No. & Roll No. - ODL Aug 2025 Session - MAY, MHS, MOD, BBA, BCM (8 Oct 25) Final.xlsx', 'aug-2025', 'Aug-2025 (2025-27)'],
    ['Master Enrollment No. & Roll No. - ODL Feb 2026 Session - MAY, MHS, MOD, BBA, BCM (31 Mar 26) Final.xlsx', 'feb-2026', 'Feb-2026 (2026-28)'],
  ] as const) {
    const wb = XLSX.readFile(path.join(DOCS, file));
    const sheet = wb.SheetNames.find((s) => /master enrol/i.test(s)) ?? wb.SheetNames[0];
    const { rows } = sheetRows(file, sheet);
    rows.forEach((r) =>
      add({
        name: col(r, /name of the student/i, /applicant name/i),
        ssu: col(r, /ssu email/i),
        personal: col(r, /^email id$/i, /email id/i),
        phone: col(r, /mobile/i),
        roll: col(r, /^roll/i),
        enroll: col(r, /enrollment no/i),
        programText: col(r, /^programme$/i),
        intakeKey: key,
        intakeLabel: label,
      }),
    );
  }

  // Aug 2026 — new admissions, one file per programme, no roll numbers or SSU addresses yet
  for (const file of fs.readdirSync(DOCS).filter((f) => /^August 2026 Batch/.test(f))) {
    const wb = XLSX.readFile(path.join(DOCS, file));
    for (const sheet of wb.SheetNames) {
      const { rows } = sheetRows(file, sheet);
      rows.forEach((r) =>
        add({
          name: col(r, /applicant name/i, /name of the student/i),
          ssu: col(r, /ssu email/i),
          personal: col(r, /^email id$/i, /email id/i),
          phone: col(r, /mobile/i),
          roll: col(r, /^roll/i),
          enroll: col(r, /enrollment no/i),
          programText: col(r, /^course$/i, /^programme$/i) || sheet,
          intakeKey: 'aug-2026',
          intakeLabel: 'Aug-2026 (2026-28)',
        }),
      );
    }
  }
  return { rows: out, problems };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const tt = parseTimetable();
  const st = parseStudents();

  // Derived catalogues
  const groups = new Map<string, { programCode: string; semester: number; code: string; name: string }>();
  const addGroup = (programCode: string, semester: number) => {
    const code = `${programCode}-S${semester}`;
    if (!groups.has(code)) {
      const prog = PROGRAMS.find((p) => p.code === programCode)!;
      groups.set(code, { programCode, semester, code, name: `${prog.timetableLabel} - Semester ${semester}` });
    }
    return code;
  };
  tt.rows.forEach((r) => addGroup(r.programCode, r.semester));
  st.rows.forEach((r) => addGroup(r.programCode, r.semester));

  const subjects = new Map<string, { programCode: string; code: string; name: string }>();
  tt.rows.forEach((r) => {
    const key = `${r.programCode}:${r.courseCode}`;
    if (!subjects.has(key)) subjects.set(key, { programCode: r.programCode, code: r.courseCode, name: r.courseName });
  });

  const facultyTaken = new Set<string>();
  const faculty = new Map<string, { full: string; name: string; designation: string | null; email: string; code: string }>();
  [...new Set(tt.rows.map((r) => r.facultyFull))].sort().forEach((full, i) => {
    const p = parseFaculty(full);
    faculty.set(full, { ...p, email: facultyEmail(p.name, facultyTaken), code: `F${String(i + 1).padStart(3, '0')}` });
  });

  console.log('--- parsed ---');
  console.log('programmes           :', PROGRAMS.length);
  console.log('class groups         :', groups.size, [...groups.keys()].sort().join(', '));
  console.log('subjects             :', subjects.size);
  console.log('faculty              :', faculty.size);
  console.log('timetable classes    :', tt.rows.length, `(${[...new Set(tt.rows.map((r) => r.date))].length} dates: ${[...new Set(tt.rows.map((r) => r.date))].sort()[0]} → ${[...new Set(tt.rows.map((r) => r.date))].sort().pop()})`);
  console.log('students             :', st.rows.length, `(${st.rows.filter((s) => s.placeholderEmail).length} without a university email, ${st.rows.filter((s) => s.roll.startsWith('TMP-')).length} without a roll number)`);
  const perGroup: Record<string, number> = {};
  st.rows.forEach((s) => (perGroup[`${s.programCode}-S${s.semester}`] = (perGroup[`${s.programCode}-S${s.semester}`] ?? 0) + 1));
  console.log('students per group   :', JSON.stringify(perGroup));
  const noClasses = Object.keys(perGroup).filter((g) => !tt.rows.some((r) => `${r.programCode}-S${r.semester}` === g));
  if (noClasses.length) console.log('groups with students but no timetable:', noClasses.join(', '));
  if (tt.problems.length) console.log('timetable problems   :', tt.problems.slice(0, 10));
  if (st.problems.length) console.log('student problems     :', st.problems.length, st.problems.slice(0, 10));

  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to load this into the database.');
    return;
  }

  const c = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query('begin');
  try {
    // ---- wipe demo data (keep admin accounts) ----------------------------
    await c.query(`delete from attendance`);
    await c.query(`delete from recordings`);
    await c.query(`delete from class_sessions`);
    await c.query(`delete from timetable_slots`);
    await c.query(`delete from subject_teachers`);
    await c.query(`delete from batch_subjects`);
    await c.query(`delete from holidays`);
    await c.query(`delete from students`);
    await c.query(`delete from teachers`);
    await c.query(`delete from batches`);
    await c.query(`delete from subjects`);
    await c.query(`delete from programs`);
    await c.query(`delete from auth.users where id in (select id from public.profiles where role in ('student','teacher'))`);
    await c.query(`delete from public.profiles where role in ('student','teacher')`);

    // ---- programmes ------------------------------------------------------
    const progId = new Map<string, string>();
    for (const p of PROGRAMS) {
      const { rows } = await c.query(`insert into programs (name, code) values ($1,$2) returning id`, [p.name, p.code]);
      progId.set(p.code, rows[0].id);
    }

    // ---- class groups (programme + semester) ------------------------------
    const groupId = new Map<string, string>();
    for (const g of [...groups.values()].sort((a, b) => a.code.localeCompare(b.code))) {
      const { rows } = await c.query(
        `insert into batches (program_id, name, code, intake_year, current_semester, is_active) values ($1,$2,$3,$4,$5,true) returning id`,
        [progId.get(g.programCode), g.name, g.code, 2026, g.semester],
      );
      groupId.set(g.code, rows[0].id);
    }

    // ---- subjects --------------------------------------------------------
    const subjectId = new Map<string, string>();
    for (const s of subjects.values()) {
      const { rows } = await c.query(`insert into subjects (program_id, code, name) values ($1,$2,$3) returning id`, [progId.get(s.programCode), s.code, s.name]);
      subjectId.set(`${s.programCode}:${s.code}`, rows[0].id);
    }

    // ---- faculty ---------------------------------------------------------
    const teacherId = new Map<string, string>();
    for (const f of faculty.values()) {
      const { rows } = await c.query(
        `insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                                 confirmation_token, recovery_token, email_change, email_change_token_new)
         values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $1, now(),
                 '{"provider":"email","providers":["email"],"provisioned_by":"import","role":"teacher","must_change_password":true}',
                 jsonb_build_object('full_name', $2::text), now(), now(), '', '', '', '') returning id`,
        [f.email, f.full],
      );
      const id = rows[0].id as string;
      await c.query(`insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
                     values ($1::text, $2::uuid, jsonb_build_object('sub', $1::text, 'email', $3::text, 'email_verified', true), 'email', now(), now())`, [id, id, f.email]);
      await c.query(`insert into profiles (id, role, full_name, email) values ($1, 'teacher', $2, $3)`, [id, f.full, f.email]);
      await c.query(`insert into teachers (id, employee_code, entra_upn, department) values ($1,$2,$3,$4)`, [id, f.code, f.email.replace('@srisriuniversity.edu.in', '@srisriuniversity.onmicrosoft.com'), f.designation]);
      teacherId.set(f.full, id);
    }

    // ---- offerings (group x subject) + teacher assignments -----------------
    const offeringId = new Map<string, string>();
    for (const r of tt.rows) {
      const gcode = `${r.programCode}-S${r.semester}`;
      const key = `${gcode}:${r.courseCode}`;
      if (!offeringId.has(key)) {
        const { rows } = await c.query(`insert into batch_subjects (batch_id, subject_id, semester) values ($1,$2,$3) returning id`, [
          groupId.get(gcode),
          subjectId.get(`${r.programCode}:${r.courseCode}`),
          r.semester,
        ]);
        offeringId.set(key, rows[0].id);
      }
      const bsId = offeringId.get(key)!;
      const tId = teacherId.get(r.facultyFull)!;
      await c.query(`insert into subject_teachers (batch_subject_id, teacher_id, is_primary) values ($1,$2,true) on conflict do nothing`, [bsId, tId]);
    }

    // ---- sessions --------------------------------------------------------
    let sessions = 0;
    for (const r of tt.rows) {
      const key = `${r.programCode}-S${r.semester}:${r.courseCode}`;
      const start = zonedTimeToUtc(r.date, r.startTime, TZ);
      const end = zonedTimeToUtc(r.date, r.endTime, TZ);
      // Only record a topic when it adds something the subject name does not already say.
      const extra = [r.classType === 'Practical' ? 'Practical' : '', r.details].filter(Boolean).join(' — ').trim();
      const topic = extra || null;
      await c.query(
        `insert into class_sessions (batch_subject_id, teacher_id, timetable_slot_id, scheduled_start, scheduled_end, status, topic, provider, sync_status)
         values ($1,$2,null,$3,$4, (case when $4::timestamptz < now() then 'completed' else 'scheduled' end)::session_status, $5, 'teams',
                 (case when $4::timestamptz < now() then 'cancelled' else 'pending' end)::sync_status)`,
        [offeringId.get(key), teacherId.get(r.facultyFull), start.toISOString(), end.toISOString(), topic],
      );
      sessions++;
    }

    // ---- students --------------------------------------------------------
    let students = 0;
    for (const s of st.rows) {
      const gcode = `${s.programCode}-S${s.semester}`;
      const gid = groupId.get(gcode);
      if (!gid) continue;
      const { rows } = await c.query(
        `insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                                 confirmation_token, recovery_token, email_change, email_change_token_new)
         values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $1, now(),
                 '{"provider":"email","providers":["email"],"provisioned_by":"import","role":"student"}',
                 jsonb_build_object('full_name', $2::text), now(), now(), '', '', '', '') returning id`,
        [s.email, s.name],
      );
      const id = rows[0].id as string;
      await c.query(`insert into profiles (id, role, full_name, email, phone) values ($1,'student',$2,$3,$4)`, [id, s.name, s.email, s.phone]);
      await c.query(
        `insert into students (id, roll_number, batch_id, status, enrollment_no, intake_session, personal_email) values ($1,$2,$3,'active',$4,$5,$6)`,
        [id, s.roll, gid, s.enrollmentNo, s.intake, s.personalEmail],
      );
      students++;
    }

    await c.query(`select log_audit('data.real_import', 'programs', null, $1)`, [
      JSON.stringify({ programs: PROGRAMS.length, groups: groups.size, subjects: subjects.size, faculty: faculty.size, sessions, students }),
    ]);
    await c.query('commit');
    console.log(`\nAPPLIED: ${PROGRAMS.length} programmes, ${groups.size} class groups, ${subjects.size} subjects, ${faculty.size} faculty, ${offeringId.size} offerings, ${sessions} classes, ${students} students.`);
  } catch (e) {
    await c.query('rollback');
    throw e;
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error('IMPORT FAILED:', e.message);
  process.exit(1);
});
