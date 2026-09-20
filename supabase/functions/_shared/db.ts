/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Structural type for a supabase-js client so shared job code compiles under both Deno
 * (`npm:@supabase/supabase-js@2`) and Node without importing either package here.
 */
export interface DbClient {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
}

export function unwrap<T>(res: { data: T | null; error: { message: string } | null }, context: string): T {
  if (res.error) throw new Error(`${context}: ${res.error.message}`);
  return res.data as T;
}

export async function audit(db: DbClient, action: string, entity: string, entityId: string | null, payload: Record<string, unknown>) {
  const { error } = await db.rpc('log_audit', { p_action: action, p_entity: entity, p_entity_id: entityId, p_payload: payload });
  if (error) console.error('audit failed', action, error.message);
}
