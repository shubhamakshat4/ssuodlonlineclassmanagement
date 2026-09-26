import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm } from '@/components/action-form';
import { Card, CardContent, CardHeader, CardTitle, Field, Input, PageHeader, Select, Table, TBody, TD, TH, THead, TR } from '@/components/ui/primitives';
import { createClient } from '@/lib/supabase/server';
import type { Attendance, Batch, Profile, Student } from '@/lib/db/types';
import { formatIst } from '@/lib/domain/time';
import { appConfig } from '@/lib/env';
import { deleteStudent, setStudentPassword, updateStudent } from '../actions';

export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: profile }, { data: student }, { data: batches }, { data: attendance }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', id).maybeSingle(),
    supabase.from('students').select('*').eq('id', id).maybeSingle(),
    supabase.from('batches').select('*').order('code'),
    supabase.from('attendance').select('*, class_sessions!inner(scheduled_start, batch_subjects!inner(subjects!inner(name)))').eq('student_id', id).order('clicked_at', { ascending: false }).limit(50),
  ]);
  if (!profile || !student) notFound();
  const p = profile as Profile;
  const s = student as Student;

  return (
    <>
      <PageHeader
        title={p.full_name}
        description={`${s.roll_number} · ${p.email}`}
        actions={
          <Link href="/admin/students" className="text-sm text-primary underline">
            ← All students
          </Link>
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Record</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={updateStudent}>
              <input type="hidden" name="id" value={id} />
              <Field label="Full name" htmlFor="full_name">
                <Input id="full_name" name="full_name" defaultValue={p.full_name} required />
              </Field>
              <Field label="College email" htmlFor="college_email" hint="The @srisriuniversity.edu.in address, once the university has issued one. Leave blank if there is none.">
                <Input id="college_email" name="college_email" type="email" defaultValue={s.college_email ?? ''} />
              </Field>
              <Field label="Personal email" htmlFor="personal_email" hint="The student's own address.">
                <Input id="personal_email" name="personal_email" type="email" defaultValue={s.personal_email ?? ''} />
              </Field>
              <p className="-mt-1 text-xs text-muted-foreground">
                Signs in with <strong>either</strong> address above, using the same password. The account itself is held under{' '}
                <strong className="font-mono text-foreground">{p.email}</strong>.
              </p>
              <Field label="Phone" htmlFor="phone">
                <Input id="phone" name="phone" defaultValue={p.phone ?? ''} />
              </Field>
              <Field label="Roll number" htmlFor="roll_number" hint="Leave blank until the university issues one.">
                <Input id="roll_number" name="roll_number" defaultValue={s.roll_number ?? ''} className="font-mono" />
              </Field>
              <Field label="Primary class group" htmlFor="batch_id" hint="Programme + semester whose timetable the student follows.">
                <Select id="batch_id" name="batch_id" defaultValue={s.batch_id} required>
                  {((batches ?? []) as Batch[]).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.code} — {b.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Second class group (optional)" htmlFor="secondary_batch_id" hint="Use when the student also attends another semester, e.g. one they missed.">
                <Select id="secondary_batch_id" name="secondary_batch_id" defaultValue={s.secondary_batch_id ?? ''}>
                  <option value="">— none —</option>
                  {((batches ?? []) as Batch[])
                    .filter((b) => b.id !== s.batch_id)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.code} — {b.name}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label="Enrolment status" htmlFor="status" hint="Only active students see classes and recordings.">
                <Select id="status" name="status" defaultValue={s.status}>
                  <option value="active">active</option>
                  <option value="on_hold">on_hold</option>
                  <option value="withdrawn">withdrawn</option>
                  <option value="graduated">graduated</option>
                </Select>
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="is_active" defaultChecked={p.is_active} /> Account active (unticking blocks sign-in)
              </label>
            </ActionForm>
            <div className="mt-6 border-t border-border pt-4">
              <ActionForm action={deleteStudent} inline submitLabel="Delete student" variant="destructive" confirm="Delete this student and their account? Attendance history is removed too.">
                <input type="hidden" name="id" value={id} />
              </ActionForm>
            </div>
          </CardContent>
        </Card>
        <Card className="self-start">
          <CardHeader>
            <CardTitle>Password</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              Passwords are held by Supabase Auth as a one-way hash, so nobody — not even an administrator — can read one. To help a student who cannot sign in,
              set a new one here and tell them what it is. They will be asked to change it the moment they sign in.
            </p>
            <ActionForm action={setStudentPassword} submitLabel="Set password" confirm="Set a new password for this student?">
              <input type="hidden" name="id" value={id} />
              <Field label="New password" htmlFor="password" hint={`Leave blank to use the standard first-login password, ${appConfig.studentDefaultPassword}.`}>
                <Input id="password" name="password" placeholder={appConfig.studentDefaultPassword} autoComplete="off" />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="must_change" defaultChecked /> Ask them to choose their own password at next sign-in
              </label>
            </ActionForm>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recent attendance (portal joins)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>Class</TH>
                  <TH>Scheduled</TH>
                  <TH>Joined at</TH>
                </TR>
              </THead>
              <TBody>
                {((attendance ?? []) as (Attendance & { class_sessions: { scheduled_start: string; batch_subjects: { subjects: { name: string } } } })[]).map((a) => (
                  <TR key={a.id}>
                    <TD>{a.class_sessions.batch_subjects.subjects.name}</TD>
                    <TD>{formatIst(a.class_sessions.scheduled_start)}</TD>
                    <TD>{formatIst(a.clicked_at)}</TD>
                  </TR>
                ))}
                {(attendance ?? []).length === 0 ? (
                  <TR>
                    <TD colSpan={3} className="text-muted-foreground">
                      No joins recorded.
                    </TD>
                  </TR>
                ) : null}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
