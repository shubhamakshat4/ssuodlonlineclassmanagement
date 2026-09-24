/**
 * Compare the class sessions in the database against docs/ODL Sunday Online Timetable.xlsx and,
 * on request, put any displaced session back in its timetable slot.
 *
 *   npm run data:verify              dry run - reports differences, writes nothing
 *   npm run data:verify -- --apply   restores displaced sessions and clears test attendance
 *
 * Why this exists: the E2E suite used to move a real class to "now" so the join journey had a live
 * lesson, and restore it afterwards. A failed run left the class displaced, and the next run then
 * treated the displaced time as the original. The suite no longer touches real classes (it creates a
 * throwaway session instead), but this script repairs anything the old approach left behind and is a
 * useful check after any bulk edit.
 */
import './_env';
import path from 'node:path';
import { Client } from 'pg';
import XLSX from 'xlsx';
import { zonedTimeToUtc } from '../supabase/functions/_shared/time.ts';

const TZ = 'Asia/Kolkata';
const APPLY = process.argv.includes('--apply');
const WORKBOOK = path.resolve('docs', 'ODL Sunday Online Timetable.xlsx');

interface Row {
  Date: number;
  Time: string;
  'Programme / Semester': string;
  'Course / Session': string;
}

/** Excel serial date -> yyyy-mm-dd (workbooks use the 1900 system with the Lotus leap-year bug). */
function serialToDate(serial: number): string {
  return new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000).toISOString().slice(0, 10);
}

/** "09:00 AM - 10:00 AM" -> ['09:00', '10:00'] in local (IST) clock time. */
function slotTimes(time: string): [string, string] {
  const parts = time.split(/[–—-]/).map((s) => s.trim());
  const to24 = (t: string) => {
    const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(t);
    if (!m) throw new Error(`unparseable time "${t}"`);
    const h = (Number(m[1]) % 12) + (/PM/i.test(m[3]) ? 12 : 0);
    return `${String(h).padStart(2, '0')}:${m[2]}`;
  };
  return [to24(parts[0]), to24(parts[1])];
}

/** "MA Hindu Studies - Semester 2" -> "MHS-S2" (same rules the importer used). */
function batchCodeFromLabel(label: string): string | null {
  const u = label.toUpperCase();
  const sem = /SEMESTER\s*(\d)/.exec(u);
  if (!sem) return null;
  let prog: string | null = null;
  if (/HINDU/.test(u)) prog = 'MHS';
  else if (/YOGA/.test(u)) prog = 'MAY';
  else if (/ODISSI|PERFORMING/.test(u)) prog = 'MOD';
  else if (/MBA/.test(u)) prog = 'MBA';
  else if (/BBA/.test(u)) prog = 'BBA';
  else if (/COM/.test(u)) prog = 'BCOM';
  return prog ? `${prog}-S${sem[1]}` : null;
}

async function main() {
  const rows = XLSX.utils.sheet_to_json<Row>(XLSX.readFile(WORKBOOK).Sheets['MASTER TIMETABLE'], { defval: '' });
  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const { rows: sessions } = await client.query<{ id: string; batch_code: string; subject_name: string; scheduled_start: string; status: string }>(
      `select cs.id, b.code as batch_code, s.name as subject_name, cs.scheduled_start, cs.status::text
         from public.class_sessions cs
         join public.batch_subjects bs on bs.id = cs.batch_subject_id
         join public.batches b on b.id = bs.batch_id
         join public.subjects s on s.id = bs.subject_id
        order by cs.scheduled_start`,
    );

    // Every ODL class is on a Sunday; anything else has been moved.
    const displaced = sessions.filter((s) => new Date(s.scheduled_start).getUTCDay() !== 0);
    console.log(`sessions in the database: ${sessions.length}`);
    console.log(`timetable rows in the workbook: ${rows.length}`);
    console.log(`sessions not on a Sunday: ${displaced.length}`);

    for (const s of displaced) {
      // The class belongs to the one Sunday its group is missing.
      const taken = new Set(sessions.filter((x) => x.batch_code === s.batch_code && x.id !== s.id).map((x) => new Date(x.scheduled_start).toISOString().slice(0, 10)));
      const candidates = rows
        .filter((r) => batchCodeFromLabel(r['Programme / Semester']) === s.batch_code && r['Course / Session'].trim() === s.subject_name.trim())
        .map((r) => ({ date: serialToDate(r.Date), time: r.Time }))
        .filter((r) => !taken.has(r.date));
      if (candidates.length !== 1) {
        console.log(`  ? ${s.batch_code} ${s.subject_name}: cannot resolve a single missing Sunday (${candidates.length} candidates) - fix by hand`);
        continue;
      }
      const [from, to] = slotTimes(candidates[0].time);
      const start = zonedTimeToUtc(candidates[0].date, from, TZ);
      const end = zonedTimeToUtc(candidates[0].date, to, TZ);
      if (!APPLY) {
        console.log(`  - ${s.batch_code} ${s.subject_name}: ${s.scheduled_start} -> ${start.toISOString()}`);
        continue;
      }
      await client.query(
        `update public.class_sessions
            set scheduled_start = $2, scheduled_end = $3, status = 'scheduled'::session_status,
                join_url_override = null, override_set_by = null, override_set_at = null
          where id = $1::uuid`,
        [s.id, start.toISOString(), end.toISOString()],
      );
      console.log(`  restored ${s.batch_code} ${s.subject_name} -> ${start.toISOString()}`);
    }

    // Attendance written by a headless browser is always a test artefact.
    const { rows: bots } = await client.query<{ n: string }>(`select count(*)::text as n from public.attendance where user_agent ilike '%HeadlessChrome%'`);
    if (Number(bots[0].n) > 0) {
      if (APPLY) {
        await client.query(`delete from public.attendance where user_agent ilike '%HeadlessChrome%'`);
        console.log(`  deleted ${bots[0].n} headless-browser attendance row(s)`);
      } else {
        console.log(`  - ${bots[0].n} headless-browser attendance row(s) to delete`);
      }
    }

    // Leftover throwaway sessions from an interrupted E2E run.
    const { rows: strays } = await client.query<{ n: string }>(`select count(*)::text as n from public.class_sessions where topic like 'E2E test class%'`);
    if (Number(strays[0].n) > 0) {
      if (APPLY) {
        await client.query(`delete from public.class_sessions where topic like 'E2E test class%'`);
        console.log(`  deleted ${strays[0].n} leftover E2E session(s)`);
      } else {
        console.log(`  - ${strays[0].n} leftover E2E session(s) to delete`);
      }
    }

    // Per-date counts, so a missing or duplicated class shows up.
    const expected = new Map<string, number>();
    for (const r of rows) expected.set(serialToDate(r.Date), (expected.get(serialToDate(r.Date)) ?? 0) + 1);
    const actual = new Map<string, number>();
    for (const s of sessions) {
      const d = new Date(s.scheduled_start).toISOString().slice(0, 10);
      actual.set(d, (actual.get(d) ?? 0) + 1);
    }
    let mismatches = 0;
    for (const [date, n] of [...expected].sort()) {
      const got = actual.get(date) ?? 0;
      if (got !== n) {
        mismatches += 1;
        console.log(`  ! ${date}: workbook ${n}, database ${got}`);
      }
    }
    console.log(mismatches === 0 ? 'every Sunday matches the workbook' : `${mismatches} date(s) differ from the workbook`);
    if (!APPLY && (displaced.length || mismatches)) console.log('\ndry run - pass --apply to repair');
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
