import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, PageHeader, Select, Table, TBody, TD, TH, THead, TR } from '@/components/ui/primitives';
import { createClient } from '@/lib/supabase/server';
import type { Batch, Student } from '@/lib/db/types';
import { appConfig } from '@/lib/env';
import { CsvImportCard } from '@/components/csv-import-card';
import { createStudent, mapStudent } from './actions';

export const metadata = { title: 'Students — Admin' };
// Vercel: allow long imports / provisioner runs (default function timeout is 10 s)
export const maxDuration = 60;

type Row = Student & { profiles: { full_name: string; email: string; phone: string | null; is_active: boolean } };

const PAGE_SIZE = 50;

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ batch?: string; q?: string; page?: string }> }) {
  const { batch, q, page } = await searchParams;
  const supabase = await createClient();
  const pageNo = Math.max(1, Number.parseInt(page ?? '1', 10) || 1);
  const from = (pageNo - 1) * PAGE_SIZE;

  // Cohorts run to several hundred students, so the list is paged; filters narrow it first.
  let query = supabase
    .from('students')
    .select('*, profiles!inner(full_name, email, phone, is_active)', { count: 'exact' })
    .order('roll_number')
    .range(from, from + PAGE_SIZE - 1);
  // A student may follow two class groups, so the filter matches either of them.
  if (batch) query = query.or(`batch_id.eq.${batch},secondary_batch_id.eq.${batch}`);
  if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`, { referencedTable: 'profiles' });
  const [{ data: students, count }, { data: batches }, { data: unmappedData }] = await Promise.all([
    query,
    supabase.from('batches').select('*').order('code'),
    supabase.from('v_unmapped_students').select('*').limit(50),
  ]);
  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (n: number) => {
    const p = new URLSearchParams();
    if (batch) p.set('batch', batch);
    if (q) p.set('q', q);
    if (n > 1) p.set('page', String(n));
    return p.toString() ? `?${p.toString()}` : '';
  };
  const unmapped = (unmappedData ?? []) as { id: string; full_name: string; email: string; created_at: string }[];
  const batchList = (batches ?? []) as Batch[];
  const batchById = new Map(batchList.map((b) => [b.id, b]));
  const rows = (students ?? []) as Row[];

  return (
    <>
      <PageHeader eyebrow="Administration" title="Students" description={`Any @${appConfig.allowedStudentDomain} Google account can sign in; a student only sees classes once mapped to a class group here.`} />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="grid gap-6">
          {unmapped.length ? (
            <Card className="border-amber-300">
              <CardHeader>
                <CardTitle>Signed in but not mapped ({unmapped.length})</CardTitle>
                <CardDescription>These students signed in with Google but have no class group yet. They currently see “No classes are assigned to you yet — contact the ODL department”.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {unmapped.map((u) => (
                  <div key={u.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-3" data-testid={`unmapped-${u.id}`}>
                    <div className="min-w-56">
                      <div className="font-medium">{u.full_name}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </div>
                    <ActionForm action={mapStudent} inline submitLabel="Map to batch" className="flex-wrap">
                      <input type="hidden" name="id" value={u.id} />
                      <Input name="roll_number" placeholder="Roll number" required className="w-40 font-mono uppercase" aria-label="Roll number" />
                      <Select name="batch_id" required defaultValue="" className="w-48" aria-label="Class group">
                        <option value="" disabled>
                          Class group…
                        </option>
                        {batchList.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.code}
                          </option>
                        ))}
                      </Select>
                      <Select name="secondary_batch_id" defaultValue="" className="w-48" aria-label="Second class group">
                        <option value="">— no second group —</option>
                        {batchList.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.code}
                          </option>
                        ))}
                      </Select>
                    </ActionForm>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardContent className="pt-5">
              <form className="mb-4 flex flex-wrap items-end gap-2" method="get">
                <Field label="Class group" htmlFor="batch">
                  <Select id="batch" name="batch" defaultValue={batch ?? ''} className="w-56">
                    <option value="">All class groups</option>
                    {batchList.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.code}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Search" htmlFor="q">
                  <Input id="q" name="q" defaultValue={q ?? ''} placeholder="name or email" className="w-56" />
                </Field>
                <Button type="submit" variant="outline">
                  Filter
                </Button>
              </form>
              <Table>
                <THead>
                  <TR>
                    <TH>Roll no.</TH>
                    <TH>Name</TH>
                    <TH>Signs in as</TH>
                    <TH>College email</TH>
                    <TH>Class group</TH>
                    <TH>Second group</TH>
                    <TH>Status</TH>

                    <TH className="text-right">Edit</TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.map((s) => (
                    <TR key={s.id}>
                      <TD className="whitespace-nowrap font-mono">{s.roll_number ?? <span className="text-muted-foreground">not issued</span>}</TD>
                      <TD className="whitespace-nowrap">
                        <Link href={`/admin/students/${s.id}`} className="font-medium text-primary hover:underline">
                          {s.profiles.full_name}
                        </Link>
                        {!s.profiles.is_active ? (
                          <Badge variant="destructive" className="ml-2">
                            deactivated
                          </Badge>
                        ) : null}
                      </TD>
                      <TD className="font-mono text-xs">{s.profiles.email}</TD>
                      <TD className="font-mono text-xs">{s.college_email ?? <span className="font-sans text-muted-foreground">not issued</span>}</TD>
                      <TD className="whitespace-nowrap font-mono">{batchById.get(s.batch_id)?.code ?? '—'}</TD>
                      <TD className="whitespace-nowrap font-mono">
                        {s.secondary_batch_id ? <Badge variant="info">{batchById.get(s.secondary_batch_id)?.code ?? '—'}</Badge> : <span className="text-muted-foreground">—</span>}
                      </TD>
                      <TD>
                        <Badge variant={s.status === 'active' ? 'success' : 'secondary'}>{s.status}</Badge>
                      </TD>
                      <TD className="text-right">
                        <Link href={`/admin/students/${s.id}`} className={buttonVariants({ variant: 'outline', size: 'sm' })} data-testid={`edit-${s.id}`}>
                          Edit
                        </Link>
                      </TD>
                    </TR>
                  ))}
                  {rows.length === 0 ? (
                    <TR>
                      <TD colSpan={8} className="text-muted-foreground">
                        No students match.
                      </TD>
                    </TR>
                  ) : null}
                </TBody>
              </Table>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {total === 0 ? 'No students match.' : `Showing ${from + 1}–${Math.min(from + PAGE_SIZE, total)} of ${total} student(s)`}
                </span>
                {lastPage > 1 ? (
                  <span className="flex items-center gap-3">
                    {pageNo > 1 ? (
                      <Link href={`/admin/students${qs(pageNo - 1)}`} className="font-medium text-primary hover:underline">
                        ← Previous
                      </Link>
                    ) : null}
                    <span>
                      Page {pageNo} of {lastPage}
                    </span>
                    {pageNo < lastPage ? (
                      <Link href={`/admin/students${qs(pageNo + 1)}`} className="font-medium text-primary hover:underline">
                        Next →
                      </Link>
                    ) : null}
                  </span>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <CsvImportCard entity="students" />
        </div>

        <Card className="self-start">
          <CardHeader>
            <CardTitle>New student</CardTitle>
            <CardDescription>Creates the account; the student signs in with Google.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={createStudent} submitLabel="Create student" resetOnSuccess>
              <Field label="Full name" htmlFor="full_name">
                <Input id="full_name" name="full_name" required />
              </Field>
              <Field label="College email" htmlFor="college_email" hint={`@${appConfig.allowedStudentDomain}, if one has been issued`}>
                <Input id="college_email" name="college_email" type="email" />
              </Field>
              <Field label="Personal email" htmlFor="personal_email" hint="Used as the login when there is no college email">
                <Input id="personal_email" name="personal_email" type="email" />
              </Field>
              <Field label="Phone" htmlFor="phone">
                <Input id="phone" name="phone" />
              </Field>
              <Field label="Roll number" htmlFor="roll_number" hint="Optional until the university issues one">
                <Input id="roll_number" name="roll_number" className="font-mono uppercase" />
              </Field>
              <Field label="Class group" htmlFor="batch_id">
                <Select id="batch_id" name="batch_id" required defaultValue="">
                  <option value="" disabled>
                    Select…
                  </option>
                  {batchList.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.code}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Second class group (optional)" htmlFor="new_secondary_batch_id" hint="Only when the student also attends another semester.">
                <Select id="new_secondary_batch_id" name="secondary_batch_id" defaultValue="">
                  <option value="">— none —</option>
                  {batchList.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.code}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Status" htmlFor="status">
                <Select id="status" name="status" defaultValue="active">
                  <option value="active">active</option>
                  <option value="on_hold">on_hold</option>
                  <option value="withdrawn">withdrawn</option>
                  <option value="graduated">graduated</option>
                </Select>
              </Field>
            </ActionForm>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
