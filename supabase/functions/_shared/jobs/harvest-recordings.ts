/**
 * Job: harvest Teams cloud recordings for completed sessions (SPEC §7.4).
 *
 * Primary path:  GET /onlineMeetings/{id}/recordings → metadata. Graph returns a recordingContentUrl,
 *                and sometimes a OneDrive item. Either is enough to save the recording; the drive item
 *                is preferred when present because it yields a short-lived direct download URL.
 * Fallback path: scan the service account's OneDrive /Recordings folder (session window + subject in
 *                the file name). Used when the primary gives nothing 6 h after the class, when the
 *                session has no meeting id, or when GRAPH_RECORDING_MODE=manual.
 *
 * The fallback is genuinely optional: a service account with no OneDrive answers it with
 * "ResourceNotFound: User's mysite not found", which is a fact about the tenant and not a failure of
 * this run - so it is noted once and the session is left pending rather than erroring every hour.
 *
 * Inserts recordings rows with expires_at = recorded_at + retention days. Never copies the file.
 */
import type { DriveItem, GraphClient, GraphRecording } from '../graph/types.ts';
import { audit, unwrap, type DbClient } from '../db.ts';
import { recordingExpiresAt } from '../sessions.ts';

export interface AwaitingSession {
  id: string;
  graph_online_meeting_id: string | null;
  graph_event_id: string | null;
  scheduled_start: string;
  scheduled_end: string;
  subject_name: string;
  batch_code: string;
}

export interface HarvestOptions {
  now?: Date;
  /** primary path disabled (tenant does not auto-record) */
  manualRecordingMode?: boolean;
  /** hours after end before the fallback scan is tried when the primary path is empty */
  fallbackAfterHours?: number;
  retentionDays?: number;
}

export interface HarvestSummary {
  checked: number;
  harvested: number;
  pending: number;
  errors: Array<{ sessionId: string; error: string }>;
}

const MATCH_BEFORE_MS = 15 * 60_000;
const MATCH_AFTER_MS = 6 * 3600_000;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Pure: pick the OneDrive item that belongs to a session (window + subject in name; closest to a hint time). */
export function matchDriveItem(session: Pick<AwaitingSession, 'scheduled_start' | 'scheduled_end' | 'subject_name'>, items: DriveItem[], hintTime?: string): DriveItem | null {
  const start = new Date(session.scheduled_start).getTime() - MATCH_BEFORE_MS;
  const end = new Date(session.scheduled_end).getTime() + MATCH_AFTER_MS;
  const subject = norm(session.subject_name);
  const candidates = items.filter((i) => {
    const t = new Date(i.createdDateTime).getTime();
    return t >= start && t <= end && norm(i.name).includes(subject);
  });
  if (candidates.length === 0) return null;
  const target = hintTime ? new Date(hintTime).getTime() : new Date(session.scheduled_start).getTime();
  candidates.sort((a, b) => Math.abs(new Date(a.createdDateTime).getTime() - target) - Math.abs(new Date(b.createdDateTime).getTime() - target));
  return candidates[0];
}

