import { ActionForm } from '@/components/action-form';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, EmptyState, Field, Input, PageHeader, Select, Table, TBody, TD, TH, THead, TR } from '@/components/ui/primitives';
import { CsvImportCard } from '@/components/csv-import-card';
import { createClient } from '@/lib/supabase/server';
import type { Program, Subject } from '@/lib/db/types';
import { createSubject, deleteSubject, updateSubject } from './actions';

export const metadata = { title: 'Subjects — Admin' };
// Vercel: allow long imports / provisioner runs (default function timeout is 10 s)
export const maxDuration = 60;

export default async function SubjectsPage({ searchParams }: { searchParams: Promise<{ program?: string; q?: string }> }) {
  const { program, q } = await searchParams;
  const supabase = await createClient();
  // Filtered in the query rather than the page: 98 subjects is already more than anyone wants to scroll.
  let query = supabase.from('subjects').select('*').order('code');
  if (program) query = query.eq('program_id', program);
  if (q) query = query.or(`name.ilike.%${q}%,code.ilike.%${q}%`);
  const [{ data: subjects }, { data: programs }] = await Promise.all([query, supabase.from('programs').select('*').order('code')]);
  const progs = (programs ?? []) as Program[];
  const all = (subjects ?? []) as Subject[];
  const byProgram = new Map<string, Subject[]>();
  for (const s of all) byProgram.set(s.program_id, [...(byProgram.get(s.program_id) ?? []), s]);
  const shown = progs.filter((p) => (byProgram.get(p.id) ?? []).length > 0);

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Subjects"
        description="Subjects belong to a programme. Offer them to a class group from the class group page."
        actions={
          <a href="#new" className={buttonVariants({ variant: 'default', size: 'sm' })}>
            + Add subject
          </a>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="grid gap-6">
          <Card>
            <CardContent className="pt-5">
              <form className="flex flex-wrap items-end gap-3" method="get">
                <Field label="Programme" htmlFor="program">
                  <Select id="program" name="program" defaultValue={program ?? ''} className="w-64">
                    <option value="">All programmes</option>
                    {progs.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} — {p.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Search" htmlFor="q">
                  <Input id="q" name="q" defaultValue={q ?? ''} placeholder="subject name or code" className="w-60" />
                </Field>
                <Button type="submit" variant="outline">
                  Filter
                </Button>
                {program || q ? (
                  <a href="/admin/subjects" className="pb-2 text-sm font-medium text-primary hover:underline">
                    Clear
                  </a>
                ) : null}
                <span className="ml-auto pb-2 text-sm text-muted-foreground">
                  <strong className="text-foreground">{all.length}</strong> subject{all.length === 1 ? '' : 's'}
                </span>
              </form>
            </CardContent>
          </Card>
          {all.length === 0 ? <EmptyState>No subjects match that filter.</EmptyState> : null}
          {shown.map((p) => (
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
        <Card id="new" className="self-start scroll-mt-24">
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
