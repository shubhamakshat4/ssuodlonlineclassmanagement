/**
 * recording-play — GET /functions/v1/recording-play?session_id=…   (SPEC §8)
 *
 *   1. verify the caller's Supabase JWT
 *   2. authorise by reading `recordings` AS THE CALLER: the RLS policy already encodes
 *      "active student enrolled in the batch_subject and now() < expires_at, or the session's
 *      teacher, or an admin" — one source of truth, no duplicated rules
 *   3. resolve the OneDrive item with the app token and 302 to @microsoft.graph.downloadUrl
 *      (short-lived, supports range requests, never stored or cached)
 *   4. log the playback
 */
import { anonClientForRequest, errorResponse, json, serviceClient } from '../_shared/deno/runtime.ts';
import { createGraphClient } from '../_shared/graph/index.ts';
import { graphAuditHook } from '../_shared/graph/audit.ts';
import { GraphError } from '../_shared/graph/types.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get('session_id') ?? '';
    if (!UUID.test(sessionId)) return json({ error: 'session_id required' }, 400);

    const userClient = anonClientForRequest(req);
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    // Authorisation = visibility under RLS (student enrolled & not expired / teacher / admin).
    const { data: rec, error } = await userClient
      .from('recordings')
      .select('id, drive_id, drive_item_id, status, expires_at')
      .eq('class_session_id', sessionId)
      .eq('status', 'available')
      .order('recorded_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!rec) return json({ error: 'No recording available for this class, or it has expired.' }, 404);
    if (new Date(rec.expires_at).getTime() <= Date.now()) return json({ error: 'This recording has expired.' }, 410);
    if (!rec.drive_id || !rec.drive_item_id) return json({ error: 'Recording file not resolved yet.' }, 409);

    const db = serviceClient();
    const graph = createGraphClient(Deno.env.toObject(), { onCall: graphAuditHook(db) });
    let downloadUrl: string;
    try {
      downloadUrl = await graph.getDownloadUrl(rec.drive_id, rec.drive_item_id, sessionId);
    } catch (e) {
      if (e instanceof GraphError && e.status === 404) return json({ error: 'The recording file is no longer available.' }, 410);
      throw e;
    }

    await userClient.rpc('log_audit', { p_action: 'recording.played', p_entity: 'recordings', p_entity_id: rec.id, p_payload: { session_id: sessionId, user_id: user.id } });

    return new Response(null, { status: 302, headers: { Location: downloadUrl, 'Cache-Control': 'no-store' } });
  } catch (e) {
    return errorResponse(e);
  }
});
