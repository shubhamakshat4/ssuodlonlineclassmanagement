/**
 * SPEC §7.2 steps 1→3 as one unit, shared by the Phase 6 spike and the provisioner.
 *
 * Two ways to end up with a calendar event + a Teams meeting we control:
 *
 *   A. "calendar-first" (the spec's path): POST /events with isOnlineMeeting -> Exchange attaches a
 *      Teams link -> resolve the meeting by JoinWebUrl.
 *   B. "meeting-first" (used automatically when A returns no joinUrl): POST /onlineMeetings -> then
 *      POST /events carrying that link in the body, so the teacher still gets a calendar invite.
 *      Needed when the service-account mailbox has no Teams meeting provider enabled
 *      (`calendar.allowedOnlineMeetingProviders` is empty), which Exchange decides per mailbox.
 *
 * Both end with the same three things: an event id, a join URL, and an online-meeting id — so meeting
 * options (recordAutomatically, presenters, lobby, co-organiser) and recording harvest work either way.
 *
 * Step 3 is split so the caller can decide how to treat a rejected `recordAutomatically` (§7.4).
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
  /** same instants in UTC ISO, for the meeting-first path */
  startUtc: string;
  endUtc: string;
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
  /** which path produced the meeting */
  path: 'calendar-first' | 'meeting-first';
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

  let path: ProvisionOutcome['path'] = 'calendar-first';
  let eventId: string | null = null;
  let joinUrl: string | null = null;
  let meetingId: string | null = null;

  try {
    // ---- A: calendar-first ------------------------------------------------
    const created = await graph.createCalendarEvent(
      { transactionId: input.sessionId, subject: input.subject, startLocal: input.startLocal, endLocal: input.endLocal, timeZone: tz, attendeeUpns: [input.teacherUpn] },
      cid,
    );
    eventId = created.eventId;
    joinUrl = created.joinUrl;

    if (joinUrl) {
      // Step 2 — resolve the online meeting id (may lag a few seconds after event creation).
      for (let i = 0; i < 4 && !meetingId; i++) {
        meetingId = await graph.findOnlineMeetingByJoinUrl(joinUrl, cid);
        if (!meetingId) await new Promise((r) => setTimeout(r, graph.mode === 'mock' ? 0 : 1500 * (i + 1)));
      }
      if (!meetingId) {
        throw new GraphError('Online meeting not found by JoinWebUrl after event creation', 502, 'meetingNotFound', null, 'GET /users/{sa}/onlineMeetings');
      }
    } else {
      // ---- B: meeting-first ----------------------------------------------
      // Exchange did not attach a Teams link to the event; drop it and rebuild around a real meeting.
      path = 'meeting-first';
      await graph.deleteEvent(eventId, cid);
      eventId = null;

      const meeting = await graph.createOnlineMeeting({ subject: input.subject, startUtc: input.startUtc, endUtc: input.endUtc }, cid);
      meetingId = meeting.meetingId;
      joinUrl = meeting.joinUrl;

      const withLink = await graph.createCalendarEvent(
        { transactionId: input.sessionId, subject: input.subject, startLocal: input.startLocal, endLocal: input.endLocal, timeZone: tz, attendeeUpns: [input.teacherUpn], joinUrl },
        cid,
      );
      eventId = withLink.eventId;
    }

    // ---- Step 3 — meeting options ----------------------------------------
    // If recordAutomatically is rejected, retry once without it so the presenter/lobby hardening
    // still lands, and report the failure for the §7.4 fallback.
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

    return { eventId, joinUrl, meetingId, path, autoRecording, recordAutomaticallyError, teacherUserId };
  } catch (e) {
    // Never leave a half-provisioned event on the service account calendar.
    if (eventId) {
      try {
        await graph.deleteEvent(eventId, cid);
      } catch {
        /* best effort */
      }
    }
    throw e;
  }
}
