import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { StatusBadge, SyncBadge } from '@/components/session-badges';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, PageHeader, Select, Table, TBody, TD, TH, THead, TR } from '@/components/ui/primitives';
import { createClient } from '@/lib/supabase/server';
import type { Batch, BatchSubject, ClassSessionView, Profile, Subject } from '@/lib/db/types';
import { addDays, formatIst, istDate, istTime } from '@/lib/domain/time';
import { addExtraClass, cancelSession, generateNow, rescheduleSession, retrySession } from './actions';
import { clearOverride, setOverride } from '../../teacher/sessions/actions';

export const metadata = { title: 'Sessions — Admin' };

interface Params {
  batch?: string;
  from?: string;
  to?: string;
  status?: string;
  sync?: string;
}

export default async function SessionsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const p = await searchParams;
  const from = p.from ?? istDate();
  const to = p.to ?? addDays(from, 21);
  const supabase = await createClient();

  let query = supabase
    .from('v_class_sessions')
    .select('*')
    .gte('scheduled_start', new Date(`${from}T00:00:00+05:30`).toISOString())
    .lt('scheduled_start', new Date(`${addDays(to, 1)}T00:00:00+05:30`).toISOString())
    .order('scheduled_start')
    .limit(500);
  if (p.batch) query = query.eq('batch_id', p.batch);
  if (p.status) query = query.eq('status', p.status);
  if (p.sync) query = query.eq('sync_status', p.sync);

  const [{ data: sessions }, { data: batches }, { data: batchSubjects }, { data: subjects }, { data: teachers }] = await Promise.all([
    query,
    supabase.from('batches').select('*').order('code'),
    supabase.from('batch_subjects').select('*').eq('is_active', true),
    supabase.from('subjects').select('*'),
    supabase.from('profiles').select('*').eq('role', 'teacher').eq('is_active', true).order('full_name'),
  ]);
  const rows = (sessions ?? []) as ClassSessionView[];
  const batchList = (batches ?? []) as Batch[];
  const batchById = new Map(batchList.map((b) => [b.id, b]));
  const subjectById = new Map(((subjects ?? []) as Subject[]).map((s) => [s.id, s]));
  const bsOptions = ((batchSubjects ?? []) as BatchSubject[])
    .map((bs) => ({ id: bs.id, label: `${batchById.get(bs.batch_id)?.code ?? '?'} · S${bs.semester} · ${subjectById.get(bs.subject_id)?.code ?? '?'} ${subjectById.get(bs.subject_id)?.name ?? ''}` }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <>
      <PageHeader
        title="Sessions"
        description="Generated from the timetable 21 days ahead (nightly 01:00 IST). Cancel, reschedule, or add an extra class here."
        actions={
          <ActionForm action={generateNow} inline submitLabel="Generate sessions now" pendingLabel="Generating…" variant="outline" />
        }
      />
      <div className="grid gap-6">
        <Card>
          <CardContent className="pt-5">
            <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
              <Field label="Batch" htmlFor="batch">
                <Select id="batch" name="batch" defaultValue={p.batch ?? ''} className="w-48">
                  <option value="">All</option>
                  {batchList.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.code}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="From" htmlFor="from">
                <Input id="from" name="from" type="date" defaultValue={from} className="w-40" />
              </Field>
              <Field label="To" htmlFor="to">
                <Input id="to" name="to" type="date" defaultValue={to} className="w-40" />
              </Field>
              <Field label="Status" htmlFor="status">
                <Select id="status" name="status" defaultValue={p.status ?? ''} className="w-36">
                  <option value="">Any</option>
                  <option value="scheduled">scheduled</option>
                  <option value="completed">completed</option>
                  <option value="cancelled">cancelled</option>
                </Select>
              </Field>
              <Field label="Sync" htmlFor="sync">
                <Select id="sync" name="sync" defaultValue={p.sync ?? ''} className="w-36">
                  <option value="">Any</option>
                  <option value="pending">pending</option>
                  <option value="provisioning">provisioning</option>
                  <option value="provisioned">provisioned</option>
                  <option value="failed">failed</option>
                  <option value="cancelled">cancelled</option>
                </Select>
              </Field>
              <Button type="submit" variant="outline">
                Filter
              </Button>
            </form>
            <Table>
              <THead>
                <TR>
                  <TH>When (IST)</TH>
                  <TH>Batch · subject</TH>
                  <TH>Teacher</TH>
                  <TH>Status</TH>
                  <TH>Meeting</TH>
                  <TH>Actions</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((s) => {
                  const startDate = istDate(new Date(s.scheduled_start));
                  const isPast = new Date(s.scheduled_end).getTime() < Date.now();
                  return (
                    <TR key={s.id}>
                      <TD className="whitespace-nowrap">
                        {formatIst(s.scheduled_start)} – {istTime(new Date(s.scheduled_end))}
                        {s.timetable_slot_id ? null : (
                          <Badge variant="outline" className="ml-2">
                            extra
                          </Badge>
                        )}
                      </TD>
                      <TD>
                        <span className="font-mono">{s.batch_code}</span> · {s.subject_code} {s.subject_name}
                        {s.topic ? <div className="text-xs text-muted-foreground">{s.topic}</div> : null}
                      </TD>
                      <TD>{s.teacher_name}</TD>
                      <TD>
                        <StatusBadge status={s.status} />
                      </TD>
                      <TD>
                        <div className="flex flex-col gap-1">
                          <SyncBadge sync={s.sync_status} provider={s.provider} />
                          {s.effective_join_url ? (
                            <a href={s.effective_join_url} target="_blank" rel="noreferrer" className="max-w-56 truncate text-xs text-primary underline">
                              {s.effective_join_url}
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground">no link yet</span>
                          )}
                          {s.sync_error ? <span className="max-w-64 truncate text-xs text-destructive">{s.sync_error}</span> : null}
                        </div>
                      </TD>
                      <TD>
                        {s.status === 'scheduled' && !isPast ? (
                          <div className="flex flex-col gap-2">
                            <ActionForm action={rescheduleSession} inline submitLabel="Reschedule" variant="outline" className="flex-wrap">
                              <input type="hidden" name="id" value={s.id} />
                              <Input name="date" type="date" defaultValue={startDate} className="w-36" aria-label="Date" />
                              <Input name="start_time" type="time" step={300} defaultValue={istTime(new Date(s.scheduled_start))} className="w-28" aria-label="Start" />
                              <Input name="end_time" type="time" step={300} defaultValue={istTime(new Date(s.scheduled_end))} className="w-28" aria-label="End" />
                              <Input name="topic" defaultValue={s.topic ?? ''} placeholder="Topic" className="w-40" aria-label="Topic" />
                            </ActionForm>
                            <ActionForm action={setOverride} inline submitLabel={s.has_override ? 'Update link' : 'Override link'} variant="outline">
                              <input type="hidden" name="id" value={s.id} />
                              <Input name="url" type="url" defaultValue={s.join_url_override ?? ''} placeholder="https://… (Zoom / Meet / Teams)" className="w-72" aria-label="Override link" />
                            </ActionForm>
                            <div className="flex gap-2">
                              {s.has_override ? (
                                <ActionForm action={clearOverride} inline submitLabel="Revert to Teams" variant="ghost">
                                  <input type="hidden" name="id" value={s.id} />
                                </ActionForm>
                              ) : null}
                              {s.sync_status === 'failed' ? (
                                <ActionForm action={retrySession} inline submitLabel="Retry" variant="secondary">
                                  <input type="hidden" name="id" value={s.id} />
                                </ActionForm>
                              ) : null}
                              <ActionForm action={cancelSession} inline submitLabel="Cancel class" variant="destructive" confirm="Cancel this class? Students will see it as cancelled.">
                                <input type="hidden" name="id" value={s.id} />
                              </ActionForm>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TD>
                    </TR>
                  );
                })}
                {rows.length === 0 ? (
                  <TR>
                    <TD colSpan={6} className="text-muted-foreground">
                      No sessions in this range.
                    </TD>
                  </TR>
                ) : null}
              </TBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Add an extra class</CardTitle>
            <CardDescription>A one-off session outside the weekly timetable. It gets a Teams meeting like any other.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={addExtraClass} submitLabel="Add class" resetOnSuccess>
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Batch subject" htmlFor="batch_subject_id">
                  <Select id="batch_subject_id" name="batch_subject_id" required defaultValue="">
                    <option value="" disabled>
                      Select…
                    </option>
                    {bsOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Teacher" htmlFor="teacher_id">
                  <Select id="teacher_id" name="teacher_id" required defaultValue="">
                    <option value="" disabled>
                      Select…
                    </option>
                    {((teachers ?? []) as Profile[]).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.full_name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Date" htmlFor="date">
                  <Input id="date" name="date" type="date" required defaultValue={istDate()} />
                </Field>
                <Field label="Start (IST)" htmlFor="start_time">
                  <Input id="start_time" name="start_time" type="time" step={300} required />
                </Field>
                <Field label="End (IST)" htmlFor="end_time">
                  <Input id="end_time" name="end_time" type="time" step={300} required />
                </Field>
                <Field label="Topic (optional)" htmlFor="topic">
                  <Input id="topic" name="topic" />
                </Field>
              </div>
            </ActionForm>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
