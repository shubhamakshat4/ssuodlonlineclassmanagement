import { Card, CardContent, PageHeader } from '@/components/ui/primitives';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import type { Profile, Student } from '@/lib/db/types';

export default async function StudentProfilePage() {
  const user = await requireRole('student');
  const supabase = await createClient();
  const [{ data: profile }, { data: student }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    supabase.from('students').select('*, batches(code, name, current_semester, programs(name))').eq('id', user.id).maybeSingle(),
  ]);
  const p = profile as Profile | null;
  const s = student as (Student & { batches: { code: string; name: string; current_semester: number; programs: { name: string } | null } | null }) | null;
  const rows: [string, string][] = [
    ['Name', p?.full_name ?? ''],
    ['Email', p?.email ?? ''],
    ['Phone', p?.phone ?? '—'],
    ['Roll number', s?.roll_number ?? '—'],
    ['Programme', s?.batches?.programs?.name ?? '—'],
    ['Batch', s?.batches ? `${s.batches.name} (${s.batches.code})` : '—'],
    ['Current semester', s?.batches ? String(s.batches.current_semester) : '—'],
    ['Enrolment status', s?.status ?? '—'],
  ];
  return (
    <>
      <PageHeader title="Profile" description={s ? 'Read-only. Contact the ODL office to correct anything here.' : 'No classes are assigned to you yet — contact the ODL department for more details.'} />
      <Card className="max-w-xl">
        <CardContent className="pt-5">
          <dl className="grid grid-cols-[160px_1fr] gap-y-3 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </>
  );
}
