import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm } from '@/components/action-form';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader, Select, Table, TBody, TD, TH, THead, TR } from '@/components/ui/primitives';
import { createClient } from '@/lib/supabase/server';
import type { Batch, BatchSubject, Profile, Subject, SubjectTeacher, Teacher } from '@/lib/db/types';
import { assignTeacher, unassignTeacher } from '../../batches/actions';
import { deleteTeacher, resendTeacherInvite, updateTeacher } from '../actions';
import { TeacherFields } from '../teacher-fields';

export default async function TeacherDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: profile }, { data: teacher }, { data: assignments }, { data: batchSubjects }, { data: batches }, { data: subjects }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', id).maybeSingle(),
    supabase.from('teachers').select('*').eq('id', id).maybeSingle(),
    supabase.from('subject_teachers').select('*').eq('teacher_id', id),
    supabase.from('batch_subjects').select('*').eq('is_active', true),
    supabase.from('batches').select('*').eq('is_active', true).order('code'),
    supabase.from('subjects').select('*'),
  ]);
  if (!profile || !teacher) notFound();
  const p = profile as Profile;
  const t = teacher as Teacher;
  const batchById = new Map(((batches ?? []) as Batch[]).map((b) => [b.id, b]));
  const subjectById = new Map(((subjects ?? []) as Subject[]).map((s) => [s.id, s]));
  const bsById = new Map(((batchSubjects ?? []) as BatchSubject[]).map((bs) => [bs.id, bs]));
  const assigned = (assignments ?? []) as SubjectTeacher[];
  const assignedBs = new Set(assigned.map((a) => a.batch_subject_id));
  const returnTo = `/admin/teachers/${id}`;
  const describe = (bs: BatchSubject | undefined) =>
    bs ? `${batchById.get(bs.batch_id)?.code ?? '?'} · S${bs.semester} · ${subjectById.get(bs.subject_id)?.code ?? '?'} ${subjectById.get(bs.subject_id)?.name ?? ''}` : '—';

  return (
    <>
      <PageHeader
        title={p.full_name}
        description={`${t.employee_code} · ${p.email}`}
        actions={
          <Link href="/admin/teachers" className="text-sm text-primary underline">
            ← All teachers
          </Link>
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <ActionForm action={updateTeacher}>
              <TeacherFields profile={p} teacher={t} />
            </ActionForm>
            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
              <ActionForm action={resendTeacherInvite} inline submitLabel="Resend invite / reset password" variant="outline">
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="email" value={p.email} />
              </ActionForm>
              <ActionForm action={deleteTeacher} inline submitLabel="Delete teacher" variant="destructive" confirm="Delete this teacher account? Only possible when they have no sessions.">
                <input type="hidden" name="id" value={id} />
              </ActionForm>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Teaching assignments</CardTitle>
            <CardDescription>Batch subjects this teacher is assigned to. Timetable slots reference these.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Table>
              <THead>
                <TR>
                  <TH>Batch · semester · subject</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {assigned.map((a) => (
                  <TR key={a.id}>
                    <TD>
                      {describe(bsById.get(a.batch_subject_id))} {a.is_primary ? <Badge variant="info">primary</Badge> : null}
                    </TD>
                    <TD>
                      <ActionForm action={unassignTeacher} inline submitLabel="Remove" variant="ghost" confirm="Remove this assignment?">
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="return_to" value={returnTo} />
                      </ActionForm>
                    </TD>
                  </TR>
                ))}
                {assigned.length === 0 ? (
                  <TR>
                    <TD colSpan={2} className="text-muted-foreground">
                      Not assigned to any subject yet.
                    </TD>
                  </TR>
                ) : null}
              </TBody>
            </Table>
            <ActionForm action={assignTeacher} inline submitLabel="Assign" variant="outline" className="flex-wrap">
              <input type="hidden" name="teacher_id" value={id} />
              <input type="hidden" name="return_to" value={returnTo} />
              <Select name="batch_subject_id" className="w-96" required defaultValue="">
                <option value="" disabled>
                  Batch subject…
                </option>
                {((batchSubjects ?? []) as BatchSubject[])
                  .filter((bs) => !assignedBs.has(bs.id) && batchById.has(bs.batch_id))
                  .sort((a, b) => describe(a).localeCompare(describe(b)))
                  .map((bs) => (
                    <option key={bs.id} value={bs.id}>
                      {describe(bs)}
                    </option>
                  ))}
              </Select>
              <label className="flex items-center gap-1 text-xs">
                <input type="checkbox" name="is_primary" /> primary
              </label>
            </ActionForm>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
