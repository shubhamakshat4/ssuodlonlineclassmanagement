import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader, Table, TBody, TD, TH, THead, TR } from '@/components/ui/primitives';
import { createClient } from '@/lib/supabase/server';
import type { Profile, SubjectTeacher, Teacher } from '@/lib/db/types';
import { createTeacher } from './actions';
import { TeacherFields } from './teacher-fields';

export const metadata = { title: 'Teachers — Admin' };

type Row = Teacher & { profiles: Profile };

export default async function TeachersPage() {
  const supabase = await createClient();
  const [{ data: teachers }, { data: assignments }] = await Promise.all([
    supabase.from('teachers').select('*, profiles!inner(*)').order('employee_code'),
    supabase.from('subject_teachers').select('teacher_id'),
  ]);
  const assignmentCount = new Map<string, number>();
  for (const a of (assignments ?? []) as Pick<SubjectTeacher, 'teacher_id'>[]) assignmentCount.set(a.teacher_id, (assignmentCount.get(a.teacher_id) ?? 0) + 1);

  return (
    <>
      <PageHeader title="Teachers" description="Faculty accounts. Teachers sign in with email + password and are added to Teams meetings as co-organiser." />
      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <Card>
          <CardContent className="pt-5">
            <Table>
              <THead>
                <TR>
                  <TH>Code</TH>
                  <TH>Name</TH>
                  <TH>Login email</TH>
                  <TH>M365 UPN</TH>
                  <TH>Subjects</TH>
                </TR>
              </THead>
              <TBody>
                {((teachers ?? []) as Row[]).map((t) => (
                  <TR key={t.id}>
                    <TD className="font-mono">{t.employee_code}</TD>
                    <TD>
                      <Link href={`/admin/teachers/${t.id}`} className="text-primary underline">
                        {t.profiles.full_name}
                      </Link>
                      {!t.profiles.is_active ? (
                        <Badge variant="destructive" className="ml-2">
                          deactivated
                        </Badge>
                      ) : null}
                    </TD>
                    <TD>{t.profiles.email}</TD>
                    <TD>
                      {t.entra_upn} {t.entra_user_id ? <Badge variant="success">resolved</Badge> : <Badge variant="warning">unresolved</Badge>}
                    </TD>
                    <TD>{assignmentCount.get(t.id) ?? 0}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
        <Card className="self-start">
          <CardHeader>
            <CardTitle>New teacher</CardTitle>
            <CardDescription>Sends an invite email; the teacher sets a password on first sign-in.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={createTeacher} submitLabel="Create & invite" resetOnSuccess>
              <TeacherFields />
            </ActionForm>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
