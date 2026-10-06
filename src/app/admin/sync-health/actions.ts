'use server';

import { z } from 'zod';
import { ActionError, audit, formAction, must } from '@/lib/actions';
import { serverEnv } from '@/lib/env';

const REVALIDATE = ['/admin/sync-health', '/admin/sessions', '/admin'];

/**
 * Runs the provisioner by calling the deployed Edge Function, and waits for its summary.
 *
 * It used to run the job in-process on the Next.js server instead. That quietly broke two things: the
 * Microsoft credentials live in Supabase's function secrets, not in the web host's environment, so the
 * button ran on the mock client and handed out teams.microsoft.com/.../mock/... links; and it put Graph
 * calls on a user request path, which this project deliberately does not do (see CLAUDE.md - every
 * Graph call belongs in an Edge Function). Calling the function fixes both: one place holds the
 * credentials, and this button and the ten-minute cron run exactly the same code.
 */
export const runProvisionerNow = formAction({ roles: ['admin'], schema: z.object({}), revalidate: REVALIDATE }, async (_input, { supabase }) => {
  const summary = await callEdgeFunction('cron-provision-meetings');
  await audit(supabase, 'provisioner.run_now', 'class_sessions', null, summary);
  const s = summary as { claimed?: number; provisioned?: number; patched?: number; failed?: number; deleted?: number; recovered?: number; errors?: { error: string }[] };
  const errs = s.errors?.length ? ` Errors: ${s.errors.slice(0, 3).map((e) => e.error).join(' | ')}` : '';
  return {
    message: `Provisioner: claimed ${s.claimed ?? 0}, provisioned ${s.provisioned ?? 0}, patched ${s.patched ?? 0}, failed ${s.failed ?? 0}, events deleted ${s.deleted ?? 0}, recovered ${s.recovered ?? 0}.${errs}`,
  };
});

/** Harvest recordings for classes that have finished, without waiting for the hourly job. */
export const runHarvesterNow = formAction({ roles: ['admin'], schema: z.object({}), revalidate: [...REVALIDATE, '/admin/report'] }, async (_input, { supabase }) => {
  const summary = await callEdgeFunction('cron-harvest-recordings');
  await audit(supabase, 'harvester.run_now', 'recordings', null, summary);
  const s = summary as { checked?: number; harvested?: number; pending?: number; errors?: { error: string }[] };
  const errs = s.errors?.length ? ` Errors: ${s.errors.slice(0, 3).map((e) => e.error).join(' | ')}` : '';
  return { message: `Recordings: checked ${s.checked ?? 0}, harvested ${s.harvested ?? 0}, still pending ${s.pending ?? 0}.${errs}` };
});

/**
 * The function accepts the cron secret or the service-role key as a bearer token (requireServiceRole).
 * Both are server-only; neither is ever sent to a browser.
 */
async function callEdgeFunction(name: string): Promise<Record<string, unknown>> {
  const { supabaseUrl, supabaseServiceRoleKey } = serverEnv();
  const token = process.env.CRON_SECRET?.trim() || supabaseServiceRoleKey;
  const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 401) {
      throw new ActionError(`${name} rejected the call (401). Set CRON_SECRET on this server to the same value as the function's secret.`);
    }
    throw new ActionError(`${name} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text.slice(0, 300) };
  }
}

export const retryAllFailed = formAction({ roles: ['admin'], schema: z.object({}), revalidate: REVALIDATE }, async (_input, { supabase }) => {
  const rows = must<{ id: string }[]>(
    await supabase
      .from('class_sessions')
      .update({ sync_status: 'pending', sync_attempts: 0, sync_error: null })
      .eq('sync_status', 'failed')
      .eq('status', 'scheduled')
      .gt('scheduled_end', new Date().toISOString())
      .select('id'),
  );
  await audit(supabase, 'sessions.retry_all_failed', 'class_sessions', null, { count: rows.length });
  return { message: `${rows.length} session(s) re-queued. The provisioner picks them up within 10 minutes, or press "Run provisioner now".` };
});
