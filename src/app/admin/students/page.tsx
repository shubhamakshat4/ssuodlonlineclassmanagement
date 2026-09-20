import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, PageHeader, Select, Table, TBody, TD, TH, THead, Textarea, TR } from '@/components/ui/primitives';
import { createClient } from '@/lib/supabase/server';
import type { Batch, Student } from '@/lib/db/types';
import { appConfig } from '@/lib/env';
import { createStudent, importStudents, mapStudent } from './actions';

export const metadata = { title: 'Students — Admin' };

type Row = Student & { profiles: { full_name: string; email: string; phone: string | null; is_active: boolean } };

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ batch?: string; q?: string }> }) {
  const { batch, q } = await searchParams;
  const supabase = await createClient();
  let query = supabase.from('students').select('*, profiles!inner(full_name, email, phone, is_active)').order('roll_number');
  if (batch) query = query.eq('batch_id', batch);
  if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`, { referencedTable: 'profiles' });
  const [{ data: students }, { data: batches }, { data: unmappedData }] = await Promise.all([
    query,
    supabase.from('batches').select('*').order('code'),
    supabase.from('v_unmapped_students').select('*'),
  ]);
  const unmapped = (unmappedData ?? []) as { id: string; full_name: string; email: string; created_at: string }[];
  const batchList = (batches ?? []) as Batch[];
  const batchById = new Map(batchList.map((b) => [b.id, b]));
  const rows = (students ?? []) as Row[];

  return (
    <>
      <PageHeader title="Students" description={`Any @${appConfig.allowedStudentDomain} Google account can sign in; a student only sees classes once mapped to a batch here.`} />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="grid gap-6">
          {unmapped.length ? (
            <Card className="border-amber-300">
              <CardHeader>
                <CardTitle>Signed in but not mapped ({unmapped.length})</CardTitle>
                <CardDescription>These students signed in with Google but have no batch yet. They currently see “No classes are assigned to you yet — contact the ODL department”.</CardDescription>
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
                      <Select name="batch_id" required defaultValue="" className="w-48" aria-label="Batch">
                        <option value="" disabled>
                          Batch…
                        </option>
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
                <Field label="Batch" htmlFor="batch">
                  <Select id="batch" name="batch" defaultValue={batch ?? ''} className="w-56">
                    <option value="">All batches</option>
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
                    <TH>Email</TH>
                    <TH>Batch</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.map((s) => (
                    <TR key={s.id}>
                      <TD className="font-mono">{s.roll_number}</TD>
                      <TD>
                        <Link href={`/admin/students/${s.id}`} className="text-primary underline">
                          {s.profiles.full_name}
                        </Link>
                        {!s.profiles.is_active ? (
                          <Badge variant="destructive" className="ml-2">
                            deactivated
                          </Badge>
                        ) : null}
                      </TD>
                      <TD>{s.profiles.email}</TD>
                      <TD className="font-mono">{batchById.get(s.batch_id)?.code ?? '—'}</TD>
                      <TD>
                        <Badge variant={s.status === 'active' ? 'success' : 'secondary'}>{s.status}</Badge>
                      </TD>
                    </TR>
                  ))}
                  {rows.length === 0 ? (
                    <TR>
                      <TD colSpan={5} className="text-muted-foreground">
                        No students match.
                      </TD>
                    </TR>
                  ) : null}
                </TBody>
              </Table>
              <p className="mt-3 text-xs text-muted-foreground">{rows.length} student(s)</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Bulk import (CSV)</CardTitle>
              <CardDescription>
                Columns: <code>roll_number,full_name,email,phone,batch_code,status</code>. Existing emails are skipped. Each row creates the Google-linked
                account.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ActionForm action={importStudents} submitLabel="Import" pendingLabel="Importing…">
                <Field label="Default batch (used when batch_code is empty)" htmlFor="default_batch_id">
                  <Select id="default_batch_id" name="default_batch_id" defaultValue="">
                    <option value="">— none —</option>
                    {batchList.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.code}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="CSV" htmlFor="csv">
                  <Textarea
                    id="csv"
                    name="csv"
                    rows={8}
                    className="font-mono text-xs"
                    placeholder={`roll_number,full_name,email,phone,batch_code,status\nODL26BBA010,Nikhil Rao,nikhil.rao.odl26@${appConfig.allowedStudentDomain},,BBA-ODL-2026,active`}
                  />
                </Field>
              </ActionForm>
            </CardContent>
          </Card>
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
              <Field label="University email" htmlFor="email" hint={`Must be @${appConfig.allowedStudentDomain}`}>
                <Input id="email" name="email" type="email" required />
              </Field>
              <Field label="Phone" htmlFor="phone">
                <Input id="phone" name="phone" />
              </Field>
              <Field label="Roll number" htmlFor="roll_number">
                <Input id="roll_number" name="roll_number" required className="font-mono uppercase" />
              </Field>
              <Field label="Batch" htmlFor="batch_id">
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
