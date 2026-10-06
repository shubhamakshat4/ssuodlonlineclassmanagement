import Link from 'next/link';
import { CheckCircle2, CircleSlash, Video } from 'lucide-react';
import { Badge, Card, CardContent, EmptyState, Field, PageHeader, Select, Table, TBody, TD, TH, THead, TR } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { formatIst } from '@/lib/domain/time';

export const metadata = { title: 'Class report — Admin' };
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PAGE_SIZE = 60;

interface SessionRow {
  id: string;
  scheduled_start: string;
  scheduled_end: string;
  status: string;
  batch_code: string;
  subject_name: string;
  teacher_name: string;
  batch_id: string;
}

/**
 * What actually happened, class by class: who taught it, how many joined, and the recording.
 *
 * "Joined" counts students who pressed Join Now in the portal. It is not a register of who sat through
 * the class, and it cannot include the teacher: Microsoft's own attendance report would give both, but
 * reading it needs the OnlineMeetingArtifact.Read.All permission, which this tenant has not granted
 * (Graph answers 403). The column says what it is rather than implying more.
 */
export default async function ClassReportPage({ searchParams }: { searchParams: Promise<{ batch?: string; page?: string; from?: string }> }) {
  const { batch, page, from } = await searchParams;
  const supabase = await createClient();
  const pageNo = Math.max(1, Number.parseInt(page ?? '1', 10) || 1);
  const offset = (pageNo - 1) * PAGE_SIZE;
  const since = from || new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);

  let query = supabase
    .from('v_class_sessions')
    .select('id, scheduled_start, scheduled_end, status, batch_code, subject_name, teacher_name, batch_id', { count: 'exact' })
    .lte('scheduled_start', new Date().toISOString())
    .gte('scheduled_start', `${since}T00:00:00Z`)
    .order('scheduled_start', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);
  if (batch) query = query.eq('batch_id', batch);

  const [{ data: sessionData, count }, { data: batchData }] = await Promise.all([query, supabase.from('batches').select('id, code').order('code')]);
  const sessions = (sessionData ?? []) as SessionRow[];
  const batches = (batchData ?? []) as { id: string; code: string }[];
  const ids = sessions.map((s) => s.id);

  // Joins and recordings for the classes on this page only.
  const [{ data: attendance }, { data: recordings }, { data: rosters }] = await Promise.all([
    ids.length ? supabase.from('attendance').select('class_session_id').in('class_session_id', ids) : Promise.resolve({ data: [] }),
    ids.length ? supabase.from('recordings').select('class_session_id, status, expires_at, duration_seconds').in('class_session_id', ids) : Promise.resolve({ data: [] }),
    supabase.from('students').select('batch_id, secondary_batch_id').eq('status', 'active'),
  ]);

  const joined = new Map<string, number>();
  for (const a of (attendance ?? []) as { class_session_id: string }[]) joined.set(a.class_session_id, (joined.get(a.class_session_id) ?? 0) + 1);
  const recording = new Map<string, { status: string; expires_at: string; duration_seconds: number | null }>();
  for (const r of (recordings ?? []) as { class_session_id: string; status: string; expires_at: string; duration_seconds: number | null }[]) {
    recording.set(r.class_session_id, r);
  }
  // Roll of each class group, counting a student who follows it as their second group too.
  const roll = new Map<string, number>();
  for (const s of (rosters ?? []) as { batch_id: string; secondary_batch_id: string | null }[]) {
    roll.set(s.batch_id, (roll.get(s.batch_id) ?? 0) + 1);
    if (s.secondary_batch_id) roll.set(s.secondary_batch_id, (roll.get(s.secondary_batch_id) ?? 0) + 1);
  }

  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (n: number) => {
    const p = new URLSearchParams();
    if (batch) p.set('batch', batch);
    if (from) p.set('from', from);
    if (n > 1) p.set('page', String(n));
    return p.toString() ? `?${p.toString()}` : '';
  };
  const withRecording = sessions.filter((s) => recording.has(s.id)).length;
  const totalJoins = sessions.reduce((n, s) => n + (joined.get(s.id) ?? 0), 0);

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Class report"
        description="Every class that has taken place: who taught it, how many students joined from the portal, and the recording."
      />

      <Card className="mb-5">
        <CardContent className="pt-5">
          <form className="flex flex-wrap items-end gap-3" method="get">
            <Field label="Class group" htmlFor="batch">
              <Select id="batch" name="batch" defaultValue={batch ?? ''} className="w-56">
                <option value="">All class groups</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="From" htmlFor="from">
              <input
                id="from"
                name="from"
                type="date"
                defaultValue={since}
                className="h-10 rounded-lg border border-border-strong bg-surface px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
              />
            </Field>
            <Button type="submit" variant="outline">
              Filter
            </Button>
            <div className="ml-auto flex gap-5 text-sm text-muted-foreground">
              <span>
                <strong className="text-foreground">{total}</strong> classes
              </span>
              <span>
                <strong className="text-foreground">{totalJoins}</strong> joins on this page
              </span>
              <span>
                <strong className="text-foreground">{withRecording}</strong> recorded
              </span>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          {sessions.length === 0 ? <EmptyState>No classes in this period.</EmptyState> : null}
          {sessions.length ? (
            <Table>
              <THead>
                <TR>
                  <TH>When</TH>
                  <TH>Class group</TH>
                  <TH>Subject</TH>
                  <TH>Faculty</TH>
                  <TH>Joined</TH>
                  <TH>Recording</TH>
                </TR>
              </THead>
              <TBody>
                {sessions.map((s) => {
                  const n = joined.get(s.id) ?? 0;
                  const of = roll.get(s.batch_id) ?? 0;
                  const rec = recording.get(s.id);
                  const expired = rec ? new Date(rec.expires_at).getTime() <= Date.now() : false;
                  return (
                    <TR key={s.id}>
                      <TD className="whitespace-nowrap">{formatIst(s.scheduled_start)}</TD>
                      <TD className="whitespace-nowrap font-mono text-xs">{s.batch_code}</TD>
                      <TD>{s.subject_name}</TD>
                      <TD className="whitespace-nowrap text-sm">{s.teacher_name}</TD>
                      <TD className="whitespace-nowrap">
                        {s.status === 'cancelled' ? (
                          <Badge variant="secondary">cancelled</Badge>
                        ) : (
                          <span className={n ? 'font-medium' : 'text-muted-foreground'}>
                            {n} / {of}
                          </span>
                        )}
                      </TD>
                      <TD className="whitespace-nowrap">
                        {rec && !expired ? (
                          <Link href={`/admin/report/${s.id}`} className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline">
                            <PlayIcon />
                            Watch
                            {rec.duration_seconds ? <span className="text-xs text-muted-foreground">({Math.round(rec.duration_seconds / 60)} min)</span> : null}
                          </Link>
                        ) : rec && expired ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                            <CircleSlash className="h-3.5 w-3.5" aria-hidden /> expired
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{total === 0 ? '' : `Showing ${offset + 1}–${Math.min(offset + PAGE_SIZE, total)} of ${total}`}</span>
            {lastPage > 1 ? (
              <span className="flex items-center gap-3">
                {pageNo > 1 ? (
                  <Link href={`/admin/report${qs(pageNo - 1)}`} className="font-medium text-primary hover:underline">
                    ← Previous
                  </Link>
                ) : null}
                <span>
                  Page {pageNo} of {lastPage}
                </span>
                {pageNo < lastPage ? (
                  <Link href={`/admin/report${qs(pageNo + 1)}`} className="font-medium text-primary hover:underline">
                    Next →
                  </Link>
                ) : null}
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-5">
        <CardContent className="grid gap-2 pt-5 text-sm text-muted-foreground">
          <p className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
            <span>
              <strong className="text-foreground">Joined</strong> counts students who pressed Join Now in the portal. It is a record of joining from here, not of
              sitting through the class.
            </span>
          </p>
          <p className="flex items-start gap-2">
            <Video className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
            <span>
              <strong className="text-foreground">Recordings</strong> appear within an hour of a class ending, and are removed automatically after the retention
              period. Use <em>Fetch recordings now</em> on Sync health to pull them immediately.
            </span>
          </p>
          <p className="flex items-start gap-2">
            <CircleSlash className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span>
              <strong className="text-foreground">The faculty member&apos;s own join time</strong> is not shown. It comes from Microsoft&apos;s attendance report,
              which needs the <code className="font-mono text-xs">OnlineMeetingArtifact.Read.All</code> permission; the tenant has not granted it, so Graph refuses
              the request.
            </span>
          </p>
        </CardContent>
      </Card>
    </>
  );
}

function PlayIcon() {
  return <Video className="h-4 w-4" aria-hidden />;
}
