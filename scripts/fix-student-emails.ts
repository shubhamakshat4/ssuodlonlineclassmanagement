/**
 * Replace the invented student logins with the real addresses from the workbooks.
 *
 *   npm run data:fix-emails            dry run - reports every change, writes nothing
 *   npm run data:fix-emails -- --apply applies them
 *
 * The first import invented an @srisriuniversity.edu.in login for every student the workbooks had no
 * "SSU Email Id" for (286 of the August 2026 admissions, plus a couple of stragglers), and a TMP-...
 * roll number for anyone without one. This script undoes that:
 *
 *   college_email   the SSU Email Id exactly as the workbook has it, otherwise NULL
 *   personal_email  the Email Id exactly as the workbook has it, otherwise NULL
 *   roll_number     the real roll number, otherwise NULL
 *   login (profiles.email + auth.users.email)
 *                   college_email when there is one, otherwise personal_email
 *
 * Nothing is invented. A student with neither address is reported and left alone, because an account
 * cannot exist without one.
 */
import './_env';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';

const DOCS = path.resolve('docs');
const APPLY = process.argv.includes('--apply');
const clean = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
const lower = (v: unknown) => clean(v).toLowerCase();
const isEmail = (v: unknown) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(v));

interface SourceRow {
  name: string;
  collegeEmail: string | null;
  personalEmail: string | null;
  roll: string | null;
}

/** Every student row from every enrolment workbook, with only the columns that matter here. */
function readWorkbooks(): SourceRow[] {
  const out: SourceRow[] = [];
  for (const file of fs.readdirSync(DOCS).filter((f) => /\.xlsx$/i.test(f) && !/Timetable/i.test(f))) {
    const wb = XLSX.readFile(path.join(DOCS, file));
    for (const sheet of wb.SheetNames) {
      const raw = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheet], { header: 1, blankrows: false, defval: '' });
      const hi = raw.findIndex((r) => r.some((c) => /applicant name|name of the student|student name/i.test(String(c))));
      if (hi < 0) continue;
      const headers = raw[hi].map(clean);
      const col = (re: RegExp) => headers.findIndex((h) => re.test(h));
      const cName = col(/applicant name|name of the student|student name/i);
      const cSsu = col(/^ssu email/i);
      const cMail = col(/^email id$/i);
      const cRoll = col(/^roll/i);
      for (let i = hi + 1; i < raw.length; i += 1) {
        const r = raw[i];
        const name = clean(r[cName]);
        if (!name || !/[a-z]{2}/i.test(name)) continue;
        if (/^(total|male|female|grand total|s\.? ?no|applicant name|name of the student)/i.test(name)) continue;
        if (/deputy registrar|programme|^level$/i.test(name)) continue;
        const ssu = cSsu >= 0 ? lower(r[cSsu]) : '';
        const mail = cMail >= 0 ? lower(r[cMail]) : '';
        out.push({
          name,
          collegeEmail: isEmail(ssu) ? ssu : null,
          personalEmail: isEmail(mail) ? mail : null,
          roll: cRoll >= 0 && clean(r[cRoll]) ? clean(r[cRoll]) : null,
        });
      }
    }
  }
  return out;
}

interface Student {
  id: string;
  roll_number: string | null;
  college_email: string | null;
  personal_email: string | null;
  profiles: { email: string; full_name: string };
}

