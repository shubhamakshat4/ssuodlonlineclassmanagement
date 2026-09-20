import 'server-only';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { serverEnv } from '@/lib/env';

/**
 * Service-role client. Bypasses RLS. Only for:
 *   - Admin API user management (create/invite users, app_metadata flags)
 *   - Server-side jobs that must not depend on a user session
 * Never import from a client component; `server-only` enforces that at build time.
 */
export function createAdminClient() {
  const env = serverEnv();
  return createSupabaseClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
