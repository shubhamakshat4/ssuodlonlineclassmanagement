import { expect, test } from '@playwright/test';
import { signInWithPassword } from './helpers';

/**
 * Demo walkthrough against a live project using only password accounts (no service-role key needed).
 * Run: E2E_BASE_URL=http://localhost:3100 E2E_NO_SERVER=1 npx playwright test e2e/demo-walkthrough.spec.ts
 */
const ADMIN = { email: 'odl.admin@srisriuniversity.edu.in', password: 'AdminPass12345' };
const TEACHER = { email: 'anand.mishra@srisriuniversity.edu.in', password: 'TeacherPass12345' };

test('admin can reach every screen with data', async ({ page, baseURL }) => {
  await signInWithPassword(page, ADMIN.email, ADMIN.password, baseURL);
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: /Welcome, Priya/ })).toBeVisible();

  const screens: Array<[string, RegExp]> = [
    ['/admin/programs', /BBA-ODL/],
    ['/admin/batches', /BBA-ODL-2025/],
    ['/admin/students', /ODL25BBA001/],
    ['/admin/teachers', /Dr\. Anand Mishra/],
    ['/admin/timetable', /week view/],
    ['/admin/holidays', /Gandhi Jayanti/],
    ['/admin/sessions', /Financial Management/],
    ['/admin/sync-health', /Failed sessions/],
    ['/admin/audit-log', /demo\.seeded|session\./],
  ];
  await page.goto(`${baseURL}/admin/subjects`);
  await expect(page.locator('input[value="Financial Management"]')).toBeVisible();
  for (const [path, marker] of screens) {
    await page.goto(`${baseURL}${path}`);
    await expect(page.locator('body'), path).toContainText(marker);
  }
  await page.goto(`${baseURL}/admin/attendance?batch=e0000000-0000-4000-8000-000000000001&from=2026-08-01&to=2026-12-31`);
  await expect(page.getByText('Joined / total')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download CSV' })).toBeVisible();
});

test('teacher sees today/upcoming, edits a link, reverts', async ({ page, baseURL }) => {
  await signInWithPassword(page, TEACHER.email, TEACHER.password, baseURL);
  await expect(page).toHaveURL(/\/teacher$/);
  await page.goto(`${baseURL}/teacher/upcoming`);
  const edit = page.getByRole('link', { name: /Edit link \/ roster/ }).first();
  await expect(edit).toBeVisible();
  await edit.click();
  await expect(page).toHaveURL(/\/teacher\/sessions\//);
  await page.getByTestId('override-url').fill('https://meet.google.com/demo-walk-thru');
  await page.getByRole('button', { name: /Use this link instead of Teams/ }).click();
  await expect(page.getByText(/Link saved/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('effective-url')).toHaveText('https://meet.google.com/demo-walk-thru');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: /Revert to auto-generated Teams link/ }).click();
  await expect(page.getByTestId('reverted-note')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Not ready yet/)).toBeVisible();
  await page.goto(`${baseURL}/teacher/timetable`);
  await expect(page.locator('body')).toContainText('BBA301');
});

test('student area is Google-only and other roles are bounced', async ({ page, baseURL }) => {
  await signInWithPassword(page, TEACHER.email, TEACHER.password, baseURL);
  await page.goto(`${baseURL}/student`);
  await expect(page).toHaveURL(/\/teacher$/);
  await page.goto(`${baseURL}/admin/students`);
  await expect(page).toHaveURL(/\/teacher$/);
});
