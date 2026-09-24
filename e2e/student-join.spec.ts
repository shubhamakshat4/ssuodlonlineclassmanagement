import { expect, test } from '@playwright/test';
import { adminClient, disposeFixture, loadFixture, makeLive, signInStudent, type Fixture } from './helpers';

/**
 * Journey 1 (SPEC §14): student signs in → sees today's class → clicks Join → attendance row exists.
 * Runs against whatever data is loaded (demo seed or the live ODL timetable). The live class is a
 * throwaway session created by the fixture; real classes are only read.
 */
test.describe.configure({ mode: 'serial' });

let f: Fixture;

test.beforeAll(async () => {
  f = await loadFixture();
});
test.afterAll(async () => {
  await disposeFixture(f);
});

test('student sees the live class, joins, and an attendance row is written', async ({ page, context, baseURL }) => {
  await makeLive(f.sessionId);
  await signInStudent(page, f.studentEmail, baseURL);

  const card = page.getByTestId(`session-${f.sessionId}`);
  await expect(card).toBeVisible();

  const popupPromise = context.waitForEvent('page');
  await card.getByTestId(`join-${f.sessionId}`).click();
  const popup = await popupPromise;
  await popup.waitForURL((u) => u.hostname.includes('teams.microsoft.com') || u.hostname.includes('meet.google.com') || u.hostname.includes('zoom'), { waitUntil: 'commit', timeout: 25_000 });
  await popup.close();

  const admin = adminClient();
  const { data } = await admin.from('attendance').select('student_id, user_agent').eq('class_session_id', f.sessionId).eq('student_id', f.studentId).maybeSingle();
  expect(data).not.toBeNull();
  expect(data?.user_agent).toBeTruthy();

  // a second click does not duplicate
  const againPromise = context.waitForEvent('page');
  await card.getByTestId(`join-${f.sessionId}`).click();
  const again = await againPromise;
  await again.close();
  const { count } = await admin.from('attendance').select('id', { count: 'exact', head: true }).eq('class_session_id', f.sessionId).eq('student_id', f.studentId);
  expect(count).toBe(1);
});

test('Join stays available before the window and explains when it opens', async ({ page, baseURL }) => {
  await signInStudent(page, f.studentEmail, baseURL);
  // the group's next real class, which is still in the future — never modified by the suite
  const later = page.getByTestId(`session-${f.laterSessionId}`);
  const button = later.getByRole('button').first();
  await expect(button).toBeEnabled();
  await expect(button).toContainText(/Join Now/i);
  await button.click();
  await expect(later.getByTestId('join-note')).toContainText(/minutes before the scheduled time/i);
});

test('a student from another class group cannot see the class', async ({ page, baseURL }) => {
  await signInStudent(page, f.otherStudentEmail, baseURL);
  await expect(page.getByTestId(`session-${f.sessionId}`)).toHaveCount(0);
});
