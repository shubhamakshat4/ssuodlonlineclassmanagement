import { expect, test } from '@playwright/test';
import { adminClient, resetLiveSession, SEED, signInStudent } from './helpers';

/**
 * Journey 1 (SPEC §14): student signs in → sees today's class → clicks Join → attendance row exists.
 */
test.describe('student join journey', () => {
  test.beforeEach(async () => {
    await resetLiveSession();
  });

  test('student sees the live class, joins, and an attendance row is written', async ({ page, context, baseURL }) => {
    await signInStudent(page, SEED.studentEmail, baseURL);
    await expect(page.getByRole('heading', { name: /Hello, Aarav/ })).toBeVisible();

    const card = page.getByTestId(`session-${SEED.liveSessionId}`);
    await expect(card).toBeVisible();
    await expect(card).toContainText('Financial Management');
    await expect(card).toContainText('Dr. Anand Mishra');

    const popupPromise = context.waitForEvent('page');
    await card.getByTestId(`join-${SEED.liveSessionId}`).click();
    const popup = await popupPromise;
    await popup.waitForURL((u) => u.hostname.includes('teams.microsoft.com'), { waitUntil: 'commit', timeout: 20_000 });
    await popup.close();

    const admin = adminClient();
    const { data } = await admin.from('attendance').select('student_id, ip, user_agent, clicked_at').eq('class_session_id', SEED.liveSessionId).eq('student_id', SEED.studentId).maybeSingle();
    expect(data).not.toBeNull();
    expect(data?.user_agent).toBeTruthy();

    // a second click does not duplicate
    const againPromise = context.waitForEvent('page');
    await card.getByTestId(`join-${SEED.liveSessionId}`).click();
    const again = await againPromise;
    await again.close();
    const { count } = await admin.from('attendance').select('id', { count: 'exact', head: true }).eq('class_session_id', SEED.liveSessionId).eq('student_id', SEED.studentId);
    expect(count).toBe(1);
  });

  test('Join is disabled outside the window', async ({ page, baseURL }) => {
    await signInStudent(page, SEED.studentEmail, baseURL);
    const later = page.getByTestId(`session-${SEED.laterSessionId}`);
    await expect(later).toBeVisible();
    await expect(later.getByRole('button')).toBeDisabled();
    await expect(later.getByRole('button')).toContainText(/Opens in/);
  });

  test('a student from another batch cannot see the class', async ({ page, baseURL }) => {
    await signInStudent(page, 'kabir.malhotra.odl25@srisriuniversity.edu.in', baseURL);
    await expect(page.getByTestId(`session-${SEED.liveSessionId}`)).toHaveCount(0);
  });
});
