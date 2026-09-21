import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Field, Input, PageHeader, Select } from '@/components/ui/primitives';
import { CsvImportCard } from '@/components/csv-import-card';
import { createClient } from '@/lib/supabase/server';
import type { Batch, BatchSubject, Profile, Subject, SubjectTeacher, TimetableSlot } from '@/lib/db/types';
import { DAY_SHORT, hhmm, istDate } from '@/lib/domain/time';
import { createSlot, deleteSlot, updateSlot } from './actions';

export const metadata = { title: 'Timetable — Admin' };

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun

export default async function TimetablePage({ searchParams }: { searchParams: Promise<{ batch?: string }> }) {
  const { batch: batchParam } = await searchParams;
  const supabase = await createClient();
  const { data: batchesData } = await supabase.from('batches').select('*').eq('is_active', true).order('code');
  const batches = (batchesData ?? []) as Batch[];
  const batch = batches.find((b) => b.id === batchParam) ?? batches[0];

  if (!batch) {
    return (
      <>
        <PageHeader eyebrow="Administration" title="Timetable" />
        <EmptyState>Create a batch first.</EmptyState>
      </>
    );
  }

  const [{ data: bsData }, { data: subjectsData }, { data: slotsData }, { data: teachersData }, { data: assignData }] = await Promise.all([
    supabase.from('batch_subjects').select('*').eq('batch_id', batch.id).eq('is_active', true).order('semester'),
    supabase.from('subjects').select('*'),
    supabase.from('timetable_slots').select('*, batch_subjects!inner(batch_id)').eq('batch_subjects.batch_id', batch.id).order('start_time'),
    supabase.from('profiles').select('*').eq('role', 'teacher').eq('is_active', true).order('full_name'),
    supabase.from('subject_teachers').select('*'),
  ]);
  const batchSubjects = (bsData ?? []) as BatchSubject[];
  const subjectById = new Map(((subjectsData ?? []) as Subject[]).map((s) => [s.id, s]));
  const teachers = (teachersData ?? []) as Profile[];
  const teacherById = new Map(teachers.map((t) => [t.id, t]));
  const slots = (slotsData ?? []) as TimetableSlot[];
  const bsById = new Map(batchSubjects.map((bs) => [bs.id, bs]));
  const assignments = (assignData ?? []) as SubjectTeacher[];
  const primaryTeacherForBs = (bsId: string) => assignments.find((a) => a.batch_subject_id === bsId && a.is_primary)?.teacher_id ?? assignments.find((a) => a.batch_subject_id === bsId)?.teacher_id;
  const bsLabel = (bsId: string) => {
    const bs = bsById.get(bsId);
    const s = bs ? subjectById.get(bs.subject_id) : undefined;
    return s ? `${s.code} ${s.name}` : '—';
  };

  return (
    <>
      <PageHeader
        title="Timetable builder"
        description="Weekly recurring slots per batch. The nightly job expands them into sessions 21 days ahead, skipping holidays. Clashes (same teacher or same batch) are rejected."
        actions={
          <form method="get" className="flex items-center gap-2">
            <Select name="batch" defaultValue={batch.id} className="w-56">
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code}
                </option>
              ))}
            </Select>
            <button type="submit" className="rounded-md border border-border px-3 py-1.5 text-sm">
              Switch
            </button>
          </form>
        }
      />

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>
              {batch.code} — week view <span className="font-normal text-muted-foreground">(semester {batch.current_semester})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
              {DAY_ORDER.map((d) => (
                <div key={d} className="rounded-lg border border-border bg-surface-muted p-2">
                  <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{DAY_SHORT[d]}</div>
                  <div className="grid gap-2">
                    {slots
                      .filter((s) => s.day_of_week === d)
                      .map((s) => (
                        <div key={s.id} className={`rounded-lg border p-2.5 text-xs ${s.is_active ? 'border-primary/20 bg-primary-soft' : 'border-border bg-muted opacity-60'}`}>
                          <div className="font-mono">
                            {hhmm(s.start_time)}–{hhmm(s.end_time)}
                          </div>
                          <div className="font-medium">{bsLabel(s.batch_subject_id)}</div>
                          <div className="text-muted-foreground">{teacherById.get(s.teacher_id)?.full_name ?? '—'}</div>
                          {!s.is_active ? <Badge variant="secondary">inactive</Badge> : null}
                        </div>
                      ))}
                    {slots.filter((s) => s.day_of_week === d).length === 0 ? <div className="text-xs text-muted-foreground">—</div> : null}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Add slot</CardTitle>
            <CardDescription>
              Subjects come from the batch page.{' '}
              <Link href={`/admin/batches/${batch.id}`} className="text-primary underline">
                Manage {batch.code} subjects & teachers
              </Link>
              .
            </CardDescription>
          </CardHeader>
          <CardContent>
            {batchSubjects.length === 0 ? (
              <EmptyState>No active subjects for this batch yet.</EmptyState>
            ) : (
              <ActionForm action={createSlot} submitLabel="Add slot" resetOnSuccess>
                <input type="hidden" name="batch_id" value={batch.id} />
                <div className="grid gap-3 md:grid-cols-4">
                  <Field label="Subject" htmlFor="batch_subject_id">
                    <Select id="batch_subject_id" name="batch_subject_id" required defaultValue="">
                      <option value="" disabled>
                        Select…
                      </option>
                      {batchSubjects.map((bs) => (
                        <option key={bs.id} value={bs.id}>
                          S{bs.semester} · {bsLabel(bs.id)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Teacher" htmlFor="teacher_id">
                    <Select id="teacher_id" name="teacher_id" required defaultValue={primaryTeacherForBs(batchSubjects[0].id) ?? ''}>
                      <option value="" disabled>
                        Select…
                      </option>
                      {teachers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.full_name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Day" htmlFor="day_of_week">
                    <Select id="day_of_week" name="day_of_week" defaultValue="1">
                      {DAY_ORDER.map((d) => (
                        <option key={d} value={d}>
                          {DAY_SHORT[d]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Start" htmlFor="start_time">
                      <Input id="start_time" name="start_time" type="time" step={300} required defaultValue="10:00" />
                    </Field>
                    <Field label="End" htmlFor="end_time">
                      <Input id="end_time" name="end_time" type="time" step={300} required defaultValue="11:00" />
                    </Field>
                  </div>
                  <Field label="Effective from" htmlFor="effective_from">
                    <Input id="effective_from" name="effective_from" type="date" required defaultValue={istDate()} />
                  </Field>
                  <Field label="Effective to (optional)" htmlFor="effective_to">
                    <Input id="effective_to" name="effective_to" type="date" />
                  </Field>
                </div>
              </ActionForm>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>All slots for {batch.code}</CardTitle>
            <CardDescription>Edit a slot in place. Deactivate or set an end date to stop generating sessions; existing sessions stay.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {slots.length === 0 ? <EmptyState>No slots yet.</EmptyState> : null}
            {slots
              .slice()
              .sort((a, b) => DAY_ORDER.indexOf(a.day_of_week) - DAY_ORDER.indexOf(b.day_of_week) || a.start_time.localeCompare(b.start_time))
              .map((s) => (
                <div key={s.id} className="flex flex-wrap items-end gap-2 rounded-md border border-border p-3">
                  <ActionForm action={updateSlot} inline submitLabel="Save" className="flex-wrap">
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="batch_id" value={batch.id} />
                    <Select name="batch_subject_id" defaultValue={s.batch_subject_id} className="w-56" aria-label="Subject">
                      {batchSubjects.map((bs) => (
                        <option key={bs.id} value={bs.id}>
                          {bsLabel(bs.id)}
                        </option>
                      ))}
                      {!bsById.has(s.batch_subject_id) ? <option value={s.batch_subject_id}>(inactive subject)</option> : null}
                    </Select>
                    <Select name="teacher_id" defaultValue={s.teacher_id} className="w-44" aria-label="Teacher">
                      {teachers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.full_name}
                        </option>
                      ))}
                    </Select>
                    <Select name="day_of_week" defaultValue={String(s.day_of_week)} className="w-20" aria-label="Day">
                      {DAY_ORDER.map((d) => (
                        <option key={d} value={d}>
                          {DAY_SHORT[d]}
                        </option>
                      ))}
                    </Select>
                    <Input name="start_time" type="time" step={300} defaultValue={hhmm(s.start_time)} className="w-28" aria-label="Start" />
                    <Input name="end_time" type="time" step={300} defaultValue={hhmm(s.end_time)} className="w-28" aria-label="End" />
                    <Input name="effective_from" type="date" defaultValue={s.effective_from} className="w-36" aria-label="From" />
                    <Input name="effective_to" type="date" defaultValue={s.effective_to ?? ''} className="w-36" aria-label="To" />
                    <label className="flex items-center gap-1 text-xs">
                      <input type="checkbox" name="is_active" defaultChecked={s.is_active} /> active
                    </label>
                  </ActionForm>
                  <ActionForm action={deleteSlot} inline submitLabel="Delete" variant="ghost" confirm="Delete this slot? Generated sessions keep their times but lose the link to the slot.">
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="batch_id" value={batch.id} />
                  </ActionForm>
                </div>
              ))}
          </CardContent>
        </Card>
      </div>
      <div className="mt-6">
        <CsvImportCard entity="timetable" />
      </div>
    </>
  );
}
