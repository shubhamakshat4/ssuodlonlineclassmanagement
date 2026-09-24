import { Badge, Card, CardContent, PageHeader } from '@/components/ui/primitives';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/lib/db/types';
import { studentEnrolment } from '@/lib/queries/student';

export const dynamic = 'force-dynamic';

export default async function StudentProfilePage() {
  const user = await requireRole('student');
  const supabase = await createClient();
  const [{ data: profile }, enrolment] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    studentEnrolment(supabase, user.id),
  ]);
  const p = profile as Profile | null;

  const rows: [string, React.ReactNode][] = [
    ['Name', p?.full_name ?? ''],
    ['University email', p?.email ?? ''],
    ['Phone', p?.phone ?? '—'],
    ['Roll number', enrolment?.roll_number ?? '—'],
    ['Enrolment no.', enrolment?.enrollment_no ?? '—'],
    ['Admission session', enrolment?.intake_session ?? '—'],
    ['Programme', enrolment?.primary?.program_name ?? '—'],
    [
      'Current semester',
      enrolment?.primary ? (
        <span className="flex flex-wrap items-center gap-2">
          <Badge>{enrolment.primary.name}</Badge>
          {enrolment.secondary ? <Badge variant="info">also attending {enrolment.secondary.name}</Badge> : null}
        </span>
      ) : (
        '—'
      ),
    ],
    ['Enrolment status', enrolment?.status ?? '—'],
  ];

  return (
    <>
      <PageHeader
        eyebrow="Student"
        title="Profile"
        description={enrolment ? 'Read-only. Contact the ODL office to correct anything here.' : 'No classes are assigned to you yet — contact the ODL department for more details.'}
      />
      <Card className="max-w-2xl">
        <CardContent className="pt-5">
          <dl className="grid grid-cols-[170px_1fr] gap-y-3.5 text-sm">
            {rows.map(([k, v], i) => (
              <div key={i} className="contents">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </>
  );
}
