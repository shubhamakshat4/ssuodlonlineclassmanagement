/**
 * Demo data loader (talks to SUPABASE_DB_URL directly; no service-role key needed).
 *
 *   npm run demo:seed          seed.sql (if the DB is empty) + demo.sql + 21 days of sessions
 *                              from the timetable, each with an editable PLACEHOLDER Teams link
 *   npm run demo:reset-links   remove placeholder links and re-queue those sessions for real
 *                              provisioning (run once Graph credentials + Edge Functions are live)
 *
 * Placeholder links look like https://teams.microsoft.com/l/meetup-join/demo/<id>. They open Teams
 * but do not join a real meeting. Teachers/admins can replace any of them via the override form.
 */
import './_env';
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { expandSlots, type HolidayInput, type SlotInput } from '../supabase/functions/_shared/timetable.ts';

const DEMO_PREFIX = 'https://teams.microsoft.com/l/meetup-join/demo/';

async function main() {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error('SUPABASE_DB_URL is not set in .env.local');
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const mode = process.argv.includes('--reset-links') ? 'reset' : 'seed';

  if (mode === 'reset') {
    const r = await c.query(
      `update class_sessions
          set teams_join_url = null, sync_status = 'pending', sync_attempts = 0, sync_error = null, graph_event_id = null, graph_online_meeting_id = null
        where teams_join_url like $1 and status = 'scheduled' and scheduled_end > now()
        returning id`,
      [DEMO_PREFIX + '%'],
    );
    const past = await c.query(`update class_sessions set teams_join_url = null where teams_join_url like $1 and scheduled_end <= now() returning id`, [DEMO_PREFIX + '%']);
    console.log(`re-queued ${r.rowCount} upcoming session(s) for real provisioning; cleared ${past.rowCount} past placeholder link(s).`);
    await c.end();
    return;
  }

  const { rows: cnt } = await c.query('select count(*)::int as n from profiles');
  if (cnt[0].n === 0) {
    await runFile(c, 'supabase/seed.sql');
    console.log('seed.sql applied');
  } else {
    console.log(`profiles already present (${cnt[0].n}); skipping seed.sql`);
  }
  await runFile(c, 'supabase/demo/demo.sql');
  console.log('demo.sql applied');

  // Mark past scheduled sessions completed, then expand the timetable 21 days ahead.
  await c.query(`update class_sessions set status = 'completed' where status = 'scheduled' and scheduled_end < now()`);
  const { rows: settings } = await c.query('select timezone, session_generation_horizon_days from app_settings where id = 1');
  const tz = settings[0].timezone as string;
  const horizon = settings[0].session_generation_horizon_days as number;
  const { rows: slotRows } = await c.query<SlotInput>(
    `select ts.id, ts.batch_subject_id, ts.teacher_id, ts.day_of_week, ts.start_time::text, ts.end_time::text,
            ts.effective_from::text, ts.effective_to::text, ts.is_active, bs.batch_id, (bs.is_active and b.is_active) as offering_active
       from timetable_slots ts join batch_subjects bs on bs.id = ts.batch_subject_id join batches b on b.id = bs.batch_id
      where ts.is_active`,
  );
  const { rows: holidays } = await c.query<HolidayInput>('select date::text, batch_id from holidays');
  const sessions = expandSlots(slotRows, holidays, { horizonDays: horizon, tz });
  let inserted = 0;
  for (const s of sessions) {
    const r = await c.query(
      `insert into class_sessions (timetable_slot_id, batch_subject_id, teacher_id, scheduled_start, scheduled_end, status, sync_status, provider)
       values ($1,$2,$3,$4,$5,'scheduled','pending','teams') on conflict (timetable_slot_id, scheduled_start) do nothing returning id`,
      [s.timetable_slot_id, s.batch_subject_id, s.teacher_id, s.scheduled_start, s.scheduled_end],
    );
    inserted += r.rowCount ?? 0;
  }
  console.log(`timetable expanded: ${sessions.length} candidate session(s), ${inserted} new`);

  // Placeholder links for every upcoming session that has no link yet (editable via override).
  const linked = await c.query(
    `update class_sessions
        set teams_join_url = $1 || left(replace(id::text, '-', ''), 12), sync_status = 'provisioned', sync_error = null
      where status = 'scheduled' and provider = 'teams' and teams_join_url is null and sync_status <> 'failed' and scheduled_end > now()
      returning id`,
    [DEMO_PREFIX],
  );
  console.log(`placeholder Teams links set on ${linked.rowCount} session(s)`);

  await c.query(`select log_audit('demo.seeded', 'class_sessions', null, $1)`, [JSON.stringify({ inserted, placeholders: linked.rowCount })]);
  const { rows: summary } = await c.query(
    `select (select count(*) from profiles where role='student') as students, (select count(*) from profiles where role='teacher') as teachers,
            (select count(*) from timetable_slots where is_active) as slots,
            (select count(*) from class_sessions where status='scheduled' and scheduled_end > now()) as upcoming_sessions`,
  );
  console.log('demo state:', JSON.stringify(summary[0]));
  await c.end();
}

async function runFile(c: Client, file: string) {
  const sql = fs.readFileSync(path.resolve(file), 'utf8');
  await c.query('begin');
  try {
    await c.query(sql);
    await c.query('commit');
  } catch (e) {
    await c.query('rollback');
    throw new Error(`${file}: ${(e as Error).message}`);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
