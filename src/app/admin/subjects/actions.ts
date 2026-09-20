'use server';

import { z } from 'zod';
import { audit, formAction, must } from '@/lib/actions';

const schema = z.object({
  program_id: z.string().uuid(),
  code: z
    .string()
    .regex(/^[A-Z0-9_-]{2,20}$/, 'Use 2–20 upper-case letters, digits, - or _')
    .transform((s) => s.toUpperCase()),
  name: z.string().min(2),
  credits: z.coerce.number().int().min(0).max(20).optional(),
});

export const createSubject = formAction({ roles: ['admin'], schema, revalidate: ['/admin/subjects'] }, async (input, { supabase }) => {
  const row = must<{ id: string }>(await supabase.from('subjects').insert({ ...input, credits: input.credits ?? null }).select('id').single());
  await audit(supabase, 'subject.created', 'subjects', row.id, input);
  return { message: `Subject ${input.code} created.` };
});

export const updateSubject = formAction(
  { roles: ['admin'], schema: schema.extend({ id: z.string().uuid() }), revalidate: ['/admin/subjects'] },
  async (input, { supabase }) => {
    const { id, ...rest } = input;
    must(await supabase.from('subjects').update({ ...rest, credits: rest.credits ?? null }).eq('id', id).select('id').single());
    await audit(supabase, 'subject.updated', 'subjects', id, rest);
    return { message: 'Saved.' };
  },
);

export const deleteSubject = formAction({ roles: ['admin'], schema: z.object({ id: z.string().uuid() }), revalidate: ['/admin/subjects'] }, async (input, { supabase }) => {
  must(await supabase.from('subjects').delete().eq('id', input.id).select('id').single());
  await audit(supabase, 'subject.deleted', 'subjects', input.id, {});
});
