import 'server-only';
import type { createClient } from '@/lib/supabase/server';
import { parseCsvObjects } from '@/lib/domain/csv';
import { appConfig } from '@/lib/env';
import { deleteUser, provisionUser } from '@/lib/admin/provision';
import { validateRows, type CsvSpec, type EntityKey, type RowIssue } from '@/lib/admin/csv-specs';
import * as S from '@/lib/admin/csv-specs';

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface ImportReport {
  entity: EntityKey;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: RowIssue[];
}

/** Lookup helpers shared by the importers (codes → ids). */
async function lookups(supabase: Supabase) {
  const [{ data: programs }, { data: batches }, { data: subjects }, { data: bs }, { data: teachers }] = await Promise.all([
    supabase.from('programs').select('id, code'),
    supabase.from('batches').select('id, code, program_id'),
    supabase.from('subjects').select('id, code, program_id'),
    supabase.from('batch_subjects').select('id, batch_id, subject_id, semester, is_active'),
    supabase.from('teachers').select('id, profiles!inner(email)'),
  ]);
  const programByCode = new Map(((programs ?? []) as { id: string; code: string }[]).map((p) => [p.code, p.id]));
  const batchByCode = new Map(((batches ?? []) as { id: string; code: string; program_id: string }[]).map((b) => [b.code, b]));
  const subjectByKey = new Map(((subjects ?? []) as { id: string; code: string; program_id: string }[]).map((s) => [`${s.program_id}:${s.code}`, s.id]));
  const bsRows = (bs ?? []) as { id: string; batch_id: string; subject_id: string; semester: number; is_active: boolean }[];
  const teacherByEmail = new Map(((teachers ?? []) as unknown as { id: string; profiles: { email: string } }[]).map((t) => [t.profiles.email.toLowerCase(), t.id]));
  type BsLookup = { ok: false; error: string } | { ok: true; id: string; batchId: string; subjectId: string };
  const batchSubject = (batchCode: string, subjectCode: string, semester?: number): BsLookup => {
    const b = batchByCode.get(batchCode);
    if (!b) return { ok: false, error: `unknown batch_code "${batchCode}"` };
    const subjectId = subjectByKey.get(`${b.program_id}:${subjectCode}`);
    if (!subjectId) return { ok: false, error: `subject "${subjectCode}" does not exist in the batch’s programme` };
    const candidates = bsRows.filter((r) => r.batch_id === b.id && r.subject_id === subjectId && (semester === undefined || r.semester === semester));
    const active = candidates.find((c) => c.is_active) ?? candidates[0];
    if (!active) return { ok: false, error: `subject "${subjectCode}" is not offered to batch "${batchCode}"${semester ? ` in semester ${semester}` : ''} (import Batch subjects first)` };
    return { ok: true, id: active.id, batchId: b.id, subjectId };
  };
  return { programByCode, batchByCode, subjectByKey, bsRows, teacherByEmail, batchSubject };
}

