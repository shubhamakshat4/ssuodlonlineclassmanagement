'use server';

import { z } from 'zod';
import { audit, formAction, must } from '@/lib/actions';

const CODE = z
  .string()
  .regex(/^[A-Z0-9_-]{2,30}$/, 'Use 2–30 upper-case letters, digits, - or _')
  .transform((s) => s.toUpperCase());

const batchSchema = z.object({
  program_id: z.string().uuid(),
  name: z.string().min(2),
  code: CODE,
  intake_year: z.coerce.number().int().min(2000).max(2100),
  current_semester: z.coerce.number().int().min(1).max(12),
  start_date: z.string().date().optional(),
  end_date: z.string().date().optional(),
  is_active: z.coerce.boolean().optional(),
});

export const createBatch = formAction({ roles: ['admin'], schema: batchSchema, revalidate: ['/admin/batches', '/admin'] }, async (input, { supabase }) => {
  const row = must<{ id: string }>(
    await supabase
      .from('batches')
      .insert({ ...input, is_active: true, start_date: input.start_date ?? null, end_date: input.end_date ?? null })
      .select('id')
      .single(),
  );
  await audit(supabase, 'batch.created', 'batches', row.id, input);
  return { message: `Batch ${input.code} created.` };
});

export const updateBatch = formAction(
  { roles: ['admin'], schema: batchSchema.extend({ id: z.string().uuid() }), revalidate: (i) => ['/admin/batches', `/admin/batches/${i.id}`] },
  async (input, { supabase }) => {
    const { id, ...rest } = input;
    must(
      await supabase
        .from('batches')
        .update({ ...rest, is_active: rest.is_active ?? false, start_date: rest.start_date ?? null, end_date: rest.end_date ?? null })
        .eq('id', id)
        .select('id')
        .single(),
    );
    await audit(supabase, 'batch.updated', 'batches', id, rest);
    return { message: 'Saved.' };
  },
);

// ---------------------------------------------------------------------------
// batch_subjects (subject offered to a batch in a semester)
// ---------------------------------------------------------------------------
export const addBatchSubject = formAction(
  {
    roles: ['admin'],
    schema: z.object({ batch_id: z.string().uuid(), subject_id: z.string().uuid(), semester: z.coerce.number().int().min(1).max(12) }),
    revalidate: (i) => [`/admin/batches/${i.batch_id}`],
  },
  async (input, { supabase }) => {
    const row = must<{ id: string }>(await supabase.from('batch_subjects').insert(input).select('id').single());
    await audit(supabase, 'batch_subject.created', 'batch_subjects', row.id, input);
    return { message: 'Subject added to batch.' };
  },
);

export const toggleBatchSubject = formAction(
  {
    roles: ['admin'],
    schema: z.object({ id: z.string().uuid(), batch_id: z.string().uuid(), is_active: z.enum(['true', 'false']) }),
    revalidate: (i) => [`/admin/batches/${i.batch_id}`],
  },
  async (input, { supabase }) => {
    must(await supabase.from('batch_subjects').update({ is_active: input.is_active === 'true' }).eq('id', input.id).select('id').single());
    await audit(supabase, 'batch_subject.updated', 'batch_subjects', input.id, { is_active: input.is_active });
  },
);

// ---------------------------------------------------------------------------
// subject_teachers (assignment)
// ---------------------------------------------------------------------------
export const assignTeacher = formAction(
  {
    roles: ['admin'],
    schema: z.object({
      batch_subject_id: z.string().uuid(),
      teacher_id: z.string().uuid(),
      is_primary: z.coerce.boolean().optional(),
      return_to: z.string().optional(),
    }),
    revalidate: (i) => [i.return_to ?? '/admin/batches', '/admin/teachers'],
  },
  async (input, { supabase }) => {
    const row = must<{ id: string }>(
      await supabase
        .from('subject_teachers')
        .insert({ batch_subject_id: input.batch_subject_id, teacher_id: input.teacher_id, is_primary: input.is_primary ?? false })
        .select('id')
        .single(),
    );
    await audit(supabase, 'subject_teacher.assigned', 'subject_teachers', row.id, input);
    return { message: 'Teacher assigned.' };
  },
);

export const unassignTeacher = formAction(
  { roles: ['admin'], schema: z.object({ id: z.string().uuid(), return_to: z.string().optional() }), revalidate: (i) => [i.return_to ?? '/admin/batches', '/admin/teachers'] },
  async (input, { supabase }) => {
    must(await supabase.from('subject_teachers').delete().eq('id', input.id).select('id').single());
    await audit(supabase, 'subject_teacher.removed', 'subject_teachers', input.id, {});
  },
);
