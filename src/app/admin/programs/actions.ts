'use server';

import { z } from 'zod';
import { audit, formAction, must } from '@/lib/actions';

const CODE = z
  .string()
  .regex(/^[A-Z0-9_-]{2,20}$/, 'Use 2–20 upper-case letters, digits, - or _')
  .transform((s) => s.toUpperCase());

export const createProgram = formAction(
  { roles: ['admin'], schema: z.object({ name: z.string().min(2), code: CODE }), revalidate: ['/admin/programs', '/admin'] },
  async (input, { supabase }) => {
    const row = must<{ id: string }>(await supabase.from('programs').insert({ name: input.name, code: input.code }).select('id').single());
    await audit(supabase, 'program.created', 'programs', row.id, input);
    return { message: `Programme ${input.code} created.` };
  },
);

export const updateProgram = formAction(
  {
    roles: ['admin'],
    schema: z.object({ id: z.string().uuid(), name: z.string().min(2), code: CODE, is_active: z.coerce.boolean().optional() }),
    revalidate: ['/admin/programs'],
  },
  async (input, { supabase }) => {
    must(await supabase.from('programs').update({ name: input.name, code: input.code, is_active: input.is_active ?? false }).eq('id', input.id).select('id').single());
    await audit(supabase, 'program.updated', 'programs', input.id, input);
    return { message: 'Saved.' };
  },
);