export async function runHarvestRecordings(db: DbClient, graph: GraphClient, opts: HarvestOptions = {}): Promise<HarvestSummary> {
  const now = opts.now ?? new Date();
  const fallbackAfterMs = (opts.fallbackAfterHours ?? 6) * 3600_000;
  const summary: HarvestSummary = { checked: 0, harvested: 0, pending: 0, errors: [] };

  const settings = unwrap<{ recording_retention_days: number }>(await db.from('app_settings').select('recording_retention_days').eq('id', 1).single(), 'load settings');
  const retentionDays = opts.retentionDays ?? settings.recording_retention_days ?? 30;

  const sessions = unwrap<AwaitingSession[]>(await db.from('v_sessions_awaiting_recording').select('*'), 'load sessions');
  summary.checked = sessions.length;
  if (sessions.length === 0) return summary;

  // Loaded at most once per run, and at most once ever if the tenant has no OneDrive to scan.
  let folder: DriveItem[] | null = null;
  let folderUnavailable: string | null = null;
  const loadFolder = async (): Promise<DriveItem[]> => {
    if (folder) return folder;
    if (folderUnavailable) return [];
    try {
      folder = await graph.listRecordingsFolder('harvest');
      return folder;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // No OneDrive on the service account is a tenant fact, not a run failure.
      if (/mysite not found|ResourceNotFound/i.test(message)) {
        folderUnavailable = message;
        await audit(db, 'recording.folder_unavailable', 'recordings', null, { error: message });
        return [];
      }
      throw e;
    }
  };

  for (const s of sessions) {
    try {
      let recording: GraphRecording | null = null;
      let item: DriveItem | null = null;
      const endedAgo = now.getTime() - new Date(s.scheduled_end).getTime();

      if (!opts.manualRecordingMode && s.graph_online_meeting_id) {
        const recs = await graph.listMeetingRecordings(s.graph_online_meeting_id, s.id);
        if (recs.length > 0) {
          recording = recs.slice().sort((a, b) => a.createdDateTime.localeCompare(b.createdDateTime))[0];
          if (recording.driveId && recording.driveItemId) {
            item = { driveId: recording.driveId, itemId: recording.driveItemId, name: '', createdDateTime: recording.createdDateTime, sizeBytes: recording.sizeBytes, durationSeconds: recording.durationSeconds };
          } else if (!recording.contentUrl) {
            // Neither pointer: the file may still be findable in the folder, if there is one.
            item = matchDriveItem(s, await loadFolder(), recording.createdDateTime);
          }
        }
      }

      // A content URL is enough on its own - it is all Graph returns when the service account has no
      // OneDrive, which is the case here.
      const playable = item || recording?.contentUrl;

      if (!playable && (opts.manualRecordingMode || !s.graph_online_meeting_id || endedAgo >= fallbackAfterMs)) {
        item = matchDriveItem(s, await loadFolder());
      }

      if (!item && !recording?.contentUrl) {
        summary.pending++;
        continue;
      }

      const recordedAt = recording?.createdDateTime ?? item!.createdDateTime;
      const row = {
        class_session_id: s.id,
        graph_recording_id: recording?.id ?? `drive:${item!.itemId}`,
        drive_id: item?.driveId ?? null,
        drive_item_id: item?.itemId ?? null,
        content_url: recording?.contentUrl ?? null,
        recorded_at: recordedAt,
        duration_seconds: item?.durationSeconds ?? recording?.durationSeconds ?? null,
        size_bytes: item?.sizeBytes ?? recording?.sizeBytes ?? null,
        expires_at: recordingExpiresAt(recordedAt, retentionDays).toISOString(),
        status: 'available',
      };
      const res = await db.from('recordings').upsert(row, { onConflict: 'class_session_id,graph_recording_id', ignoreDuplicates: true }).select('id');
      if (res.error) throw new Error(res.error.message);
      summary.harvested++;
      await audit(db, 'recording.harvested', 'class_sessions', s.id, {
        path: recording ? (item ? 'primary+drive' : 'primary+content_url') : 'fallback',
        drive_item_id: item?.itemId ?? null,
        expires_at: row.expires_at,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      summary.errors.push({ sessionId: s.id, error: message });
      await audit(db, 'recording.harvest_failed', 'class_sessions', s.id, { error: message });
    }
  }

  await audit(db, 'harvester.run', 'recordings', null, { ...summary, errors: summary.errors.slice(0, 20) });
  return summary;
}

export async function runExpireRecordings(db: DbClient): Promise<number> {
  const n = unwrap<number>(await db.rpc('expire_recordings'), 'expire') ?? 0;
  await audit(db, 'recordings.expired', 'recordings', null, { count: n });
  return n;
}
