import { expect, test } from '@playwright/test';
import { ADMIN, loadFixture, signInStudent, signInWithPassword, TEACHER_TEST_PASSWORD, type Fixture } from './helpers';

/**
 * Every screen of every role loads with real content. Data-agnostic: the accounts come from
 * whatever is in the database.
 */
test.describe.configure({ mode: 'serial' });

let f: Fixture;
test.beforeAll(async () => {
  f = await loadFixture();
});

test('admin can reach every screen with data', async ({ page, baseURL }) => {
  await signInWithPassword(page, ADMIN.email, ADMIN.password, baseURL);
  await expect(page).toHaveURL(/\/admin$/);

  const screens: Array<[string, RegExp]> = [
    ['/admin', /Active students/i],
    ['/admin/programs', /Programmes/i],
    ['/admin/batches', /Class groups/i],
    ['/admin/subjects', /Subjects/i],
    ['/admin/students', /student\(s\)/i],
    ['/admin/teachers', /Teachers/i],
    ['/admin/timetable', /week view/i],
    ['/admin/holidays', /Holidays/i],
    ['/admin/sessions', /Sessions/i],
    ['/admin/sync-health', /Sync health/i],
    ['/admin/audit-log', /Audit log/i],
    ['/admin/import', /Import from CSV/i],
  ];
  for (const [path, marker] of screens) {
    await page.goto(`${baseURL}${path}`);
    await expect(page.locator('body'), path).toContainText(marker);
  }
  // password-based roles can reach the change-password page from the header
  await expect(page.getByRole('link', { name: /Change password/i })).toBeVisible();
  await page.goto(`${baseURL}/account/password`);
  await expect(page.locator('#password')).toBeVisible();

  // every student row offers an explicit Edit button, and the form exposes both class groups
  await page.goto(`${baseURL}/admin/students`);
  await expect(page.getByRole('columnheader', { name: 'Second group' })).toBeVisible();
  await page.getByRole('link', { name: 'Edit' }).first().click();
  await expect(page.locator('#batch_id')).toBeVisible();
  await expect(page.locator('#secondary_batch_id')).toBeVisible();

  await page.goto(`${baseURL}/admin/attendance?batch=${f.groupId}&from=2026-09-01&to=2026-12-31`);
  await expect(page.getByText('Joined / total')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download CSV' })).toBeVisible();
});

test('teacher sees today, upcoming, timetable and a session', async ({ page, baseURL }) => {
  await signInWithPassword(page, f.teacherEmail, TEACHER_TEST_PASSWORD, baseURL);
  await expect(page).toHaveURL(/\/teacher$/);
  await page.goto(`${baseURL}/teacher/upcoming`);
  await expect(page.getByRole('link', { name: /Edit link \/ roster/ }).first()).toBeVisible();
  await page.goto(`${baseURL}/teacher/timetable`);
  await expect(page.locator('body')).toContainText(/Weekly timetable/i);
});

test('student sees classes, timetable and profile', async ({ page, baseURL }) => {
  await signInStudent(page, f.studentEmail, baseURL);
  await expect(page.locator('body')).toContainText(/Today/i);
  await page.goto(`${baseURL}/student/timetable`);
  await expect(page.locator('body')).toContainText(/All scheduled classes/i);
  await page.goto(`${baseURL}/student/profile`);
  await expect(page.locator('body')).toContainText(/Roll number/i);
  // both addresses are shown, and neither is invented: one of them may read "Not issued yet"
  await expect(page.locator('body')).toContainText(/College email/i);
  await expect(page.locator('body')).toContainText(/Personal email/i);
  // students sign in with a password now, so they get the header link and the reset setup
  await page.getByRole('link', { name: /Change password/i }).click();
  await expect(page.locator('#password')).toBeVisible();
  await expect(page.getByRole('link', { name: /security questions/i })).toBeVisible();
});

test('roles cannot enter each other’s area', async ({ page, baseURL }) => {
  await signInWithPassword(page, f.teacherEmail, TEACHER_TEST_PASSWORD, baseURL);
  await page.goto(`${baseURL}/student`);
  await expect(page).toHaveURL(/\/teacher$/);
  await page.goto(`${baseURL}/admin/students`);
  await expect(page).toHaveURL(/\/teacher$/);
});
