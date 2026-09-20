'use server';

import { z } from 'zod';
import { ActionError, audit, formAction, must } from '@/lib/actions';
import { createAdminClient } from '@/lib/supabase/admin';
import { istToUtc } from '@/lib/domain/time';
import { completePastSessions, runGenerateSessions } from '@shared/jobs/generate-sessions.ts';

const REVALIDATE = ['/admin/sessions', '/admin', '/admin/sync-health'];
const TIME = z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM');
const endAfterStart = (s: { start_time: string; end_time: string }) => s.end_time > s.start_time;

const rescheduleSchema = z
  .object({ id: z.string().uuid(), date: z.string().date(), start_time: TIME, end_time: TIME, topic: z.string().optional() })
  .refine(endAfterStart, { message: 'End must be after start', path: ['end_time'] });

const extraClassSchema = z
  .object({
    batch_subject_id: z.string().uuid(),
    teacher_id: z.string().uuid(),
    date: z.string().date(),
    start_time: TIME,
    end_time: TIME,
    topic: z.string().optional(),
  })
  .refine(endAfterStart, { message: 'End must be after start', path: ['end_time'] });

export const generateNow = formAction({ roles: ['admin'], schema: z.object({}), revalidate: REVALIDATE }, async (_input, { supabase }) => {
  const admin = createAdminClient();
  const completed = await completePastSessions(admin);
  const r = await runGenerateSessions(admin);
  await audit(supabase, 'sessions.generate_now', 'class_sessions', null, { ...r, completed });
  return { message: `Generated ${r.inserted} new session(s) from ${r.slots} slot(s) for ${r.from} → ${r.to} (${r.candidates} candidates, ${completed} past session(s) marked completed).` };
});

export const cancelSession = formAction({ roles: ['admin'], schema: z.object({ id: z.string().uuid() }), revalidate: REVALIDATE }, async (input, { supabase }) => {
  must(await supabase.from('class_sessions').update({ status: 'cancelled' }).eq('id', input.id).select('id').single());
  return { message: 'Session cancelled. The Teams meeting (if any) will be deleted by the next provisioning run.' };
});

export const rescheduleSession = formAction(
  {
    roles: ['admin'],
    schema: rescheduleSchema,
    revalidate: REVALIDATE,
  },
  async (input, { supabase }) => {
    const start = istToUtc(input.date, input.start_time);
    const end = istToUtc(input.date, input.end_time);
    must(
      await supabase
        .from('class_sessions')
        .update({ scheduled_start: start.toISOString(), scheduled_end: end.toISOString(), topic: input.topic ?? null })
        .eq('id', input.id)
        .select('id')
        .single(),
    );
    return { message: 'Rescheduled. A provisioned Teams meeting keeps its join link and is patched by the next provisioning run.' };
  },
);

export const addExtraClass = formAction(
  {
    roles: ['admin'],
    schema: extraClassSchema,
    revalidate: REVALIDATE,
  },
  async (input, { supabase }) => {
    const start = istToUtc(input.date, input.start_time);
    const end = istToUtc(input.date, input.end_time);
    if (end.getTime() < Date.now()) throw new ActionError('The class would already be over.', { date: 'in the past' });
    const row = must<{ id: string }>(
      await supabase
        .from('class_sessions')
        .insert({
          batch_subject_id: input.batch_subject_id,
          teacher_id: input.teacher_id,
          timetable_slot_id: null,
          scheduled_start: start.toISOString(),
          scheduled_end: end.toISOString(),
          topic: input.topic ?? null,
        })
        .select('id')
        .single(),
    );
    await audit(supabase, 'session.extra_created', 'class_sessions', row.id, input);
    return { message: 'Extra class added; a Teams meeting will be provisioned within 10 minutes.' };
  },
);

export const retrySession = formAction({ roles: ['admin'], schema: z.object({ id: z.string().uuid() }), revalidate: REVALIDATE }, async (input, { supabase }) => {
  must(await supabase.from('class_sessions').update({ sync_status: 'pending', sync_attempts: 0, sync_error: null }).eq('id', input.id).eq('status', 'scheduled').select('id').single());
  await audit(supabase, 'session.retry_requested', 'class_sessions', input.id, {});
  return { message: 'Re-queued for provisioning.' };
});
