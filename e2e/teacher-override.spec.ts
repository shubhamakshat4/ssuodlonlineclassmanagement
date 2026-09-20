import { expect, test } from '@playwright/test';
import { adminClient, resetLiveSession, SEED, signInStudent, signInWithPassword } from './helpers';

/**
 * Journey 2 (SPEC §14): teacher overrides a link → student's dashboard shows the new URL and the
 * "Link updated" badge (and Join opens the new URL).
 */
test.describe('teacher link override journey', () => {
  test.beforeEach(async () => {
    await resetLiveSession();
  });

  test('teacher sets a Google Meet link; student sees the badge and joins via the new link', async ({ browser, baseURL }) => {
    const teacherCtx = await browser.newContext();
    const teacher = await teacherCtx.newPage();
    await signInWithPassword(teacher, SEED.teacherEmail, SEED.teacherPassword, baseURL);
    await expect(teacher).toHaveURL(/\/teacher/);

    await teacher.getByTestId(`edit-${SEED.liveSessionId}`).click();
    await expect(teacher).toHaveURL(new RegExp(`/teacher/sessions/${SEED.liveSessionId}`));
    await teacher.getByTestId('override-url').fill('https://meet.google.com/abc-defg-hij');
    await expect(teacher.getByText(/Recording will not be available/)).toBeVisible();
    await teacher.getByRole('button', { name: /Use this link instead of Teams/ }).click();
    await expect(teacher.getByText(/Link saved/)).toBeVisible();
    await expect(teacher.getByTestId('effective-url')).toHaveText('https://meet.google.com/abc-defg-hij');

    // Database reflects §9 side effects
    const admin = adminClient();
    const { data: row } = await admin.from('class_sessions').select('provider, teams_join_url, join_url_override, override_set_by').eq('id', SEED.liveSessionId).single();
    expect(row).toMatchObject({ provider: 'custom', teams_join_url: null, join_url_override: 'https://meet.google.com/abc-defg-hij', override_set_by: SEED.teacherId });
    const { data: audit } = await admin.from('audit_log').select('id').eq('action', 'session.override_set').eq('entity_id', SEED.liveSessionId);
    expect((audit ?? []).length).toBeGreaterThan(0);

    // Student side
    const studentCtx = await browser.newContext();
    const student = await studentCtx.newPage();
    await signInStudent(student, SEED.studentEmail, baseURL);
    const card = student.getByTestId(`session-${SEED.liveSessionId}`);
    await expect(card.getByTestId('link-updated')).toBeVisible();
    const popupPromise = studentCtx.waitForEvent('page');
    await card.getByTestId(`join-${SEED.liveSessionId}`).click();
    const popup = await popupPromise;
    await popup.waitForLoadState('domcontentloaded').catch(() => {});
    expect(popup.url()).toContain('meet.google.com/abc-defg-hij');
    await popup.close();

    // Revert re-queues a Teams meeting
    teacher.once('dialog', (d) => d.accept());
    await teacher.getByRole('button', { name: /Revert to auto-generated Teams link/ }).click();
    await expect(teacher.getByTestId('reverted-note')).toBeVisible({ timeout: 20_000 });
    const { data: after } = await admin.from('class_sessions').select('provider, sync_status, join_url_override').eq('id', SEED.liveSessionId).single();
    expect(after).toMatchObject({ provider: 'teams', sync_status: 'pending', join_url_override: null });

    await teacherCtx.close();
    await studentCtx.close();
  });

  test('a teacher cannot open a colleague’s class', async ({ page, baseURL }) => {
    await signInWithPassword(page, 'kavita.sen@srisriuniversity.edu.in', SEED.teacherPassword, baseURL);
    const res = await page.goto(`${baseURL}/teacher/sessions/${SEED.liveSessionId}`);
    expect(res?.status()).toBe(404);
  });
});
