import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm } from '@/components/action-form';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, PageHeader, Select, Table, TBody, TD, TH, THead, TR } from '@/components/ui/primitives';
import { createClient } from '@/lib/supabase/server';
import type { Batch, BatchSubject, Profile, Program, Student, Subject, SubjectTeacher } from '@/lib/db/types';
import { addBatchSubject, assignTeacher, toggleBatchSubject, unassignTeacher, updateBatch } from '../actions';
import { BatchFields } from '../batch-form';

export default async function BatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: batch } = await supabase.from('batches').select('*').eq('id', id).maybeSingle();
  if (!batch) notFound();
  const b = batch as Batch;

  const [{ data: programs }, { data: subjects }, { data: batchSubjects }, { data: assignments }, { data: teachers }, { data: students }] =
    await Promise.all([
      supabase.from('programs').select('*').order('code'),
      supabase.from('subjects').select('*').eq('program_id', b.program_id).order('code'),
      supabase.from('batch_subjects').select('*').eq('batch_id', id).order('semester'),
      supabase.from('subject_teachers').select('*'),
      supabase.from('profiles').select('*').eq('role', 'teacher').eq('is_active', true).order('full_name'),
      supabase.from('students').select('*, profiles!inner(full_name, email, is_active)').eq('batch_id', id).order('roll_number'),
    ]);

  const subjectById = new Map(((subjects ?? []) as Subject[]).map((s) => [s.id, s]));
  const teacherById = new Map(((teachers ?? []) as Profile[]).map((t) => [t.id, t]));
  const bsList = (batchSubjects ?? []) as BatchSubject[];
  const assignmentsByBs = new Map<string, SubjectTeacher[]>();
  for (const a of (assignments ?? []) as SubjectTeacher[]) {
    assignmentsByBs.set(a.batch_subject_id, [...(assignmentsByBs.get(a.batch_subject_id) ?? []), a]);
  }
  const returnTo = `/admin/batches/${id}`;

  return (
    <>
      <PageHeader
        title={`${b.code} — ${b.name}`}
        description="Batch details, subjects offered per semester, and who teaches them."
        actions={
          <Link href="/admin/batches" className="text-sm text-primary underline">
            ← All batches
          </Link>
        }
      />
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={updateBatch}>
              <BatchFields programs={(programs ?? []) as Program[]} batch={b} />
            </ActionForm>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Subjects &amp; teachers</CardTitle>
            <CardDescription>A subject is offered to this batch in a semester; assign one or more teachers to each.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Table>
              <THead>
                <TR>
                  <TH>Sem</TH>
                  <TH>Subject</TH>
                  <TH>Teachers</TH>
                  <TH>Assign</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {bsList.map((bs) => {
                  const subj = subjectById.get(bs.subject_id);
                  const assigned = assignmentsByBs.get(bs.id) ?? [];
                  const assignedIds = new Set(assigned.map((a) => a.teacher_id));
                  return (
                    <TR key={bs.id}>
                      <TD>{bs.semester}</TD>
                      <TD>
                        <span className="font-mono">{subj?.code}</span> {subj?.name}{' '}
                        {!bs.is_active ? <Badge variant="secondary">inactive</Badge> : null}
                      </TD>
                      <TD>
                        <ul className="grid gap-1">
                          {assigned.map((a) => (
                            <li key={a.id} className="flex items-center gap-2">
                              {teacherById.get(a.teacher_id)?.full_name ?? a.teacher_id}
                              {a.is_primary ? <Badge variant="info">primary</Badge> : null}
                              <ActionForm action={unassignTeacher} inline submitLabel="Remove" variant="ghost" confirm="Remove this teacher from the subject?">
                                <input type="hidden" name="id" value={a.id} />
                                <input type="hidden" name="return_to" value={returnTo} />
                              </ActionForm>
                            </li>
                          ))}
                          {assigned.length === 0 ? <li className="text-muted-foreground">No teacher yet</li> : null}
                        </ul>
                      </TD>
                      <TD>
                        <ActionForm action={assignTeacher} inline submitLabel="Add" variant="outline">
                          <input type="hidden" name="batch_subject_id" value={bs.id} />
                          <input type="hidden" name="return_to" value={returnTo} />
                          <Select name="teacher_id" className="w-56" required defaultValue="">
                            <option value="" disabled>
                              Teacher…
                            </option>
                            {((teachers ?? []) as Profile[])
                              .filter((t) => !assignedIds.has(t.id))
                              .map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.full_name}
                                </option>
                              ))}
                          </Select>
                          <label className="flex items-center gap-1 text-xs">
                            <input type="checkbox" name="is_primary" defaultChecked={assigned.length === 0} /> primary
                          </label>
                        </ActionForm>
                      </TD>
                      <TD>
                        <ActionForm action={toggleBatchSubject} inline submitLabel={bs.is_active ? 'Deactivate' : 'Activate'} variant="ghost">
                          <input type="hidden" name="id" value={bs.id} />
                          <input type="hidden" name="batch_id" value={id} />
                          <input type="hidden" name="is_active" value={bs.is_active ? 'false' : 'true'} />
                        </ActionForm>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            <ActionForm action={addBatchSubject} inline submitLabel="Add subject" resetOnSuccess className="flex-wrap">
              <input type="hidden" name="batch_id" value={id} />
              <Field label="Subject" htmlFor="subject_id">
                <Select id="subject_id" name="subject_id" className="w-72" required defaultValue="">
                  <option value="" disabled>
                    Select subject…
                  </option>
                  {((subjects ?? []) as Subject[]).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} — {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Semester" htmlFor="semester">
                <Input id="semester" name="semester" type="number" min={1} max={12} defaultValue={b.current_semester} className="w-24" required />
              </Field>
            </ActionForm>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Students ({(students ?? []).length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>Roll no.</TH>
                  <TH>Name</TH>
                  <TH>Email</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {((students ?? []) as (Student & { profiles: { full_name: string; email: string; is_active: boolean } })[]).map((s) => (
                  <TR key={s.id}>
                    <TD className="whitespace-nowrap font-mono">{s.roll_number}</TD>
                    <TD>
                      <Link href={`/admin/students/${s.id}`} className="font-medium text-primary hover:underline">
                        {s.profiles.full_name}
                      </Link>
                    </TD>
                    <TD>{s.profiles.email}</TD>
                    <TD>
                      <Badge variant={s.status === 'active' ? 'success' : 'secondary'}>{s.status}</Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
