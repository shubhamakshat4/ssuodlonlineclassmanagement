'use server';

import { z } from 'zod';
import { ActionError, audit, formAction, must } from '@/lib/actions';
import { createAdminClient } from '@/lib/supabase/admin';
import { createGraphClient, type GraphEnv } from '@shared/graph/index.ts';
import { graphAuditHook } from '@shared/graph/audit.ts';
import { runProvisionMeetings } from '@shared/jobs/provision-meetings.ts';

const REVALIDATE = ['/admin/sync-health', '/admin/sessions', '/admin'];

/**
 * Runs the provisioner in-process on the Next.js server (service role, server-side only — never
 * from the browser). Requires GRAPH_MODE to be set explicitly so production can never run on the mock
 * by accident.
 */
export const runProvisionerNow = formAction({ roles: ['admin'], schema: z.object({}), revalidate: REVALIDATE }, async (_input, { supabase }) => {
  const mode = process.env.GRAPH_MODE;
  if (!mode) throw new ActionError('GRAPH_MODE is not set on the server (real|mock). Set it in .env.local / hosting env before running the provisioner from here.');
  const admin = createAdminClient();
  const graph = createGraphClient(process.env as GraphEnv, { onCall: graphAuditHook(admin) });
  const summary = await runProvisionMeetings(admin, graph, {
    limit: 20,
    recordAutomatically: (process.env.GRAPH_RECORDING_MODE ?? 'auto').toLowerCase() !== 'manual',
  });
  await audit(supabase, 'provisioner.run_now', 'class_sessions', null, { ...summary, graphMode: graph.mode });
  const errs = summary.errors.length ? ` Errors: ${summary.errors.map((e) => e.error).slice(0, 3).join(' | ')}` : '';
  return {
    message: `Provisioner (${graph.mode}): claimed ${summary.claimed}, provisioned ${summary.provisioned}, patched ${summary.patched}, failed ${summary.failed}, events deleted ${summary.deleted}, recovered ${summary.recovered}.${errs}`,
  };
});

export const retryAllFailed = formAction({ roles: ['admin'], schema: z.object({}), revalidate: REVALIDATE }, async (_input, { supabase }) => {
  const rows = must<{ id: string }[]>(
    await supabase.from('class_sessions').update({ sync_status: 'pending', sync_attempts: 0, sync_error: null }).eq('sync_status', 'failed').eq('status', 'scheduled').gt('scheduled_end', new Date().toISOString()).select('id'),
  );
  await audit(supabase, 'session.retry_all_failed', 'class_sessions', null, { count: rows.length });
  return { message: `${rows.length} session(s) re-queued.` };
});
