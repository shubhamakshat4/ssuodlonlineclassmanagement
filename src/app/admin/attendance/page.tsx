import { Button } from '@/components/ui/button';
import { Alert, Card, CardContent, EmptyState, Field, Input, PageHeader, Select, Table, TBody, TD, TH, THead, TR } from '@/components/ui/primitives';
import { createClient } from '@/lib/supabase/server';
import type { Batch, Subject } from '@/lib/db/types';
import { addDays, formatIstDate, formatIstTime, istDate } from '@/lib/domain/time';
import { attendanceReport } from '@/lib/queries/attendance';

export const metadata = { title: 'Attendance — Admin' };
export const dynamic = 'force-dynamic';

interface Params {
  batch?: string;
  subject?: string;
  from?: string;
  to?: string;
}

export default async function AttendanceReportPage({ searchParams }: { searchParams: Promise<Params> }) {
  const p = await searchParams;
  const supabase = await createClient();
  const [{ data: batches }, { data: subjects }] = await Promise.all([supabase.from('batches').select('*').order('code'), supabase.from('subjects').select('*').order('code')]);
  const batchList = (batches ?? []) as Batch[];
  const batch = batchList.find((b) => b.id === p.batch);
  const to = p.to ?? istDate();
  const from = p.from ?? addDays(to, -30);
  const subjectList = ((subjects ?? []) as Subject[]).filter((s) => !batch || s.program_id === batch.program_id);

  const report = batch ? await attendanceReport(supabase, { batchId: batch.id, subjectId: p.subject || undefined, from, to }) : null;
  const exportHref = batch ? `/admin/attendance/export?batch=${batch.id}&subject=${p.subject ?? ''}&from=${from}&to=${to}` : null;

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Attendance report"
        description="Portal joins per student per class. A tick means the student clicked Join Now inside the join window — not verified presence for the whole session."
        actions={exportHref && report && report.sessions.length ? <a href={exportHref} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">Download CSV</a> : null}
      />
      <Card className="mb-6">
        <CardContent className="pt-5">
          <form method="get" className="flex flex-wrap items-end gap-2">
            <Field label="Class group" htmlFor="batch">
              <Select id="batch" name="batch" defaultValue={p.batch ?? ''} className="w-52" required>
                <option value="" disabled>
                  Select class group…
                </option>
                {batchList.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Subject" htmlFor="subject">
              <Select id="subject" name="subject" defaultValue={p.subject ?? ''} className="w-60">
                <option value="">All subjects</option>
                {subjectList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} {s.name}
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
            <Button type="submit">Run report</Button>
          </form>
        </CardContent>
      </Card>

      {!report ? <EmptyState>Choose a class group and run the report.</EmptyState> : null}
      {report && report.sessions.length === 0 ? <Alert>No classes for this selection between {from} and {to}.</Alert> : null}
      {report && report.sessions.length > 0 ? (
        <Card>
          <CardContent className="pt-5">
            <Table>
              <THead>
                <TR>
                  <TH className="sticky left-0 bg-white">Student</TH>
                  {report.sessions.map((s) => (
                    <TH key={s.id} className="whitespace-nowrap text-center">
                      <div>{formatIstDate(s.scheduled_start).replace(/,.*$/, '')}</div>
                      <div className="font-normal normal-case">
                        {formatIstDate(s.scheduled_start).replace(/^[^,]*,\s*/, '')} {formatIstTime(s.scheduled_start)}
                      </div>
                      <div className="font-normal normal-case text-muted-foreground">{s.subject_code}</div>
                    </TH>
                  ))}
                  <TH className="text-center">Joined / total</TH>
                </TR>
              </THead>
              <TBody>
                {report.students.map((st) => {
                  const joined = report.sessions.filter((s) => report.joins.has(`${s.id}:${st.id}`)).length;
                  return (
                    <TR key={st.id}>
                      <TD className="sticky left-0 whitespace-nowrap bg-white">
                        <div>{st.full_name}</div>
                        <div className="font-mono text-xs text-muted-foreground">{st.roll_number}</div>
                      </TD>
                      {report.sessions.map((s) => {
                        const a = report.joins.get(`${s.id}:${st.id}`);
                        return (
                          <TD key={s.id} className="text-center" title={a ? `Joined ${formatIstTime(a.clicked_at)} from ${a.ip ?? '?'}` : 'No join recorded'}>
                            {a ? <span className="text-green-700">✓</span> : <span className="text-muted-foreground">·</span>}
                          </TD>
                        );
                      })}
                      <TD className="text-center font-medium">
                        {joined} / {report.sessions.length}
                      </TD>
                    </TR>
                  );
                })}
                <TR>
                  <TD className="sticky left-0 bg-white font-medium">Joined per class</TD>
                  {report.sessions.map((s) => (
                    <TD key={s.id} className="text-center font-medium">
                      {report.students.filter((st) => report.joins.has(`${s.id}:${st.id}`)).length}
                    </TD>
                  ))}
                  <TD />
                </TR>
              </TBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
