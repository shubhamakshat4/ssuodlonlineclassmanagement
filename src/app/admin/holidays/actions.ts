'use server';

import { z } from 'zod';
import { audit, formAction, must } from '@/lib/actions';

export const createHoliday = formAction(
  { roles: ['admin'], schema: z.object({ date: z.string().date(), name: z.string().min(2), batch_id: z.string().uuid().optional() }), revalidate: ['/admin/holidays'] },
  async (input, { supabase }) => {
    const row = must<{ id: string }>(await supabase.from('holidays').insert({ date: input.date, name: input.name, batch_id: input.batch_id ?? null }).select('id').single());
    await audit(supabase, 'holiday.created', 'holidays', row.id, input);
    return { message: 'Holiday added. Sessions already generated on that date are not removed automatically — cancel them under Sessions if needed.' };
  },
);

export const deleteHoliday = formAction({ roles: ['admin'], schema: z.object({ id: z.string().uuid() }), revalidate: ['/admin/holidays'] }, async (input, { supabase }) => {
  must(await supabase.from('holidays').delete().eq('id', input.id).select('id').single());
  await audit(supabase, 'holiday.deleted', 'holidays', input.id, {});
});
