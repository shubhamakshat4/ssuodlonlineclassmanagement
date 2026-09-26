import { expect, test } from '@playwright/test';
import { adminClient, clearSignInThrottle, signInWithPassword } from './helpers';

/**
 * A student may sign in with their college address or their personal one, with the same password,
 * because both resolve to the same single account (src/lib/auth/resolve-login.ts).
 *
 * The suite does not know anybody's real password, so it sets one on a student who has both addresses,
 * proves each address works with it, and puts the account back as it found it.
 */
test.describe.configure({ mode: 'serial' });

const PASSWORD = 'BothAddresses26';

let student: { id: string; college_email: string; personal_email: string; login: string };
let hadMustChange: unknown;

test.beforeAll(async () => {
  const admin = adminClient();
  const { data } = await admin
    .from('students')
    .select('id, college_email, personal_email, status, profiles!inner(email)')
    .not('college_email', 'is', null)
    .not('personal_email', 'is', null)
    .eq('status', 'active')
    .limit(1);
  const row = (data as unknown as { id: string; college_email: string; personal_email: string; profiles: { email: string } }[] | null)?.[0];
  if (!row) throw new Error('no active student has both a college and a personal email');
  student = { id: row.id, college_email: row.college_email, personal_email: row.personal_email, login: row.profiles.email };

  await clearSignInThrottle(student.college_email, student.personal_email, student.login);
  const { data: before } = await admin.auth.admin.getUserById(student.id);
  hadMustChange = before?.user?.app_metadata?.must_change_password;
  // must_change_password off, or every sign-in redirects to the password page instead of the portal
  await admin.auth.admin.updateUserById(student.id, {
    password: PASSWORD,
    app_metadata: { ...(before?.user?.app_metadata ?? {}), must_change_password: false },
  });
});

test.afterAll(async () => {
  const admin = adminClient();
  const { data: now } = await admin.auth.admin.getUserById(student.id);
  await admin.auth.admin.updateUserById(student.id, {
    app_metadata: { ...(now?.user?.app_metadata ?? {}), must_change_password: hadMustChange === true },
  });
});

test('the college address signs in', async ({ page, baseURL }) => {
  await signInWithPassword(page, student.college_email, PASSWORD, baseURL);
  await expect(page).toHaveURL(/\/student/);
});

test('the personal address signs in with the very same password', async ({ page, baseURL }) => {
  expect(student.personal_email).not.toBe(student.college_email);
  await signInWithPassword(page, student.personal_email, PASSWORD, baseURL);
  await expect(page).toHaveURL(/\/student/);
  // and it is one account, not two
  const admin = adminClient();
  const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true }).in('email', [student.college_email, student.personal_email]);
  expect(count).toBe(1);
});

test('a wrong password is still refused from either address', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/login`);
  await page.fill('#email', student.personal_email);
  await page.fill('#password', 'NotThePassword9');
  await page.click('button[type=submit]');
  await expect(page.getByTestId('login-error')).toContainText(/Incorrect email or password/i);
});
