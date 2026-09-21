import { ActionForm } from '@/components/action-form';
import { Badge, Card, CardContent, CardHeader, CardTitle, Field, Input, PageHeader, Table, TBody, TD, TH, THead, TR } from '@/components/ui/primitives';
import { CsvImportCard } from '@/components/csv-import-card';
import { createClient } from '@/lib/supabase/server';
import type { Program } from '@/lib/db/types';
import { createProgram, updateProgram } from './actions';

export const metadata = { title: 'Programmes — Admin' };

export default async function ProgramsPage() {
  const supabase = await createClient();
  const { data } = await supabase.from('programs').select('*').order('code');
  const programs = (data ?? []) as Program[];

  return (
    <>
      <PageHeader eyebrow="Administration" title="Programmes" description="Degree programmes offered through ODL. Batches and subjects hang off a programme." />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardContent className="pt-5">
            <Table>
              <THead>
                <TR>
                  <TH>Code</TH>
                  <TH>Name</TH>
                  <TH>Active</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {programs.map((p) => (
                  <TR key={p.id}>
                    <TD colSpan={4}>
                      <ActionForm action={updateProgram} inline submitLabel="Save" className="flex-wrap">
                        <input type="hidden" name="id" value={p.id} />
                        <Input name="code" defaultValue={p.code} className="w-32 font-mono" aria-label="Code" />
                        <Input name="name" defaultValue={p.name} className="w-72" aria-label="Name" />
                        <label className="flex items-center gap-1 text-sm">
                          <input type="checkbox" name="is_active" defaultChecked={p.is_active} /> Active
                        </label>
                        {!p.is_active ? <Badge variant="secondary">inactive</Badge> : null}
                      </ActionForm>
                    </TD>
                  </TR>
                ))}
                {programs.length === 0 ? (
                  <TR>
                    <TD colSpan={4} className="text-muted-foreground">
                      No programmes yet.
                    </TD>
                  </TR>
                ) : null}
              </TBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>New programme</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={createProgram} submitLabel="Create" resetOnSuccess>
              <Field label="Code" htmlFor="code" hint="e.g. BBA-ODL">
                <Input id="code" name="code" required className="font-mono uppercase" />
              </Field>
              <Field label="Name" htmlFor="name">
                <Input id="name" name="name" required />
              </Field>
            </ActionForm>
          </CardContent>
        </Card>
      </div>
      <div className="mt-6">
        <CsvImportCard entity="programs" />
      </div>
    </>
  );
}
