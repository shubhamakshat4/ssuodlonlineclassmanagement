'use server';

import { z } from 'zod';
import { ActionError, audit, formAction, must } from '@/lib/actions';
import { findClashes, type SlotLike } from '@/lib/domain/clash';
import type { createClient } from '@/lib/supabase/server';

const TIME = z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM');

const baseSlot = z.object({
  batch_id: z.string().uuid(),
  batch_subject_id: z.string().uuid(),
  teacher_id: z.string().uuid(),
  day_of_week: z.coerce.number().int().min(0).max(6),
  start_time: TIME,
  end_time: TIME,
  effective_from: z.string().date(),
  effective_to: z.string().date().optional(),
});

const withChecks = <T extends z.ZodTypeAny>(schema: T) =>
  schema
    .refine((s: z.infer<typeof baseSlot>) => s.end_time > s.start_time, { message: 'End time must be after start time', path: ['end_time'] })
    .refine((s: z.infer<typeof baseSlot>) => !s.effective_to || s.effective_to >= s.effective_from, {
      message: 'Effective-to must be on or after effective-from',
      path: ['effective_to'],
    });

const createSchema = withChecks(baseSlot);
const updateSchema = withChecks(baseSlot.extend({ id: z.string().uuid(), is_active: z.coerce.boolean().optional() }));

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Pre-check with the pure clash finder so the message names the offending slot; the DB trigger is the guarantee. */
async function preCheck(supabase: Supabase, candidate: SlotLike) {
  type Row = Omit<SlotLike, 'batch_id'> & { batch_subjects: { batch_id: string } };
  const rows = must(
    await supabase
      .from('timetable_slots')
      .select('id, teacher_id, day_of_week, start_time, end_time, effective_from, effective_to, is_active, batch_subjects!inner(batch_id)')
      .eq('is_active', true),
  ) as unknown as Row[];
  const existing: SlotLike[] = rows.map((r) => ({ ...r, batch_id: r.batch_subjects.batch_id }));
  const clashes = findClashes(candidate, existing);
  if (clashes.length) {
    const c = clashes[0];
    const label = c.kind === 'teacher' ? 'The teacher is already booked' : c.kind === 'batch' ? 'The batch already has a class' : 'Duplicate slot';
    throw new ActionError(`${label} on that day at ${c.other.start_time.slice(0, 5)}–${c.other.end_time.slice(0, 5)} (overlapping dates).`, {
      start_time: 'clash',
    });
  }
}

export const createSlot = formAction(
  { roles: ['admin'], schema: createSchema, revalidate: (i) => [`/admin/timetable?batch=${i.batch_id}`, '/admin/timetable'] },
  async (input, { supabase }) => {
    await preCheck(supabase, { ...input, effective_to: input.effective_to ?? null });
    const { batch_id, ...slot } = input;
    const row = must<{ id: string }>(await supabase.from('timetable_slots').insert({ ...slot, effective_to: slot.effective_to ?? null }).select('id').single());
    await audit(supabase, 'timetable_slot.created', 'timetable_slots', row.id, { ...slot, batch_id });
    return { message: 'Slot added. Sessions are generated nightly (or run "Generate sessions now" under Sessions).' };
  },
);

export const updateSlot = formAction(
  { roles: ['admin'], schema: updateSchema, revalidate: (i) => [`/admin/timetable?batch=${i.batch_id}`, '/admin/timetable'] },
  async (input, { supabase }) => {
    const active = input.is_active ?? false;
    if (active) await preCheck(supabase, { ...input, effective_to: input.effective_to ?? null, is_active: true });
    const { id, batch_id, is_active: _ignored, ...slot } = input;
    void _ignored;
    must(await supabase.from('timetable_slots').update({ ...slot, is_active: active, effective_to: slot.effective_to ?? null }).eq('id', id).select('id').single());
    await audit(supabase, 'timetable_slot.updated', 'timetable_slots', id, { ...slot, is_active: active, batch_id });
    return { message: 'Saved. Sessions already generated from this slot are not changed automatically — review them under Sessions.' };
  },
);

export const deleteSlot = formAction(
  { roles: ['admin'], schema: z.object({ id: z.string().uuid(), batch_id: z.string().uuid() }), revalidate: (i) => [`/admin/timetable?batch=${i.batch_id}`, '/admin/timetable'] },
  async (input, { supabase }) => {
    must(await supabase.from('timetable_slots').delete().eq('id', input.id).select('id').single());
    await audit(supabase, 'timetable_slot.deleted', 'timetable_slots', input.id, {});
  },
);
