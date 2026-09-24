import { ActionForm } from '@/components/action-form';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, PageHeader, Select, Table, TBody, TD, TH, THead, TR } from '@/components/ui/primitives';
import { CsvImportCard } from '@/components/csv-import-card';
import { createClient } from '@/lib/supabase/server';
import type { Batch, Holiday } from '@/lib/db/types';
import { istDate } from '@/lib/domain/time';
import { createHoliday, deleteHoliday } from './actions';

export const metadata = { title: 'Holidays — Admin' };
// Vercel: allow long imports / provisioner runs (default function timeout is 10 s)
export const maxDuration = 60;

export default async function HolidaysPage() {
  const supabase = await createClient();
  const [{ data: holidays }, { data: batches }] = await Promise.all([
    supabase.from('holidays').select('*').gte('date', istDate(new Date(Date.now() - 30 * 86400000))).order('date'),
    supabase.from('batches').select('*').order('code'),
  ]);
  const batchById = new Map(((batches ?? []) as Batch[]).map((b) => [b.id, b]));

  return (
    <>
      <PageHeader eyebrow="Administration" title="Holidays" description="No sessions are generated on a holiday. A holiday without a class group applies to everyone." />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardContent className="pt-5">
            <Table>
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>Name</TH>
                  <TH>Scope</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {((holidays ?? []) as Holiday[]).map((h) => (
                  <TR key={h.id}>
                    <TD className="font-mono">{h.date}</TD>
                    <TD>{h.name}</TD>
                    <TD>{h.batch_id ? <Badge variant="outline">{batchById.get(h.batch_id)?.code ?? 'batch'}</Badge> : <Badge variant="info">all batches</Badge>}</TD>
                    <TD>
                      <ActionForm action={deleteHoliday} inline submitLabel="Remove" variant="ghost" confirm="Remove this holiday?">
                        <input type="hidden" name="id" value={h.id} />
                      </ActionForm>
                    </TD>
                  </TR>
                ))}
                {(holidays ?? []).length === 0 ? (
                  <TR>
                    <TD colSpan={4} className="text-muted-foreground">
                      No upcoming holidays.
                    </TD>
                  </TR>
                ) : null}
              </TBody>
            </Table>
          </CardContent>
        </Card>
        <Card className="self-start">
          <CardHeader>
            <CardTitle>Add holiday</CardTitle>
            <CardDescription>Showing holidays from the last 30 days onward.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={createHoliday} submitLabel="Add" resetOnSuccess>
              <Field label="Date" htmlFor="date">
                <Input id="date" name="date" type="date" required />
              </Field>
              <Field label="Name" htmlFor="name">
                <Input id="name" name="name" required />
              </Field>
              <Field label="Class group (optional)" htmlFor="batch_id">
                <Select id="batch_id" name="batch_id" defaultValue="">
                  <option value="">All class groups</option>
                  {((batches ?? []) as Batch[]).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.code}
                    </option>
                  ))}
                </Select>
              </Field>
            </ActionForm>
          </CardContent>
        </Card>
      </div>
      <div className="mt-6">
        <CsvImportCard entity="holidays" />
      </div>
    </>
  );
}
