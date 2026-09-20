'use server';

import { z } from 'zod';
import { ActionError, formAction, must } from '@/lib/actions';
import { validateOverrideUrl } from '@shared/sessions.ts';

const paths = (id: string) => [`/teacher/sessions/${id}`, '/teacher', '/teacher/upcoming', '/student', '/admin/sessions'];

/**
 * §9: replace the auto-generated link for one class. Runs as the caller, so the RLS policy
 * (own session, not ended) and the BEFORE UPDATE trigger (column restriction, https check,
 * provider='custom', audit row) are the enforcement. Admins may do this for any session.
 */
export const setOverride = formAction(
  { roles: ['teacher', 'admin'], schema: z.object({ id: z.string().uuid(), url: z.string().min(1, 'Enter a link') }), revalidate: (i) => paths(i.id) },
  async (input, { supabase }) => {
    const v = validateOverrideUrl(input.url);
    if (!v.ok) throw new ActionError(v.error, { url: v.error });
    const rows = must<{ id: string }[]>(await supabase.from('class_sessions').update({ join_url_override: v.url }).eq('id', input.id).select('id'));
    if (rows.length === 0) throw new ActionError('This class cannot be edited (not yours, or it has already ended).');
    return { message: `Link saved. Students now see "Link updated" and join via ${v.url}. Recording will not be available to students for this class.${v.warning ? ' Note: ' + v.warning : ''}` };
  },
);

export const clearOverride = formAction({ roles: ['teacher', 'admin'], schema: z.object({ id: z.string().uuid() }), revalidate: (i) => paths(i.id) }, async (input, { supabase }) => {
  const rows = must<{ id: string }[]>(await supabase.from('class_sessions').update({ join_url_override: null }).eq('id', input.id).select('id'));
  if (rows.length === 0) throw new ActionError('This class cannot be edited (not yours, or it has already ended).');
  return { message: 'Reverted. A fresh Teams meeting will be created within about 10 minutes; until then the class shows "Link not ready yet".' };
});

export const updateTopic = formAction({ roles: ['teacher', 'admin'], schema: z.object({ id: z.string().uuid(), topic: z.string().max(200).optional() }), revalidate: (i) => paths(i.id) }, async (input, { supabase }) => {
  const rows = must<{ id: string }[]>(await supabase.from('class_sessions').update({ topic: input.topic ?? null }).eq('id', input.id).select('id'));
  if (rows.length === 0) throw new ActionError('This class cannot be edited (not yours, or it has already ended).');
  return { message: 'Topic saved.' };
});
