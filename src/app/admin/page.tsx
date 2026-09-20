import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader } from '@/components/ui/primitives';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/session';

export default async function AdminHome() {
  const user = await requireRole('admin');
  const supabase = await createClient();
  const head = { count: 'exact' as const, head: true };
  const results = await Promise.all([
    supabase.from('programs').select('id', head),
    supabase.from('batches').select('id', head).eq('is_active', true),
    supabase.from('students').select('id', head).eq('status', 'active'),
    supabase.from('teachers').select('id', head),
    supabase.from('class_sessions').select('id', head).eq('sync_status', 'failed'),
    supabase.from('class_sessions').select('id', head).eq('sync_status', 'pending').eq('status', 'scheduled'),
  ]);
  const [programs, batches, students, teachers, failed, pending] = results.map((r) => r.count ?? 0);

  const tiles: { label: string; value: number; href: string; warn?: boolean }[] = [
    { label: 'Programmes', value: programs, href: '/admin/programs' },
    { label: 'Active batches', value: batches, href: '/admin/batches' },
    { label: 'Active students', value: students, href: '/admin/students' },
    { label: 'Teachers', value: teachers, href: '/admin/teachers' },
    { label: 'Sessions awaiting Teams meeting', value: pending, href: '/admin/sessions?sync=pending' },
    { label: 'Sessions with sync failures', value: failed, href: '/admin/sync-health', warn: failed > 0 },
  ];

  return (
    <>
      <PageHeader title={`Welcome, ${user.fullName}`} description="ODL online class administration." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href}>
            <Card className={t.warn ? 'border-red-300' : ''}>
              <CardHeader>
                <CardDescription>{t.label}</CardDescription>
                <CardTitle className="text-3xl">{t.value}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">Open →</CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
