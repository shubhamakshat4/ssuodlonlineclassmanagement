/**
 * Phase 6 Graph spike — proves SPEC §7.2 steps 1→3 against the real tenant with ONE throwaway
 * class, then cleans up. Run: `npm run graph:spike`
 *
 * Safety:
 *   - Uses a [TEST] subject and SPIKE_TEACHER_UPN (a test mailbox). If SPIKE_TEACHER_UPN is unset the
 *     service account itself is the attendee, so no human receives an invite (co-organiser assignment
 *     to a second real user then goes untested — the report says so).
 *   - Deletes the calendar event at the end, even on failure.
 *   - With GRAPH_MODE!=real or missing credentials it runs against the mock and says so loudly.
 *
 * Appends a report to docs/GRAPH_SPIKE_LOG.md.
 */
import './_env';
import fs from 'node:fs';
import path from 'node:path';
import { createGraphClient, GraphError, hasRealGraphCredentials, type GraphCallLog, type GraphClient, type GraphEnv } from '../supabase/functions/_shared/graph/index.ts';
import { runProvisionSequence } from '../supabase/functions/_shared/graph/sequence.ts';
import { toGraphLocalDateTime } from '../supabase/functions/_shared/time.ts';

const env: GraphEnv & NodeJS.ProcessEnv = process.env;
const wantReal = (env.GRAPH_MODE ?? '').toLowerCase() === 'real';
const haveCreds = hasRealGraphCredentials(env);
const real = wantReal && haveCreds;

const lines: string[] = [];
const log = (s: string) => {
  console.log(s);
  lines.push(s);
};
const calls: GraphCallLog[] = [];

async function main() {
  log(`# Graph spike — ${new Date().toISOString()}`);
  log('');
  if (!real) {
    log(`> **NOT RUN AGAINST THE REAL TENANT.** GRAPH_MODE=${env.GRAPH_MODE ?? '(unset)'}; credentials ${haveCreds ? 'present' : 'missing'}.`);
    log('> Running the same sequence against the mock so the code path is exercised. Set GRAPH_MODE=real and the MS_* values in .env.local to run for real.');
    log('');
  }

  const graph: GraphClient = createGraphClient({ ...env, GRAPH_MODE: real ? 'real' : 'mock' }, { onCall: (c) => void calls.push(c) });
  const teacherUpn = (env.SPIKE_TEACHER_UPN && !env.SPIKE_TEACHER_UPN.startsWith('test.teacher@yourtenant') ? env.SPIKE_TEACHER_UPN : null) ?? env.MS_SERVICE_ACCOUNT_UPN ?? 'classes@example.onmicrosoft.com';
  const usingServiceAccountAsTeacher = teacherUpn === env.MS_SERVICE_ACCOUNT_UPN;
  if (graph.mode === 'mock') (graph as unknown as { users: Map<string, string> }).users.set(teacherUpn.toLowerCase(), '00000000-0000-4000-8000-00000000c0de');

  const start = new Date(Date.now() + 60 * 60 * 1000);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const sessionId = `spike-${Date.now()}`;
  let eventId: string | null = null;

  try {
    log(`Teacher/attendee: ${teacherUpn}${usingServiceAccountAsTeacher ? ' (service account stand-in — co-organiser assignment to a second real user is UNTESTED)' : ''}`);
    log(`Window: ${toGraphLocalDateTime(start)} → ${toGraphLocalDateTime(end)} IST`);
    const outcome = await runProvisionSequence(graph, {
      sessionId,
      subject: `[TEST] ODL portal spike — ${sessionId}`,
      startLocal: toGraphLocalDateTime(start),
      endLocal: toGraphLocalDateTime(end),
      timeZone: 'Asia/Kolkata',
      teacherUpn,
      teacherUserId: null,
      recordAutomatically: true,
    });
    eventId = outcome.eventId;
    log('');
    log('## Result');
    log(`- Step 1 create calendar event: OK — eventId=${outcome.eventId}`);
    log(`- joinUrl: ${outcome.joinUrl}`);
    log(`- Step 2 resolve onlineMeeting: OK — meetingId=${outcome.meetingId}`);
    log(`- Step 3 meeting options: ${outcome.autoRecording ? 'OK with recordAutomatically=true' : 'recordAutomatically REJECTED — applied without it'}`);
    if (outcome.recordAutomaticallyError) {
      log(`  - error: ${outcome.recordAutomaticallyError}`);
      log('  - **Action:** set GRAPH_RECORDING_MODE=manual in Edge Function secrets (fallback §7.4) and record it in docs/BLOCKERS.md');
    }
    log(`- Teacher object id: ${outcome.teacherUserId ?? 'unresolved'}`);
    log('');
    log(real ? '**VERDICT: GREEN — design assumption holds on this tenant.**' : '**VERDICT: MOCK ONLY — no conclusion about the real tenant.**');
  } catch (e) {
    log('');
    log('## FAILED');
    if (e instanceof GraphError) {
      log(`- endpoint: ${e.endpoint}`);
      log(`- status: ${e.status} code: ${e.code ?? '-'} request-id: ${e.requestId ?? '-'}`);
      log(`- message: ${e.message}`);
      if (e.status === 403) log('- **Likely cause:** application access policy not granted to the service account (docs/M365_SETUP.md). Confirm with IT, wait 30 min, re-run.');
    } else {
      log(`- ${(e as Error).message}`);
    }
    log('');
    log('**VERDICT: RED — do not build on §7.2 until this passes. Fallback (§7.4) is implemented; record the failure in docs/BLOCKERS.md.**');
    process.exitCode = 1;
  } finally {
    if (eventId) {
      try {
        await graph.deleteEvent(eventId, sessionId);
        log(`- Cleanup: deleted event ${eventId}`);
      } catch (e) {
        log(`- Cleanup FAILED for event ${eventId}: ${(e as Error).message} — delete it manually from the service account calendar`);
      }
    }
    log('');
    log('## Calls');
    for (const c of calls) log(`- ${c.endpoint} → ${c.status} (${c.durationMs} ms, attempt ${c.attempt}, request-id ${c.requestId ?? '-'})${c.error ? ` error: ${c.error.slice(0, 200)}` : ''}`);
    const file = path.resolve(process.cwd(), 'docs', 'GRAPH_SPIKE_LOG.md');
    fs.appendFileSync(file, lines.join('\n') + '\n\n---\n\n');
    console.log(`\nReport appended to ${file}`);
  }
}

main();
