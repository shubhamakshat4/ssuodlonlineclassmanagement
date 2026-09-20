import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { Badge, Card, CardContent, CardHeader, CardTitle, PageHeader, Table, TBody, TD, TH, THead, TR } from '@/components/ui/primitives';
import { createClient } from '@/lib/supabase/server';
import type { Batch, Program } from '@/lib/db/types';
import { createBatch } from './actions';
import { BatchFields } from './batch-form';

export const metadata = { title: 'Batches — Admin' };

export default async function BatchesPage() {
  const supabase = await createClient();
  const [{ data: batches }, { data: programs }, { data: counts }] = await Promise.all([
    supabase.from('batches').select('*').order('intake_year', { ascending: false }).order('code'),
    supabase.from('programs').select('*').eq('is_active', true).order('code'),
    supabase.from('students').select('batch_id'),
  ]);
  const programById = new Map((programs ?? []).map((p: Program) => [p.id, p]));
  const studentCount = new Map<string, number>();
  for (const s of (counts ?? []) as { batch_id: string }[]) studentCount.set(s.batch_id, (studentCount.get(s.batch_id) ?? 0) + 1);

  return (
    <>
      <PageHeader title="Batches" description="An intake cohort of a programme. Students belong to exactly one batch." />
      <div className="grid gap-6">
        <Card>
          <CardContent className="pt-5">
            <Table>
              <THead>
                <TR>
                  <TH>Code</TH>
                  <TH>Name</TH>
                  <TH>Programme</TH>
                  <TH>Intake</TH>
                  <TH>Sem</TH>
                  <TH>Students</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {((batches ?? []) as Batch[]).map((b) => (
                  <TR key={b.id}>
                    <TD className="font-mono">{b.code}</TD>
                    <TD>
                      {b.name} {!b.is_active ? <Badge variant="secondary">inactive</Badge> : null}
                    </TD>
                    <TD>{programById.get(b.program_id)?.code ?? '—'}</TD>
                    <TD>{b.intake_year}</TD>
                    <TD>{b.current_semester}</TD>
                    <TD>{studentCount.get(b.id) ?? 0}</TD>
                    <TD>
                      <Link href={`/admin/batches/${b.id}`} className="text-primary underline">
                        Manage
                      </Link>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>New batch</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={createBatch} submitLabel="Create batch" resetOnSuccess>
              <BatchFields programs={(programs ?? []) as Program[]} />
            </ActionForm>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
