import { expect, test } from '@playwright/test';
import { adminClient, clearOverride, disposeFixture, loadFixture, makeLive, signInStudent, signInWithPassword, TEACHER_TEST_PASSWORD, type Fixture } from './helpers';

/**
 * Journey 2 (SPEC §14): teacher overrides a link → the student's dashboard shows the new URL and the
 * "Link updated" badge → reverting re-queues a fresh Teams meeting. Runs on the fixture's throwaway
 * session, so no real class is touched.
 */
test.describe.configure({ mode: 'serial' });

let f: Fixture;

test.beforeAll(async () => {
  f = await loadFixture();
  await makeLive(f.sessionId);
});
test.afterAll(async () => {
  await clearOverride(f.sessionId, f.studentId);
  await disposeFixture(f);
});

test('teacher sets a Google Meet link; student sees the badge and joins via the new link', async ({ browser, baseURL }) => {
  const teacherCtx = await browser.newContext();
  const teacher = await teacherCtx.newPage();
  await signInWithPassword(teacher, f.teacherEmail, TEACHER_TEST_PASSWORD, baseURL);
  await expect(teacher).toHaveURL(/\/teacher/);

  await teacher.goto(`${baseURL}/teacher/sessions/${f.sessionId}`);
  await teacher.getByTestId('override-url').fill('https://meet.google.com/abc-defg-hij');
  await expect(teacher.getByText(/Recording will not be available/)).toBeVisible();
  await teacher.getByRole('button', { name: /Use this link instead of Teams/ }).click();
  await expect(teacher.getByText(/Link saved/)).toBeVisible({ timeout: 20_000 });
  await expect(teacher.getByTestId('effective-url')).toHaveText('https://meet.google.com/abc-defg-hij');

  const admin = adminClient();
  const { data: row } = await admin.from('class_sessions').select('provider, teams_join_url, join_url_override, override_set_by').eq('id', f.sessionId).single();
  expect(row).toMatchObject({ provider: 'custom', teams_join_url: null, join_url_override: 'https://meet.google.com/abc-defg-hij', override_set_by: f.teacherId });
  const { data: audit } = await admin.from('audit_log').select('id').eq('action', 'session.override_set').eq('entity_id', f.sessionId);
  expect((audit ?? []).length).toBeGreaterThan(0);

  const studentCtx = await browser.newContext();
  const student = await studentCtx.newPage();
  await signInStudent(student, f.studentEmail, baseURL);
  const card = student.getByTestId(`session-${f.sessionId}`);
  await expect(card.getByTestId('link-updated')).toBeVisible();
  const popupPromise = studentCtx.waitForEvent('page');
  await card.getByTestId(`join-${f.sessionId}`).click();
  const popup = await popupPromise;
  await popup.waitForURL((u) => u.href.includes('meet.google.com/abc-defg-hij'), { waitUntil: 'commit', timeout: 25_000 });
  await popup.close();

  teacher.once('dialog', (d) => d.accept());
  await teacher.getByRole('button', { name: /Revert to auto-generated Teams link/ }).click();
  await expect(teacher.getByTestId('reverted-note')).toBeVisible({ timeout: 20_000 });
  const { data: after } = await admin.from('class_sessions').select('provider, sync_status, join_url_override').eq('id', f.sessionId).single();
  expect(after).toMatchObject({ provider: 'teams', sync_status: 'pending', join_url_override: null });

  await teacherCtx.close();
  await studentCtx.close();
});

test('a teacher cannot open a colleague’s class', async ({ page, baseURL }) => {
  const admin = adminClient();
  const { data: other } = await admin.from('v_class_sessions').select('id').neq('teacher_id', f.teacherId).eq('status', 'scheduled').limit(1).single();
  await signInWithPassword(page, f.teacherEmail, TEACHER_TEST_PASSWORD, baseURL);
  const res = await page.goto(`${baseURL}/teacher/sessions/${other!.id}`);
  expect(res?.status()).toBe(404);
});
