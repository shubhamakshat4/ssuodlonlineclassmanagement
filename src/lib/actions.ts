import 'server-only';
import { revalidatePath } from 'next/cache';
import type { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser, type CurrentUser } from '@/lib/auth/session';
import type { Role } from '@/lib/auth/routing';

/** Uniform result for server actions driven by useActionState. */
export interface ActionState {
  ok?: boolean;
  error?: string;
  message?: string;
  /** Field-level errors keyed by input name. */
  fields?: Record<string, string>;
  /** Optional payload (e.g. import summary). */
  data?: Record<string, unknown>;
}

export class ActionError extends Error {
  constructor(
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

/** Convert FormData into a plain object; empty strings become undefined so zod optionals work. */
export function formToObject(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith('$ACTION')) continue;
    if (typeof value === 'string') {
      const v = value.trim();
      if (key.endsWith('[]')) {
        const k = key.slice(0, -2);
        if (Array.isArray(out[k])) (out[k] as string[]).push(v);
        else out[k] = [v];
      } else {
        out[key] = v === '' ? undefined : v;
      }
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Wrap a server action: require a role, validate FormData with a zod schema, translate errors into
 * ActionState, and revalidate paths on success.
 */
export function formAction<S extends z.ZodTypeAny>(
  opts: { roles: Role[]; schema: S; revalidate?: string[] | ((input: z.infer<S>) => string[]) },
  handler: (input: z.infer<S>, ctx: { user: CurrentUser; supabase: Awaited<ReturnType<typeof createClient>> }) => Promise<ActionState | void>,
) {
  return async (_prev: ActionState, formData: FormData): Promise<ActionState> => {
    const user = await getCurrentUser();
    if (!user || !opts.roles.includes(user.role)) return { error: 'Not allowed.' };

    const parsed = opts.schema.safeParse(formToObject(formData));
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.') || '_';
        if (!fields[key]) fields[key] = issue.message;
      }
      return { error: 'Please fix the highlighted fields.', fields };
    }

    try {
      const supabase = await createClient();
      const result = (await handler(parsed.data, { user, supabase })) ?? { ok: true };
      const paths = typeof opts.revalidate === 'function' ? opts.revalidate(parsed.data) : (opts.revalidate ?? []);
      for (const p of paths) revalidatePath(p);
      return { ok: true, ...result };
    } catch (e) {
      if (e instanceof ActionError) return { error: e.message, fields: e.fields };
      // Next.js redirect() throws; let it propagate.
      if (e && typeof e === 'object' && 'digest' in e && String((e as { digest: unknown }).digest).startsWith('NEXT_REDIRECT')) throw e;
      return { error: friendlyDbError(e) };
    }
  };
}

/** Map Postgres / PostgREST errors to something a human can act on. */
export function friendlyDbError(e: unknown): string {
  const err = e as { code?: string; message?: string; details?: string };
  const msg = err?.message ?? String(e);
  if (err?.code === '23505') return 'A record with the same unique value already exists (' + (err.details ?? msg) + ').';
  if (err?.code === '23503') return 'This record is still referenced by other data and cannot be changed that way.';
  if (err?.code === '42501') return msg.replace(/^.*?:\s*/, '') || 'Not allowed.';
  if (err?.code === '23514') return 'A value is outside the allowed range: ' + msg;
  return msg;
}

/** Throw on a PostgREST error object. */
export function must<T>(res: { data: T | null; error: { message: string; code?: string; details?: string } | null }): NonNullable<T> {
  if (res.error) throw res.error;
  return res.data as NonNullable<T>;
}

export async function audit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  action: string,
  entity: string,
  entityId: string | null,
  payload: Record<string, unknown> = {},
) {
  await supabase.rpc('log_audit', { p_action: action, p_entity: entity, p_entity_id: entityId, p_payload: payload });
}
