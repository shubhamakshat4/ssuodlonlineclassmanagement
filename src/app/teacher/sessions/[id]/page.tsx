import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm } from '@/components/action-form';
import { JoinButton } from '@/components/join-button';
import { StatusBadge, SyncBadge } from '@/components/session-badges';
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, PageHeader, Table, TBody, TD, TH, THead, TR } from '@/components/ui/primitives';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import type { Attendance, ClassSessionView, Student } from '@/lib/db/types';
import { formatIst, formatIstTime } from '@/lib/domain/time';
import { joinLeadMinutes } from '@/lib/queries/sessions';
import { clearOverride, updateTopic } from '../actions';
import { OverrideForm } from './override-form';

export const dynamic = 'force-dynamic';

type RosterRow = Student & { profiles: { full_name: string; email: string } };

export default async function TeacherSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole('teacher');
  const supabase = await createClient();
  const { data: session } = await supabase.from('v_class_sessions').select('*').eq('id', id).maybeSingle();
  if (!session) notFound();
  const s = session as ClassSessionView;
  const [{ data: roster }, { data: attendance }, lead] = await Promise.all([
    supabase.from('students').select('*, profiles!inner(full_name, email)').eq('batch_id', s.batch_id).order('roll_number'),
    supabase.from('attendance').select('*').eq('class_session_id', id),
    joinLeadMinutes(supabase),
  ]);
  const joinedBy = new Map(((attendance ?? []) as Attendance[]).map((a) => [a.student_id, a]));
  const rows = (roster ?? []) as RosterRow[];
  const editable = s.status === 'scheduled' && new Date(s.scheduled_end).getTime() > Date.now();

  return (
    <>
      <PageHeader
        eyebrow="Faculty"
        title={`${s.subject_name} — ${s.batch_code}`}
        description={`${formatIst(s.scheduled_start)} – ${formatIstTime(s.scheduled_end)} IST`}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/teacher" className="text-sm text-primary underline">
              ← Today
            </Link>
            <JoinButton sessionId={s.id} scheduledStart={s.scheduled_start} scheduledEnd={s.scheduled_end} status={s.status} leadMinutes={lead} hasUrl={Boolean(s.effective_join_url)} label="Join" />
          </div>
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Meeting link</CardTitle>
              <CardDescription className="flex flex-wrap items-center gap-2">
                <StatusBadge status={s.status} /> <SyncBadge sync={s.sync_status} provider={s.provider} />
                {s.has_override ? <Badge variant="warning">Link updated</Badge> : null}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="text-sm">
                <div className="text-muted-foreground">Students currently join via</div>
                {s.effective_join_url ? (
                  <a href={s.effective_join_url} target="_blank" rel="noreferrer" className="break-all text-primary underline" data-testid="effective-url">
                    {s.effective_join_url}
                  </a>
                ) : (
                  <span>Not ready yet — the Teams meeting is being created.</span>
                )}
                {s.has_override && s.override_set_at ? <div className="mt-1 text-xs text-muted-foreground">Override set {formatIst(s.override_set_at)}</div> : null}
              </div>
              {!s.has_override && s.provider === 'teams' && s.sync_status === 'pending' && editable ? (
                <Alert variant="info" data-testid="reverted-note">
                  Reverted to the auto-generated Teams link. A fresh meeting is being created (usually within 10 minutes); until then students see “Link not ready yet”.
                </Alert>
              ) : null}
              {!editable ? (
                <Alert>This class has {s.status === 'cancelled' ? 'been cancelled' : 'ended'}; the link can no longer be changed.</Alert>
              ) : (
                <>
                  <OverrideForm sessionId={s.id} current={s.join_url_override} />
                  {s.has_override ? (
                    <ActionForm action={clearOverride} inline submitLabel="Revert to auto-generated Teams link" variant="outline" confirm="Revert to a Teams meeting created by the portal? A new meeting link will be generated.">
                      <input type="hidden" name="id" value={s.id} />
                    </ActionForm>
                  ) : null}
                </>
              )}
              {s.sync_error && s.provider === 'teams' ? <Alert variant="warning">Provisioning note: {s.sync_error}</Alert> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Topic</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionForm action={updateTopic} inline submitLabel="Save">
                <input type="hidden" name="id" value={s.id} />
                <Input name="topic" defaultValue={s.topic ?? ''} placeholder="What this class covers" className="w-80" disabled={!editable} />
              </ActionForm>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              Roster ({rows.length}) · joined from portal: {joinedBy.size}
            </CardTitle>
            <CardDescription>“Joined” means the student clicked Join Now in the portal inside the join window — not full-session presence.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>Roll no.</TH>
                  <TH>Name</TH>
                  <TH>Joined</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => {
                  const a = joinedBy.get(r.id);
                  return (
                    <TR key={r.id}>
                      <TD className="font-mono">{r.roll_number}</TD>
                      <TD>
                        {r.profiles.full_name}
                        {r.status !== 'active' ? (
                          <Badge variant="secondary" className="ml-2">
                            {r.status}
                          </Badge>
                        ) : null}
                      </TD>
                      <TD>{a ? <span className="text-green-700">{formatIstTime(a.clicked_at)}</span> : <span className="text-muted-foreground">—</span>}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
