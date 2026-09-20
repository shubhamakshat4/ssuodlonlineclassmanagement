import { ActionForm } from '@/components/action-form';
import { SyncBadge } from '@/components/session-badges';
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader, Table, TBody, TD, TH, THead, TR } from '@/components/ui/primitives';
import { createClient } from '@/lib/supabase/server';
import type { AuditLog, ClassSessionView } from '@/lib/db/types';
import { formatIst } from '@/lib/domain/time';
import { retrySession } from '../sessions/actions';
import { retryAllFailed, runProvisionerNow } from './actions';

export const metadata = { title: 'Sync health — Admin' };

export default async function SyncHealthPage() {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const head = { count: 'exact' as const, head: true };
  const [{ data: failed }, { data: stuck }, pendingRes, provisioningRes, { data: graphCalls }, { data: runs }] = await Promise.all([
    supabase.from('v_class_sessions').select('*').eq('sync_status', 'failed').order('scheduled_start').limit(200),
    supabase.from('v_class_sessions').select('*').eq('sync_status', 'pending').eq('status', 'scheduled').lt('scheduled_start', new Date(Date.now() + 30 * 60 * 1000).toISOString()).gt('scheduled_end', nowIso).order('scheduled_start').limit(50),
    supabase.from('class_sessions').select('id', head).eq('sync_status', 'pending').eq('status', 'scheduled').gt('scheduled_end', nowIso),
    supabase.from('class_sessions').select('id', head).eq('sync_status', 'provisioning'),
    supabase.from('audit_log').select('*').eq('action', 'graph.call').order('created_at', { ascending: false }).limit(30),
    supabase.from('audit_log').select('*').in('action', ['provisioner.run', 'provisioner.run_now']).order('created_at', { ascending: false }).limit(5),
  ]);
  const failedRows = (failed ?? []) as ClassSessionView[];
  const stuckRows = (stuck ?? []) as ClassSessionView[];
  const calls = (graphCalls ?? []) as AuditLog[];
  const lastRuns = (runs ?? []) as AuditLog[];
  const graphMode = process.env.GRAPH_MODE ?? '(unset)';

  return (
    <>
      <PageHeader
        title="Sync health"
        description="Teams meeting provisioning status. The provisioner runs every 10 minutes; failures land here after 5 attempts."
        actions={
          <div className="flex gap-2">
            <ActionForm action={runProvisionerNow} inline submitLabel="Run provisioner now" pendingLabel="Running…" variant="outline" />
            <ActionForm action={retryAllFailed} inline submitLabel="Retry all failed" variant="secondary" />
          </div>
        }
      />
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Pending" value={pendingRes.count ?? 0} />
        <Stat label="Provisioning (in flight)" value={provisioningRes.count ?? 0} />
        <Stat label="Failed" value={failedRows.length} warn={failedRows.length > 0} />
        <Stat label="Graph mode (this server)" text={graphMode} warn={graphMode !== 'real'} />
      </div>

      {stuckRows.length ? (
        <Alert variant="warning" className="mt-6">
          {stuckRows.length} session(s) start within 30 minutes and still have no Teams meeting. Run the provisioner now or check the cron job (`cron.job_run_details`).
        </Alert>
      ) : null}

      <div className="mt-6 grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Failed sessions</CardTitle>
            <CardDescription>The last Graph error is shown verbatim. Retry re-queues the session with a fresh attempt counter.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>When (IST)</TH>
                  <TH>Class</TH>
                  <TH>Attempts</TH>
                  <TH>Error</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {failedRows.map((s) => (
                  <TR key={s.id}>
                    <TD className="whitespace-nowrap">{formatIst(s.scheduled_start)}</TD>
                    <TD>
                      <span className="font-mono">{s.batch_code}</span> · {s.subject_name} · {s.teacher_name}
                    </TD>
                    <TD>{s.sync_attempts}</TD>
                    <TD className="max-w-md text-xs text-destructive">{s.sync_error}</TD>
                    <TD>
                      {new Date(s.scheduled_end).getTime() > Date.now() ? (
                        <ActionForm action={retrySession} inline submitLabel="Retry" variant="outline">
                          <input type="hidden" name="id" value={s.id} />
                        </ActionForm>
                      ) : (
                        <Badge variant="secondary">past</Badge>
                      )}
                    </TD>
                  </TR>
                ))}
                {failedRows.length === 0 ? (
                  <TR>
                    <TD colSpan={5} className="text-muted-foreground">
                      No failures. 🎉
                    </TD>
                  </TR>
                ) : null}
              </TBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Last provisioner runs</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>At (IST)</TH>
                  <TH>Trigger</TH>
                  <TH>Claimed</TH>
                  <TH>Provisioned</TH>
                  <TH>Patched</TH>
                  <TH>Failed</TH>
                  <TH>Deleted</TH>
                </TR>
              </THead>
              <TBody>
                {lastRuns.map((r) => (
                  <TR key={r.id}>
                    <TD className="whitespace-nowrap">{formatIst(r.created_at)}</TD>
                    <TD>{r.action === 'provisioner.run_now' ? 'manual' : 'cron'}</TD>
                    <TD>{String(r.payload.claimed ?? '')}</TD>
                    <TD>{String(r.payload.provisioned ?? '')}</TD>
                    <TD>{String(r.payload.patched ?? '')}</TD>
                    <TD>{String(r.payload.failed ?? '')}</TD>
                    <TD>{String(r.payload.deleted ?? '')}</TD>
                  </TR>
                ))}
                {lastRuns.length === 0 ? (
                  <TR>
                    <TD colSpan={7} className="text-muted-foreground">
                      The provisioner has not run yet.
                    </TD>
                  </TR>
                ) : null}
              </TBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Graph calls</CardTitle>
            <CardDescription>Every call is logged (endpoint, status, duration, request-id) for support tickets with Microsoft.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>At (IST)</TH>
                  <TH>Endpoint</TH>
                  <TH>Status</TH>
                  <TH>ms</TH>
                  <TH>request-id</TH>
                  <TH>Session</TH>
                </TR>
              </THead>
              <TBody>
                {calls.map((c) => {
                  const status = Number(c.payload.status ?? 0);
                  return (
                    <TR key={c.id}>
                      <TD className="whitespace-nowrap">{formatIst(c.created_at)}</TD>
                      <TD className="font-mono text-xs">{String(c.payload.endpoint ?? '')}</TD>
                      <TD>
                        <Badge variant={status >= 200 && status < 300 ? 'success' : status === 429 ? 'warning' : 'destructive'}>{status}</Badge>
                      </TD>
                      <TD>{String(c.payload.duration_ms ?? '')}</TD>
                      <TD className="font-mono text-xs">{String(c.payload.request_id ?? '')}</TD>
                      <TD className="font-mono text-xs">{c.entity_id ? c.entity_id.slice(0, 8) : ''}</TD>
                    </TR>
                  );
                })}
                {calls.length === 0 ? (
                  <TR>
                    <TD colSpan={6} className="text-muted-foreground">
                      No Graph calls logged yet.
                    </TD>
                  </TR>
                ) : null}
              </TBody>
            </Table>
          </CardContent>
        </Card>
        <SyncLegend />
      </div>
    </>
  );
}

function Stat({ label, value, text, warn }: { label: string; value?: number; text?: string; warn?: boolean }) {
  return (
    <Card className={warn ? 'border-amber-300' : ''}>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{text ?? value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function SyncLegend() {
  return (
    <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      Legend: <SyncBadge sync="pending" /> waiting · <SyncBadge sync="provisioning" /> in flight · <SyncBadge sync="provisioned" /> Teams meeting ready · <SyncBadge sync="failed" /> gave up after 5 attempts ·{' '}
      <SyncBadge sync="cancelled" /> no meeting needed
    </p>
  );
}
