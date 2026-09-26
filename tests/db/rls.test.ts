/**
 * RLS + trigger suite. Runs every statement as a real Postgres role with JWT claims, exactly
 * as PostgREST does for the anon key, so a passing suite means the database itself enforces
 * the rules — no matter what the client sends.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ANON, asUser, createTestDb, expectDenied, SERVICE, type TestDb } from './harness';
import * as F from './fixtures';

const aarav = asUser(F.STUDENT_AARAV);
const meera = asUser(F.STUDENT_MEERA_ON_HOLD);
const kabir = asUser(F.STUDENT_KABIR);
const anand = asUser(F.TEACHER_ANAND);
const kavita = asUser(F.TEACHER_KAVITA);
const admin = asUser(F.ADMIN);

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.close();
});

const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

describe('anon (no session)', () => {
  it('sees nothing and cannot write', async () => {
    for (const t of ['profiles', 'students', 'teachers', 'class_sessions', 'v_class_sessions', 'attendance', 'recordings', 'batches', 'audit_log']) {
      const rows = await db.rows(ANON, `select * from ${t}`);
      expect(rows, t).toHaveLength(0);
    }
    await expectDenied(db.rows(ANON, `insert into programs (name, code) values ('x', 'XX')`));
    await expectDenied(
      db.rows(ANON, `insert into attendance (class_session_id, student_id) values ($1, $2)`, [F.SESSION_LIVE_BBA, F.STUDENT_AARAV]),
    );
  });
});

describe('student A (Aarav, BBA-ODL-2025)', () => {
  it('reads only their own profile plus the teachers of their batch', async () => {
    const rows = await db.rows<{ id: string }>(aarav, 'select id from profiles');
    expect(ids(rows)).toEqual(ids([{ id: F.STUDENT_AARAV }, { id: F.TEACHER_ANAND }, { id: F.TEACHER_KAVITA }, { id: F.TEACHER_ROHIT }]));
  });

  it('reads only their own student row', async () => {
    const rows = await db.rows<{ id: string }>(aarav, 'select id from students');
    expect(ids(rows)).toEqual([F.STUDENT_AARAV]);
  });

  it('cannot read the teachers table (UPNs are not for students)', async () => {
    expect(await db.rows(aarav, 'select * from teachers')).toHaveLength(0);
  });

  it('sees only their own batch and its subjects', async () => {
    expect(ids(await db.rows<{ id: string }>(aarav, 'select id from batches'))).toEqual([F.BATCH_BBA_2025]);
    expect(ids(await db.rows<{ id: string }>(aarav, 'select id from batch_subjects'))).toEqual(
      [F.BS_BBA2025_FM, F.BS_BBA2025_MM, F.BS_BBA2025_STATS].sort(),
    );
  });

  it("sees their batch's sessions and never another batch's", async () => {
    const rows = await db.rows<{ id: string }>(aarav, 'select id from class_sessions');
    expect(ids(rows)).toEqual(
      [
        F.SESSION_PAST_RECORDED,
        F.SESSION_PAST_EXPIRED,
        F.SESSION_PAST_NO_REC,
        F.SESSION_LIVE_BBA,
        F.SESSION_LATER_TODAY_BBA,
        F.SESSION_TOMORROW_PENDING,
        F.SESSION_FAILED,
        F.SESSION_CANCELLED,
      ].sort(),
    );
    expect(ids(rows)).not.toContain(F.SESSION_LIVE_MBA);
    expect(ids(rows)).not.toContain(F.SESSION_OTHER_BATCH_PAST);
    expect(ids(rows)).not.toContain(F.SESSION_BBA2026_UPCOMING);
  });

  it('v_class_sessions resolves subject, batch, teacher name and effective URL for them', async () => {
    const [row] = await db.rows<Record<string, unknown>>(aarav, 'select * from v_class_sessions where id = $1', [F.SESSION_LIVE_BBA]);
    expect(row.subject_name).toBe('Financial Management');
    expect(row.batch_code).toBe('BBA-ODL-2025');
    expect(row.teacher_name).toBe('Dr. Anand Mishra');
    expect(row.effective_join_url).toBe('https://teams.microsoft.com/l/meetup-join/seed-0005');
    expect(row.join_window_open).toBe(true);
    expect(await db.rows(aarav, 'select id from v_class_sessions where id = $1', [F.SESSION_LIVE_MBA])).toHaveLength(0);
  });

  it("reads their own attendance but not student B's on the same session", async () => {
    const rows = await db.rows<{ student_id: string }>(aarav, 'select student_id from attendance where class_session_id = $1', [
      F.SESSION_PAST_RECORDED,
    ]);
    expect(rows.map((r) => r.student_id)).toEqual([F.STUDENT_AARAV]);
    // Diya's row exists (superuser view) but is invisible to Aarav.
    const all = await db.sudo('select student_id from attendance where class_session_id = $1', [F.SESSION_PAST_RECORDED]);
    expect(all).toHaveLength(2);
  });

  it('can record attendance inside the join window; the server sets clicked_at', async () => {
    const rows = await db.rows<{ clicked_at: Date; student_id: string }>(
      aarav,
      `insert into attendance (class_session_id, student_id, clicked_at, ip, user_agent)
       values ($1, $2, '2000-01-01T00:00:00Z', '10.0.0.1', 'vitest') returning clicked_at, student_id`,
      [F.SESSION_LIVE_BBA, F.STUDENT_AARAV],
    );
    expect(rows[0].student_id).toBe(F.STUDENT_AARAV);
    expect(rows[0].clicked_at.getFullYear()).toBeGreaterThan(2000);
  });

  it('a second click does not duplicate (upsert semantics)', async () => {
    await db.run(aarav, async (c) => {
      await c.query('insert into attendance (class_session_id, student_id) values ($1, $2)', [F.SESSION_LIVE_BBA, F.STUDENT_AARAV]);
      await c.query(
        'insert into attendance (class_session_id, student_id) values ($1, $2) on conflict (class_session_id, student_id) do nothing',
        [F.SESSION_LIVE_BBA, F.STUDENT_AARAV],
      );
      const r = await c.query('select count(*)::int as n from attendance where class_session_id = $1 and student_id = $2', [
        F.SESSION_LIVE_BBA,
        F.STUDENT_AARAV,
      ]);
      expect(r.rows[0].n).toBe(1);
    });
  });

  it('cannot record attendance as another student', async () => {
    const msg = await expectDenied(
      db.rows(aarav, 'insert into attendance (class_session_id, student_id) values ($1, $2)', [F.SESSION_LIVE_BBA, F.STUDENT_DIYA]),
    );
    expect(msg).toMatch(/row-level security|own attendance/i);
  });

  it("cannot record attendance for another batch's live session", async () => {
    const msg = await expectDenied(
      db.rows(aarav, 'insert into attendance (class_session_id, student_id) values ($1, $2)', [F.SESSION_LIVE_MBA, F.STUDENT_AARAV]),
    );
    expect(msg).toMatch(/not enrolled/i);
  });

  it('cannot record attendance outside the join window (later today, or a past class)', async () => {
    expect(
      await expectDenied(
        db.rows(aarav, 'insert into attendance (class_session_id, student_id) values ($1, $2)', [F.SESSION_LATER_TODAY_BBA, F.STUDENT_AARAV]),
      ),
    ).toMatch(/join window is closed/i);
    expect(
      await expectDenied(
        db.rows(aarav, 'insert into attendance (class_session_id, student_id) values ($1, $2)', [F.SESSION_PAST_NO_REC, F.STUDENT_AARAV]),
      ),
    ).toMatch(/completed|join window/i);
    expect(
      await expectDenied(
        db.rows(aarav, 'insert into attendance (class_session_id, student_id) values ($1, $2)', [F.SESSION_CANCELLED, F.STUDENT_AARAV]),
      ),
    ).toMatch(/cancelled/i);
  });

  it('join window opens exactly lead-minutes before start (config-driven)', async () => {
    // Move the "later today" session so that it starts in 9 minutes: window (10 min lead) is open.
    await db.sudo(`update class_sessions set scheduled_start = now() + interval '9 minutes', scheduled_end = now() + interval '69 minutes' where id = $1`, [
      F.SESSION_LATER_TODAY_BBA,
    ]);
    await db.run(aarav, async (c) => {
      await c.query('insert into attendance (class_session_id, student_id) values ($1, $2)', [F.SESSION_LATER_TODAY_BBA, F.STUDENT_AARAV]);
    });
    // 11 minutes ahead: closed.
    await db.sudo(`update class_sessions set scheduled_start = now() + interval '11 minutes', scheduled_end = now() + interval '71 minutes' where id = $1`, [
      F.SESSION_LATER_TODAY_BBA,
    ]);
    await expectDenied(db.rows(aarav, 'insert into attendance (class_session_id, student_id) values ($1, $2)', [F.SESSION_LATER_TODAY_BBA, F.STUDENT_AARAV]));
    // Lower the lead time to 15 minutes via settings: open again.
    await db.sudo('update app_settings set join_window_lead_minutes = 15 where id = 1');
    await db.run(aarav, async (c) => {
      await c.query('insert into attendance (class_session_id, student_id) values ($1, $2)', [F.SESSION_LATER_TODAY_BBA, F.STUDENT_AARAV]);
    });
    await db.sudo('update app_settings set join_window_lead_minutes = 10 where id = 1');
    await db.sudo(`update class_sessions set scheduled_start = now() + interval '3 hours', scheduled_end = now() + interval '4 hours' where id = $1`, [
      F.SESSION_LATER_TODAY_BBA,
    ]);
  });

  it('cannot update or delete attendance rows', async () => {
    const upd = await db.run(aarav, async (c) => c.query(`update attendance set clicked_at = now() where student_id = $1`, [F.STUDENT_AARAV]));
    expect(upd.rowCount).toBe(0);
    const del = await db.run(aarav, async (c) => c.query(`delete from attendance where student_id = $1`, [F.STUDENT_AARAV]));
    expect(del.rowCount).toBe(0);
  });

  it('sees an available recording but not an expired one nor another batch’s', async () => {
    const rows = await db.rows<{ id: string }>(aarav, 'select id from recordings');
    expect(ids(rows)).toEqual([F.RECORDING_AVAILABLE]);
  });

  it('loses the recording the moment it expires', async () => {
    await db.sudo(`update recordings set expires_at = now() - interval '1 second' where id = $1`, [F.RECORDING_AVAILABLE]);
    expect(await db.rows(aarav, 'select id from recordings where id = $1', [F.RECORDING_AVAILABLE])).toHaveLength(0);
    // still visible to the teacher and admin
    expect(await db.rows(anand, 'select id from recordings where id = $1', [F.RECORDING_AVAILABLE])).toHaveLength(1);
    expect(await db.rows(admin, 'select id from recordings where id = $1', [F.RECORDING_AVAILABLE])).toHaveLength(1);
    await db.sudo(`update recordings set expires_at = now() + interval '23 days' where id = $1`, [F.RECORDING_AVAILABLE]);
  });

  it('cannot touch class_sessions, profiles, recordings or the audit log', async () => {
    const u = await db.run(aarav, async (c) => c.query(`update class_sessions set topic = 'hax' where id = $1`, [F.SESSION_LIVE_BBA]));
    expect(u.rowCount).toBe(0);
    const o = await db.run(aarav, async (c) =>
      c.query(`update class_sessions set join_url_override = 'https://evil.example' where id = $1`, [F.SESSION_LIVE_BBA]),
    );
    expect(o.rowCount).toBe(0);
    await expectDenied(
      db.rows(aarav, `insert into class_sessions (batch_subject_id, teacher_id, scheduled_start, scheduled_end) values ($1, $2, now(), now() + interval '1 hour')`, [
        F.BS_BBA2025_FM,
        F.TEACHER_ANAND,
      ]),
    );
    const p = await db.run(aarav, async (c) => c.query(`update profiles set full_name = 'X' where id = $1`, [F.STUDENT_AARAV]));
    expect(p.rowCount).toBe(0);
    const r = await db.run(aarav, async (c) => c.query(`update recordings set expires_at = now() + interval '1 year'`));
    expect(r.rowCount).toBe(0);
    expect(await db.rows(aarav, 'select * from audit_log')).toHaveLength(0);
    await expectDenied(db.rows(aarav, `insert into audit_log (action, entity) values ('x', 'y')`));
  });

  it('cannot bypass row scoping with the security-definer helpers', async () => {
    const [r] = await db.rows<{ is_admin: boolean; is_teacher: boolean; batch: string }>(
      aarav,
      'select is_admin(), is_teacher(), current_student_batch_id() as batch',
    );
    expect(r.is_admin).toBe(false);
    expect(r.is_teacher).toBe(false);
    expect(r.batch).toBe(F.BATCH_BBA_2025);
  });
});

describe('student in another batch (Kabir, MBA-ODL-2025)', () => {
  it('sees only MBA sessions and the MBA recording', async () => {
    const rows = await db.rows<{ id: string }>(kabir, 'select id from class_sessions');
    expect(ids(rows)).toEqual([F.SESSION_OTHER_BATCH_PAST, F.SESSION_LIVE_MBA, F.SESSION_MBA_UPCOMING].sort());
    expect(ids(await db.rows<{ id: string }>(kabir, 'select id from recordings'))).toEqual([F.RECORDING_OTHER_BATCH]);
  });
});

describe('student on hold (Meera)', () => {
  it('sees no sessions or recordings and cannot join', async () => {
    expect(await db.rows(meera, 'select id from class_sessions')).toHaveLength(0);
    expect(await db.rows(meera, 'select id from recordings')).toHaveLength(0);
    expect(await db.rows(meera, 'select id from batches')).toHaveLength(0);
    await expectDenied(db.rows(meera, 'insert into attendance (class_session_id, student_id) values ($1, $2)', [F.SESSION_LIVE_BBA, F.STUDENT_MEERA_ON_HOLD]));
  });
});

describe('teacher (Anand)', () => {
  it("sees only their own sessions, across both batches they teach, and not a colleague's", async () => {
    const rows = await db.rows<{ id: string }>(anand, 'select id from class_sessions');
    expect(ids(rows)).toEqual(
      [F.SESSION_PAST_RECORDED, F.SESSION_PAST_EXPIRED, F.SESSION_OTHER_BATCH_PAST, F.SESSION_LIVE_BBA, F.SESSION_LIVE_MBA, F.SESSION_FAILED].sort(),
    );
    expect(ids(rows)).not.toContain(F.SESSION_PAST_NO_REC); // Kavita's
  });

  it('sees students of the batches they teach (roster) but not other batches', async () => {
    const rows = await db.rows<{ id: string }>(anand, 'select id from students');
    expect(ids(rows)).toContain(F.STUDENT_AARAV);
    expect(ids(rows)).toContain(F.STUDENT_KABIR);
    expect(ids(rows)).not.toContain(F.STUDENT_RAHUL); // BBA-2026, Rohit only
    const names = await db.rows<{ id: string }>(anand, `select id from profiles where role = 'student'`);
    expect(ids(names)).not.toContain(F.STUDENT_RAHUL);
  });

  it("reads attendance for their own sessions only", async () => {
    const own = await db.rows(anand, 'select id from attendance where class_session_id = $1', [F.SESSION_PAST_RECORDED]);
    expect(own).toHaveLength(2);
    const other = await db.rows(anand, 'select id from attendance where class_session_id = $1', [F.SESSION_PAST_NO_REC]);
    expect(other).toHaveLength(0);
  });

  it('reads their own teacher row only, and never the audit log', async () => {
    expect(ids(await db.rows<{ id: string }>(anand, 'select id from teachers'))).toEqual([F.TEACHER_ANAND]);
    expect(await db.rows(anand, 'select * from audit_log')).toHaveLength(0);
  });

  it('can override the link on an upcoming class; side effects + audit are applied by the trigger', async () => {
    await db.run(anand, async (c) => {
      const r = await c.query(
        `update class_sessions set join_url_override = ' https://meet.google.com/abc-defg-hij ' where id = $1
         returning provider, teams_join_url, join_url_override, override_set_by, override_set_at`,
        [F.SESSION_LIVE_BBA],
      );
      expect(r.rowCount).toBe(1);
      expect(r.rows[0].provider).toBe('custom');
      expect(r.rows[0].teams_join_url).toBeNull();
      expect(r.rows[0].join_url_override).toBe('https://meet.google.com/abc-defg-hij');
      expect(r.rows[0].override_set_by).toBe(F.TEACHER_ANAND);
      expect(r.rows[0].override_set_at).not.toBeNull();
      const v = await c.query('select effective_join_url, has_override from v_class_sessions where id = $1', [F.SESSION_LIVE_BBA]);
      expect(v.rows[0].effective_join_url).toBe('https://meet.google.com/abc-defg-hij');
      expect(v.rows[0].has_override).toBe(true);
      // audit row written with the teacher as actor (visible to superuser only)
      await c.query('reset role');
      const a = await c.query(`select actor_id, payload from audit_log where action = 'session.override_set' and entity_id = $1`, [F.SESSION_LIVE_BBA]);
      expect(a.rowCount).toBe(1);
      expect(a.rows[0].actor_id).toBe(F.TEACHER_ANAND);
      expect(a.rows[0].payload.had_teams_event).toBe(true);
    });
  });

  it('clearing the override re-queues the session for a fresh Teams meeting', async () => {
    await db.run(anand, async (c) => {
      await c.query(`update class_sessions set join_url_override = 'https://zoom.us/j/123' where id = $1`, [F.SESSION_LIVE_BBA]);
      const r = await c.query(
        `update class_sessions set join_url_override = null where id = $1 returning provider, sync_status, override_set_by, override_set_at`,
        [F.SESSION_LIVE_BBA],
      );
      expect(r.rows[0].provider).toBe('teams');
      expect(r.rows[0].sync_status).toBe('pending');
      expect(r.rows[0].override_set_by).toBeNull();
      expect(r.rows[0].override_set_at).toBeNull();
    });
  });

  it('rejects a non-https override', async () => {
    const msg = await expectDenied(db.rows(anand, `update class_sessions set join_url_override = 'http://zoom.us/j/1' where id = $1`, [F.SESSION_LIVE_BBA]));
    expect(msg).toMatch(/https/i);
    const msg2 = await expectDenied(db.rows(anand, `update class_sessions set join_url_override = 'javascript:alert(1)' where id = $1`, [F.SESSION_LIVE_BBA]));
    expect(msg2).toMatch(/https/i);
  });

  it("cannot override a colleague's class", async () => {
    const r = await db.run(anand, async (c) =>
      c.query(`update class_sessions set join_url_override = 'https://zoom.us/j/1' where id = $1`, [F.SESSION_LATER_TODAY_BBA]),
    );
    expect(r.rowCount).toBe(0);
  });

  it('cannot edit a class that has already ended', async () => {
    const r = await db.run(anand, async (c) =>
      c.query(`update class_sessions set join_url_override = 'https://zoom.us/j/1' where id = $1`, [F.SESSION_PAST_RECORDED]),
    );
    expect(r.rowCount).toBe(0);
  });

  it('cannot change anything except the override and the topic', async () => {
    for (const set of [
      `scheduled_start = now() + interval '1 day'`,
      `status = 'cancelled'`,
      `teacher_id = '${F.TEACHER_KAVITA}'`,
      `teams_join_url = 'https://teams.microsoft.com/x'`,
      `sync_status = 'failed'`,
      `provider = 'custom'`,
      `batch_subject_id = '${F.BS_MBA2025_SM}'`,
    ]) {
      const msg = await expectDenied(db.rows(anand, `update class_sessions set ${set} where id = $1`, [F.SESSION_LIVE_BBA]));
      expect(msg, set).toMatch(/only change the join link override/i);
    }
    // topic is allowed
    await db.run(anand, async (c) => {
      const r = await c.query(`update class_sessions set topic = 'Revised topic' where id = $1 returning topic`, [F.SESSION_LIVE_BBA]);
      expect(r.rows[0].topic).toBe('Revised topic');
    });
  });

  it('cannot spoof override_set_by', async () => {
    const msg = await expectDenied(
      db.rows(anand, `update class_sessions set override_set_by = '${F.ADMIN}' where id = $1`, [F.SESSION_LIVE_BBA]),
    );
    expect(msg).toMatch(/maintained by the server/i);
  });

  it('cannot insert sessions, students, or programmes', async () => {
    await expectDenied(
      db.rows(anand, `insert into class_sessions (batch_subject_id, teacher_id, scheduled_start, scheduled_end) values ($1, $2, now(), now() + interval '1 hour')`, [
        F.BS_BBA2025_FM,
        F.TEACHER_ANAND,
      ]),
    );
    await expectDenied(db.rows(anand, `insert into programs (name, code) values ('x', 'XX')`));
    const s = await db.run(anand, async (c) => c.query(`update students set status = 'withdrawn' where id = $1`, [F.STUDENT_AARAV]));
    expect(s.rowCount).toBe(0);
  });

  it('log_audit always records the JWT subject as actor', async () => {
    await db.run(anand, async (c) => {
      await c.query(`select log_audit('test.action', 'class_sessions', $1, '{"x":1}')`, [F.SESSION_LIVE_BBA]);
      await c.query('reset role');
      const a = await c.query(`select actor_id from audit_log where action = 'test.action'`);
      expect(a.rows[0].actor_id).toBe(F.TEACHER_ANAND);
    });
  });
});

describe('teacher (Kavita) vs Anand', () => {
  it('cannot see Anand’s rosters for batches she does not teach', async () => {
    // Kavita teaches BBA-2025 (MM) and MBA-2025 (OR) — but not BBA-2026.
    const rows = await db.rows<{ id: string }>(kavita, 'select id from students');
    expect(ids(rows)).not.toContain(F.STUDENT_RAHUL);
    expect(ids(rows)).toContain(F.STUDENT_DIYA);
  });
});

describe('admin', () => {
  it('reads everything', async () => {
    expect(await db.rows(admin, 'select id from profiles')).toHaveLength(12);
    expect(await db.rows(admin, 'select id from class_sessions')).toHaveLength(12);
    expect(await db.rows(admin, 'select id from recordings')).toHaveLength(3);
    expect(await db.rows(admin, 'select id from attendance')).toHaveLength(4);
    expect((await db.rows(admin, 'select id from audit_log')).length).toBeGreaterThan(0);
    expect(await db.rows(admin, 'select id from teachers')).toHaveLength(3);
  });

  it('can write catalogue data', async () => {
    await db.run(admin, async (c) => {
      const r = await c.query(`insert into programs (name, code) values ('B.Com (ODL)', 'BCOM-ODL') returning id`);
      expect(r.rowCount).toBe(1);
    });
  });

  it('cancelling a session marks sync_status cancelled and writes an audit row', async () => {
    await db.run(admin, async (c) => {
      const r = await c.query(`update class_sessions set status = 'cancelled' where id = $1 returning sync_status`, [F.SESSION_LIVE_BBA]);
      expect(r.rows[0].sync_status).toBe('cancelled');
      const a = await c.query(`select actor_id from audit_log where action = 'session.cancelled' and entity_id = $1`, [F.SESSION_LIVE_BBA]);
      expect(a.rows[0].actor_id).toBe(F.ADMIN);
    });
  });

  it('rescheduling a provisioned Teams session re-queues it for a Graph patch', async () => {
    await db.run(admin, async (c) => {
      const r = await c.query(
        `update class_sessions set scheduled_start = scheduled_start + interval '1 day', scheduled_end = scheduled_end + interval '1 day'
         where id = $1 returning sync_status, graph_event_id, teams_join_url`,
        [F.SESSION_MBA_UPCOMING],
      );
      expect(r.rows[0].sync_status).toBe('pending');
      expect(r.rows[0].graph_event_id).toBe('seed-event-0011'); // kept: provisioner patches, keeps join URL
      expect(r.rows[0].teams_join_url).toContain('seed-0011');
    });
  });

  it('can set an override on behalf of a teacher (actor recorded as admin)', async () => {
    await db.run(admin, async (c) => {
      const r = await c.query(`update class_sessions set join_url_override = 'https://zoom.us/j/999' where id = $1 returning override_set_by, provider`, [
        F.SESSION_MBA_UPCOMING,
      ]);
      expect(r.rows[0].override_set_by).toBe(F.ADMIN);
      expect(r.rows[0].provider).toBe('custom');
    });
  });
});

describe('service role', () => {
  it('bypasses RLS (used only by server code and cron)', async () => {
    expect(await db.rows(SERVICE, 'select id from class_sessions')).toHaveLength(12);
  });
});

describe('auth guards (accounts are created by the ODL office; class-group mapping decides what they see)', () => {
  it('rejects a sign-up the ODL office did not create, whatever the domain or provider', async () => {
    for (const [email, meta] of [
      ['someone@gmail.com', '{"provider":"email","providers":["email"]}'],
      ['new.student@srisriuniversity.edu.in', '{"provider":"email","providers":["email"]}'],
      ['g@srisriuniversity.edu.in', '{"provider":"google","providers":["google"]}'],
    ]) {
      const msg = await expectDenied(
        db.sudo(
          `insert into auth.users (id, email, raw_app_meta_data, created_at, updated_at)
           values (gen_random_uuid(), $1, $2::jsonb, now(), now())`,
          [email, meta],
        ),
      );
      expect(msg, email).toMatch(/created by the ODL office/i);
    }
  });

  it('an ODL-created student sees nothing until they are mapped, then sees their class group', async () => {
    const [u] = await db.sudo<{ id: string }>(
      `insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
       values (gen_random_uuid(), 'New.Student@srisriuniversity.edu.in',
               '{"provider":"email","providers":["email"],"provisioned_by":"admin"}', '{"full_name":"New Student"}', now(), now()) returning id`,
    );
    // profiles rows are written by the provisioning code, not by a trigger
    expect(await db.sudo('select id from profiles where id = $1', [u.id])).toHaveLength(0);
    await db.sudo(`insert into profiles (id, role, full_name, email) values ($1, 'student', 'New Student', 'new.student@srisriuniversity.edu.in')`, [u.id]);

    // signed in but unmapped: sees nothing, and is listed for the admin
    expect(await db.rows(asUser(u.id), 'select id from class_sessions')).toHaveLength(0);
    expect(await db.rows(asUser(u.id), 'select id from recordings')).toHaveLength(0);
    expect((await db.rows<{ id: string }>(admin, 'select id from v_unmapped_students')).map((r) => r.id)).toContain(u.id);
    expect((await db.rows<{ id: string }>(asUser(u.id), 'select id from v_unmapped_students')).map((r) => r.id)).toEqual([u.id]);

    // admin maps them to BBA-2025 -> timetable appears
    await db.exec(admin, `insert into students (id, roll_number, batch_id) values ($1, 'ODL25BBA777', $2)`, [u.id, F.BATCH_BBA_2025]);
    expect((await db.rows(asUser(u.id), 'select id from class_sessions')).length).toBeGreaterThan(0);
    expect(await db.rows(admin, 'select id from v_unmapped_students where id = $1', [u.id])).toHaveLength(0);
  });

  it('a student may be stored with no roll number and only a personal email', async () => {
    const [u] = await db.sudo<{ id: string }>(
      `insert into auth.users (id, email, raw_app_meta_data, created_at, updated_at)
       values (gen_random_uuid(), 'no.roll@gmail.com', '{"provider":"email","providers":["email"],"provisioned_by":"admin"}', now(), now()) returning id`,
    );
    await db.sudo(`insert into profiles (id, role, full_name, email) values ($1, 'student', 'No Roll', 'no.roll@gmail.com')`, [u.id]);
    await db.exec(admin, `insert into students (id, batch_id, personal_email) values ($1, $2, 'no.roll@gmail.com')`, [u.id, F.BATCH_BBA_2025]);
    const [row] = await db.rows<{ roll_number: string | null; college_email: string | null; personal_email: string }>(
      admin,
      'select roll_number, college_email, personal_email from students where id = $1',
      [u.id],
    );
    expect(row).toEqual({ roll_number: null, college_email: null, personal_email: 'no.roll@gmail.com' });
    expect((await db.rows(asUser(u.id), 'select id from class_sessions')).length).toBeGreaterThan(0);
  });

  it('admin-created email users (app_metadata.provisioned_by) are allowed and get no automatic profile', async () => {
    const [u] = await db.sudo<{ id: string }>(
      `insert into auth.users (id, email, raw_app_meta_data, created_at, updated_at)
       values (gen_random_uuid(), 'new.teacher@srisriuniversity.edu.in', '{"provider":"email","providers":["email"],"provisioned_by":"admin"}', now(), now()) returning id`,
    );
    expect(await db.sudo('select id from profiles where id = $1', [u.id])).toHaveLength(0);
  });

  it('self-service email/password sign-ups are rejected by the auth hook (no provisioned_by stamp)', async () => {
    const [h] = await db.sudo<{ r: { error?: { http_code: number; message: string } } }>(
      `select before_user_created_hook('{"user":{"email":"rogue@srisriuniversity.edu.in","app_metadata":{"provider":"email"}}}') as r`,
    );
    expect(h.r.error?.http_code).toBe(403);
    expect(h.r.error?.message).toMatch(/created by the ODL office/i);
  });

  it('blocks the Google provider for teacher and admin accounts', async () => {
    const msg = await expectDenied(
      db.sudo(
        `insert into auth.identities (provider_id, user_id, identity_data, provider)
         values ('g-teacher', $1, '{"sub":"g-teacher","email":"anand.mishra@srisriuniversity.edu.in"}', 'google')`,
        [F.TEACHER_ANAND],
      ),
    );
    expect(msg).toMatch(/only available to students/i);
  });

  it('blocks a Google identity at the wrong domain even for a student', async () => {
    const msg = await expectDenied(
      db.sudo(
        `insert into auth.identities (provider_id, user_id, identity_data, provider)
         values ('g-wrong', $1, '{"sub":"g-wrong","email":"aarav.sharma@gmail.com"}', 'google')`,
        [F.STUDENT_AARAV],
      ),
    );
    expect(msg).toMatch(/srisriuniversity.edu.in/);
  });

  it('allows a Google identity to link to a pre-provisioned student', async () => {
    const r = await db.sudo(
      `insert into auth.identities (provider_id, user_id, identity_data, provider)
       values ('g-ok', $1, '{"sub":"g-ok","email":"ishaan.rao.odl25@srisriuniversity.edu.in"}', 'google') returning id`,
      [F.STUDENT_ISHAAN],
    );
    expect(r).toHaveLength(1);
  });

  it('before_user_created_hook accepts only accounts the ODL office created', async () => {
    const [ok] = await db.sudo<{ r: Record<string, unknown> }>(
      `select before_user_created_hook('{"user":{"email":"t@srisriuniversity.edu.in","app_metadata":{"provider":"email","provisioned_by":"admin"}}}') as r`,
    );
    expect(ok.r).toEqual({});
    for (const meta of ['{"provider":"google","providers":["google"]}', '{"provider":"email"}', '{}']) {
      const [bad] = await db.sudo<{ r: { error?: { http_code: number; message: string } } }>(
        `select before_user_created_hook(jsonb_build_object('user', jsonb_build_object('email', 'x@srisriuniversity.edu.in', 'app_metadata', $1::jsonb))) as r`,
        [meta],
      );
      expect(bad.r.error?.http_code, meta).toBe(403);
      expect(bad.r.error?.message, meta).toMatch(/created by the ODL office/i);
    }
  });

  it('the hook is not callable by app roles', async () => {
    await expectDenied(db.rows(aarav, `select before_user_created_hook('{}')`));
    await expectDenied(db.rows(ANON, `select before_user_created_hook('{}')`));
  });
});
