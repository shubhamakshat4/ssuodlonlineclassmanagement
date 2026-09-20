/**
 * SPEC §7.2 steps 1→3 as one unit, shared by the Phase 6 spike and the provisioner.
 * Step 3 is split so the caller can decide how to treat a rejected `recordAutomatically`
 * (fallback: manual recording + OneDrive scan, §7.4).
 */
import { GraphError, type GraphClient, type MeetingOptions } from './types.ts';

/** IANA -> Windows time zone name for the few zones we care about. */
export const WINDOWS_TZ: Record<string, string> = {
  'Asia/Kolkata': 'India Standard Time',
  UTC: 'UTC',
};

export interface ProvisionInput {
  sessionId: string;
  subject: string;
  startLocal: string; // "2026-01-12T10:00:00"
  endLocal: string;
  timeZone: string; // IANA
  teacherUpn: string;
  teacherUserId: string | null;
  /** false when the tenant rejected recordAutomatically (GRAPH_RECORDING_MODE=manual) */
  recordAutomatically: boolean;
}

export interface ProvisionOutcome {
  eventId: string;
  joinUrl: string;
  meetingId: string;
  /** step 3 applied with recordAutomatically=true */
  autoRecording: boolean;
  /** the error from step 3 when recordAutomatically had to be dropped */
  recordAutomaticallyError: string | null;
  /** resolved teacher object id (when it had to be looked up) */
  teacherUserId: string | null;
}

export function meetingOptions(input: { teacherUpn: string; teacherUserId: string | null; recordAutomatically: boolean }): MeetingOptions {
  return {
    recordAutomatically: input.recordAutomatically,
    allowedPresenters: 'roleIsPresenter',
    lobbyBypassScope: 'everyone',
    isDialInBypassEnabled: true,
    allowAttendeeToEnableMic: false,
    allowAttendeeToEnableCamera: false,
    coorganizers: [{ upn: input.teacherUpn, userId: input.teacherUserId }],
  };
}

export async function runProvisionSequence(graph: GraphClient, input: ProvisionInput): Promise<ProvisionOutcome> {
  const tz = WINDOWS_TZ[input.timeZone] ?? input.timeZone;
  const cid = input.sessionId;

  // Teacher object id is required for the co-organiser identity; resolve and let the caller cache it.
  let teacherUserId = input.teacherUserId;
  if (!teacherUserId) teacherUserId = await graph.resolveUserId(input.teacherUpn, cid);

  // Step 1 — calendar-backed event (never a bare onlineMeeting: recordings would be unretrievable).
  const created = await graph.createCalendarEvent(
    { transactionId: input.sessionId, subject: input.subject, startLocal: input.startLocal, endLocal: input.endLocal, timeZone: tz, attendeeUpns: [input.teacherUpn] },
    cid,
  );
  if (!created.joinUrl) {
    throw new GraphError('Event created without an onlineMeeting.joinUrl — is Teams enabled for the service account?', 502, 'noJoinUrl', null, 'POST /users/{sa}/events');
  }

  // Step 2 — resolve the online meeting id (may lag a few seconds after event creation).
  let meetingId: string | null = null;
  for (let i = 0; i < 4 && !meetingId; i++) {
    meetingId = await graph.findOnlineMeetingByJoinUrl(created.joinUrl, cid);
    if (!meetingId) await new Promise((r) => setTimeout(r, graph.mode === 'mock' ? 0 : 1500 * (i + 1)));
  }
  if (!meetingId) {
    throw new GraphError('Online meeting not found by JoinWebUrl after event creation', 502, 'meetingNotFound', null, 'GET /users/{sa}/onlineMeetings');
  }

  // Step 3 — meeting options. If recordAutomatically is rejected, retry once without it so the
  // presenter/lobby hardening still lands, and report the failure for the fallback path.
  let autoRecording = input.recordAutomatically;
  let recordAutomaticallyError: string | null = null;
  try {
    await graph.patchOnlineMeetingOptions(meetingId, meetingOptions({ teacherUpn: input.teacherUpn, teacherUserId, recordAutomatically: input.recordAutomatically }), cid);
  } catch (e) {
    if (input.recordAutomatically && e instanceof GraphError && e.isPermanent) {
      recordAutomaticallyError = e.message;
      autoRecording = false;
      await graph.patchOnlineMeetingOptions(meetingId, meetingOptions({ teacherUpn: input.teacherUpn, teacherUserId, recordAutomatically: false }), cid);
    } else {
      throw e;
    }
  }

  return { eventId: created.eventId, joinUrl: created.joinUrl, meetingId, autoRecording, recordAutomaticallyError, teacherUserId };
}
