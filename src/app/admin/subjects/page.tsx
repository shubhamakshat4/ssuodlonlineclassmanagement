import { ActionForm } from '@/components/action-form';
import { Card, CardContent, CardHeader, CardTitle, Field, Input, PageHeader, Select, Table, TBody, TD, TH, THead, TR } from '@/components/ui/primitives';
import { CsvImportCard } from '@/components/csv-import-card';
import { createClient } from '@/lib/supabase/server';
import type { Program, Subject } from '@/lib/db/types';
import { createSubject, deleteSubject, updateSubject } from './actions';

export const metadata = { title: 'Subjects — Admin' };

export default async function SubjectsPage() {
  const supabase = await createClient();
  const [{ data: subjects }, { data: programs }] = await Promise.all([
    supabase.from('subjects').select('*').order('code'),
    supabase.from('programs').select('*').order('code'),
  ]);
  const progs = (programs ?? []) as Program[];
  const byProgram = new Map<string, Subject[]>();
  for (const s of (subjects ?? []) as Subject[]) byProgram.set(s.program_id, [...(byProgram.get(s.program_id) ?? []), s]);

  return (
    <>
      <PageHeader eyebrow="Administration" title="Subjects" description="Subjects belong to a programme. Offer them to a batch from the batch page." />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="grid gap-6">
          {progs.map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <CardTitle>
                  {p.code} — {p.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <THead>
                    <TR>
                      <TH>Code</TH>
                      <TH>Name</TH>
                      <TH>Credits</TH>
                      <TH />
                    </TR>
                  </THead>
                  <TBody>
                    {(byProgram.get(p.id) ?? []).map((s) => (
                      <TR key={s.id}>
                        <TD colSpan={4}>
                          <div className="flex flex-wrap items-center gap-2">
                            <ActionForm action={updateSubject} inline submitLabel="Save">
                              <input type="hidden" name="id" value={s.id} />
                              <input type="hidden" name="program_id" value={s.program_id} />
                              <Input name="code" defaultValue={s.code} className="w-28 font-mono" aria-label="Code" />
                              <Input name="name" defaultValue={s.name} className="w-72" aria-label="Name" />
                              <Input name="credits" type="number" defaultValue={s.credits ?? ''} className="w-20" aria-label="Credits" />
                            </ActionForm>
                            <ActionForm action={deleteSubject} inline submitLabel="Delete" variant="ghost" confirm="Delete this subject? Fails if it is offered to a batch.">
                              <input type="hidden" name="id" value={s.id} />
                            </ActionForm>
                          </div>
                        </TD>
                      </TR>
                    ))}
                    {(byProgram.get(p.id) ?? []).length === 0 ? (
                      <TR>
                        <TD colSpan={4} className="text-muted-foreground">
                          No subjects yet.
                        </TD>
                      </TR>
                    ) : null}
                  </TBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="self-start">
          <CardHeader>
            <CardTitle>New subject</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={createSubject} submitLabel="Create" resetOnSuccess>
              <Field label="Programme" htmlFor="program_id">
                <Select id="program_id" name="program_id" required defaultValue="">
                  <option value="" disabled>
                    Select…
                  </option>
                  {progs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Code" htmlFor="code" hint="e.g. BBA301">
                <Input id="code" name="code" required className="font-mono uppercase" />
              </Field>
              <Field label="Name" htmlFor="name">
                <Input id="name" name="name" required />
              </Field>
              <Field label="Credits" htmlFor="credits">
                <Input id="credits" name="credits" type="number" min={0} max={20} />
              </Field>
            </ActionForm>
          </CardContent>
        </Card>
      </div>
      <div className="mt-6">
        <CsvImportCard entity="subjects" />
      </div>
    </>
  );
}