async function main() {
  const source = readWorkbooks();
  // Addresses the university actually issued. Anything else in a login column was invented by the import.
  const realCollege = new Set(source.map((r) => r.collegeEmail).filter(Boolean) as string[]);
  const realPersonal = new Set(source.map((r) => r.personalEmail).filter(Boolean) as string[]);
  const byPersonal = new Map(source.filter((r) => r.personalEmail).map((r) => [r.personalEmail as string, r]));
  const byCollege = new Map(source.filter((r) => r.collegeEmail).map((r) => [r.collegeEmail as string, r]));
  console.log(`workbook rows: ${source.length}  (SSU emails: ${realCollege.size}, personal emails: ${realPersonal.size})`);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local');
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const students: Student[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await admin
      .from('students')
      .select('id, roll_number, college_email, personal_email, profiles!inner(email, full_name)')
      .order('id')
      .range(from, from + 499);
    if (error) throw new Error(error.message);
    students.push(...((data ?? []) as unknown as Student[]));
    if (!data || data.length < 500) break;
  }
  console.log(`students in the database: ${students.length}`);

  const stats = { unchanged: 0, loginChanged: 0, collegeSet: 0, rollCleared: 0, noAddress: 0, skipped: 0 };
  for (const s of students) {
    const current = lower(s.profiles.email);
    // The workbook row this student came from: matched on whichever address the import used as the login.
    const row = byCollege.get(current) ?? byPersonal.get(current) ?? (s.personal_email ? byPersonal.get(lower(s.personal_email)) : undefined);

    const college = realCollege.has(current) ? current : (row?.collegeEmail ?? (realCollege.has(lower(s.college_email)) ? lower(s.college_email) : null));
    const personal = row?.personalEmail ?? (s.personal_email ? lower(s.personal_email) : null);
    const roll = row?.roll ?? (s.roll_number && !s.roll_number.startsWith('TMP-') ? s.roll_number : null);
    const login = college ?? personal;

    if (!login) {
      stats.noAddress += 1;
      console.log(`  ! ${s.profiles.full_name}: no address in the workbooks - left as it is (${current})`);
      continue;
    }
    if (!row && !realCollege.has(current)) {
      // Not from the workbooks at all (e.g. a student the admin added by hand) - leave it alone.
      stats.skipped += 1;
      continue;
    }

    const patch: Record<string, unknown> = {};
    if (lower(s.college_email) !== lower(college) && (college || s.college_email)) patch.college_email = college;
    if (lower(s.personal_email) !== lower(personal) && (personal || s.personal_email)) patch.personal_email = personal;
    if ((s.roll_number ?? null) !== roll) patch.roll_number = roll;
    const loginChanges = current !== login;

    if (!Object.keys(patch).length && !loginChanges) {
      stats.unchanged += 1;
      continue;
    }
    if (patch.college_email !== undefined && college) stats.collegeSet += 1;
    if (patch.roll_number === null && s.roll_number) stats.rollCleared += 1;
    if (loginChanges) stats.loginChanged += 1;

    if (!APPLY) {
      const bits = [
        loginChanges ? `login ${current} -> ${login}` : null,
        patch.college_email !== undefined ? `college=${college ?? 'NULL'}` : null,
        patch.personal_email !== undefined ? `personal=${personal ?? 'NULL'}` : null,
        patch.roll_number !== undefined ? `roll=${roll ?? 'NULL'}` : null,
      ].filter(Boolean);
      console.log(`  - ${s.profiles.full_name}: ${bits.join(', ')}`);
      continue;
    }

    if (loginChanges) {
      // auth.users first: if it fails (duplicate address) the profile must not drift away from it.
      const { error: authError } = await admin.auth.admin.updateUserById(s.id, { email: login, email_confirm: true });
      if (authError) {
        console.log(`  FAILED ${s.profiles.full_name}: ${authError.message}`);
        continue;
      }
      const { error: profileError } = await admin.from('profiles').update({ email: login }).eq('id', s.id);
      if (profileError) {
        console.log(`  FAILED ${s.profiles.full_name} (profile): ${profileError.message}`);
        continue;
      }
    }
    if (Object.keys(patch).length) {
      const { error } = await admin.from('students').update(patch).eq('id', s.id);
      if (error) console.log(`  FAILED ${s.profiles.full_name} (student): ${error.message}`);
    }
  }

  console.log('\n' + JSON.stringify(stats, null, 1));
  if (!APPLY) console.log('\ndry run - pass --apply to write these changes');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