/** Parse text, validate against the spec, then run the entity-specific writer row by row. */
export async function runCsvImport(supabase: Supabase, key: EntityKey, text: string): Promise<ImportReport> {
  const spec = S.specFor(key);
  if (!spec) throw new Error(`Unknown import "${key}"`);
  const { headers, rows } = parseCsvObjects(text);
  const report: ImportReport = { entity: key, total: rows.length, created: 0, updated: 0, skipped: 0, errors: [] };
  if (rows.length === 0) {
    report.errors.push({ line: 1, message: 'No data rows found. The first line must be the header row.' });
    return report;
  }
  const v = validateRows(spec as CsvSpec<unknown>, headers, rows);
  report.errors.push(...v.issues);
  if (v.ok.length === 0) return report;

  const L = await lookups(supabase);
  const fail = (i: number, message: string) => report.errors.push({ line: v.lineOf(i), message });
  const err = (e: unknown) => (e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : String(e));

  for (const [i, row] of (v.ok as Record<string, unknown>[]).entries()) {
    try {
      switch (key) {
        case 'programs': {
          const r = row as z.infer<typeof S.programsSpec.schema>;
          const existing = L.programByCode.get(r.code);
          if (existing) {
            const { error } = await supabase.from('programs').update({ name: r.name, is_active: r.is_active }).eq('id', existing);
            if (error) throw error;
            report.updated++;
          } else {
            const { data, error } = await supabase.from('programs').insert({ code: r.code, name: r.name, is_active: r.is_active }).select('id').single();
            if (error) throw error;
            L.programByCode.set(r.code, (data as { id: string }).id);
            report.created++;
          }
          break;
        }
        case 'batches': {
          const r = row as z.infer<typeof S.batchesSpec.schema>;
          const pid = L.programByCode.get(r.program_code);
          if (!pid) { fail(i, `unknown program_code "${r.program_code}"`); break; }
          const existing = L.batchByCode.get(r.code);
          const payload = { name: r.name, program_id: pid, intake_year: r.intake_year, current_semester: r.current_semester, start_date: r.start_date ?? null, end_date: r.end_date ?? null, is_active: r.is_active };
          if (existing) {
            const { error } = await supabase.from('batches').update(payload).eq('id', existing.id);
            if (error) throw error;
            report.updated++;
          } else {
            const { data, error } = await supabase.from('batches').insert({ code: r.code, ...payload }).select('id').single();
            if (error) throw error;
            L.batchByCode.set(r.code, { id: (data as { id: string }).id, code: r.code, program_id: pid });
            report.created++;
          }
          break;
        }
        case 'subjects': {
          const r = row as z.infer<typeof S.subjectsSpec.schema>;
          const programId = L.programByCode.get(r.program_code);
          if (!programId) { fail(i, `unknown program_code "${r.program_code}"`); break; }
          const existing = L.subjectByKey.get(`${programId}:${r.code}`);
          if (existing) {
            const { error } = await supabase.from('subjects').update({ name: r.name, credits: r.credits ?? null }).eq('id', existing);
            if (error) throw error;
            report.updated++;
          } else {
            const { data, error } = await supabase.from('subjects').insert({ program_id: programId, code: r.code, name: r.name, credits: r.credits ?? null }).select('id').single();
            if (error) throw error;
            L.subjectByKey.set(`${programId}:${r.code}`, (data as { id: string }).id);
            report.created++;
          }
          break;
        }
        case 'batch_subjects': {
          const r = row as z.infer<typeof S.batchSubjectsSpec.schema>;
          const b = L.batchByCode.get(r.batch_code);
          if (!b) { fail(i, `unknown batch_code "${r.batch_code}"`); break; }
          const subjectId = L.subjectByKey.get(`${b.program_id}:${r.subject_code}`);
          if (!subjectId) { fail(i, `subject "${r.subject_code}" does not exist in the batch’s programme`); break; }
          if (L.bsRows.some((x) => x.batch_id === b.id && x.subject_id === subjectId && x.semester === r.semester)) {
            report.skipped++;
            break;
          }
          const { data, error } = await supabase.from('batch_subjects').insert({ batch_id: b.id, subject_id: subjectId, semester: r.semester, is_active: r.is_active }).select('id').single();
          if (error) throw error;
          L.bsRows.push({ id: (data as { id: string }).id, batch_id: b.id, subject_id: subjectId, semester: r.semester, is_active: r.is_active });
          report.created++;
          break;
        }
        case 'teachers': {
          const r = row as z.infer<typeof S.teachersSpec.schema>;
          const { data: existing } = await supabase.from('profiles').select('id').eq('email', r.email).maybeSingle();
          if (existing) {
            report.skipped++;
            break;
          }
          const userId = await provisionUser({ email: r.email, fullName: r.full_name, phone: r.phone, role: 'teacher' });
          const { error } = await supabase.from('teachers').insert({ id: userId, employee_code: r.employee_code, entra_upn: r.entra_upn, department: r.department ?? null });
          if (error) {
            await deleteUser(userId);
            throw error;
          }
          L.teacherByEmail.set(r.email, userId);
          report.created++;
          break;
        }
        case 'subject_teachers': {
          const r = row as z.infer<typeof S.subjectTeachersSpec.schema>;
          const bs = L.batchSubject(r.batch_code, r.subject_code);
          if (!bs.ok) { fail(i, bs.error); break; }
          const teacherId = L.teacherByEmail.get(r.teacher_email);
          if (!teacherId) { fail(i, `unknown teacher_email "${r.teacher_email}"`); break; }
          const { data: dup } = await supabase.from('subject_teachers').select('id').eq('batch_subject_id', bs.id).eq('teacher_id', teacherId).maybeSingle();
          if (dup) {
            report.skipped++;
            break;
          }
          const { error } = await supabase.from('subject_teachers').insert({ batch_subject_id: bs.id, teacher_id: teacherId, is_primary: r.is_primary });
          if (error) throw error;
          report.created++;
          break;
        }
        case 'timetable': {
          const r = row as z.infer<typeof S.timetableSpec.schema>;
          const bs = L.batchSubject(r.batch_code, r.subject_code);
          if (!bs.ok) { fail(i, bs.error); break; }
          const teacherId = L.teacherByEmail.get(r.teacher_email);
          if (!teacherId) { fail(i, `unknown teacher_email "${r.teacher_email}"`); break; }
          const { data: dup } = await supabase
            .from('timetable_slots')
            .select('id')
            .eq('batch_subject_id', bs.id)
            .eq('teacher_id', teacherId)
            .eq('day_of_week', r.day)
            .eq('start_time', r.start_time)
            .eq('effective_from', r.effective_from)
            .maybeSingle();
          if (dup) {
            report.skipped++;
            break;
          }
          const { error } = await supabase.from('timetable_slots').insert({
            batch_subject_id: bs.id,
            teacher_id: teacherId,
            day_of_week: r.day,
            start_time: r.start_time,
            end_time: r.end_time,
            effective_from: r.effective_from,
            effective_to: r.effective_to ?? null,
          });
          if (error) throw error;
          report.created++;
          break;
        }
        case 'holidays': {
          const r = row as z.infer<typeof S.holidaysSpec.schema>;
          let batchId: string | null = null;
          if (r.batch_code) {
            const b = L.batchByCode.get(r.batch_code);
            if (!b) { fail(i, `unknown batch_code "${r.batch_code}"`); break; }
            batchId = b.id;
          }
          let q = supabase.from('holidays').select('id').eq('date', r.date);
          q = batchId ? q.eq('batch_id', batchId) : q.is('batch_id', null);
          const { data: existing } = await q.maybeSingle();
          const { error } = existing ? await supabase.from('holidays').update({ name: r.name }).eq('id', (existing as { id: string }).id) : await supabase.from('holidays').insert({ date: r.date, name: r.name, batch_id: batchId });
          if (error) throw error;
          if (existing) report.updated++;
          else report.created++;
          break;
        }
        case 'students': {
          const r = row as z.infer<typeof S.studentsSpec.schema>;
          if (r.email.split('@')[1] !== appConfig.allowedStudentDomain.toLowerCase()) { fail(i, `email must be @${appConfig.allowedStudentDomain}`); break; }
          const b = L.batchByCode.get(r.batch_code);
          if (!b) { fail(i, `unknown batch_code "${r.batch_code}"`); break; }
          let secondaryId: string | null = null;
          if (r.secondary_batch_code) {
            const sec = L.batchByCode.get(r.secondary_batch_code);
            if (!sec) { fail(i, `unknown secondary_batch_code "${r.secondary_batch_code}"`); break; }
            if (sec.id === b.id) { fail(i, 'secondary_batch_code must differ from batch_code'); break; }
            secondaryId = sec.id;
          }
          const { data: profile } = await supabase.from('profiles').select('id, role').eq('email', r.email).maybeSingle();
          if (profile) {
            if ((profile as { role: string }).role !== 'student') { fail(i, 'email belongs to a staff account'); break; }
            const { data: mapped } = await supabase.from('students').select('id').eq('id', (profile as { id: string }).id).maybeSingle();
            if (mapped) {
              report.skipped++;
              break;
            }
            const { error } = await supabase.from('students').insert({ id: (profile as { id: string }).id, roll_number: r.roll_number, batch_id: b.id, secondary_batch_id: secondaryId, status: r.status });
            if (error) throw error;
            report.updated++; // existing sign-in, now mapped
            break;
          }
          const userId = await provisionUser({ email: r.email, fullName: r.full_name, phone: r.phone, role: 'student' });
          const { error } = await supabase.from('students').insert({ id: userId, roll_number: r.roll_number, batch_id: b.id, secondary_batch_id: secondaryId, status: r.status });
          if (error) {
            await deleteUser(userId);
            throw error;
          }
          report.created++;
          break;
        }
      }
    } catch (e) {
      fail(i, friendly(err(e)));
    }
  }
  return report;
}

function friendly(msg: string): string {
  if (/duplicate key/.test(msg)) return 'already exists (duplicate key)';
  if (/violates row-level security/.test(msg)) return 'not allowed';
  return msg.replace(/^.*?:\s*(?=Clash|Teacher clash|Batch clash)/, '');
}

// keep the zod import type-only for `z.infer` above
import type { z } from 'zod';
