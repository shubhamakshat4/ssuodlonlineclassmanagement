/**
 * Microsoft Graph client interface (SPEC §7). Everything the portal needs from Graph goes
 * through this; `real.ts` talks to the tenant, `mock.ts` is used in tests, CI and any
 * environment without credentials.
 */

export interface GraphConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  /** Entra object id of the service account (classes@…) */
  serviceAccountUserId: string;
  serviceAccountUpn: string;
  /** requests per second cap (§7.3) */
  maxRequestsPerSecond?: number;
  /** max attempts per call including retries on 429/503 (§7.3) */
  maxAttempts?: number;
}

export interface GraphCallLog {
  endpoint: string; // e.g. "POST /users/{sa}/events"
  status: number;
  durationMs: number;
  requestId: string | null;
  attempt: number;
  error?: string;
  correlationId?: string; // our own id, e.g. the session id
}

export interface CreateOnlineMeetingInput {
  subject: string;
  /** ISO UTC */
  startUtc: string;
  endUtc: string;
}

export interface CreatedOnlineMeeting {
  meetingId: string;
  joinUrl: string;
}

export interface CreateEventInput {
  /** when set, the event body/location advertise this Teams link (hybrid path) */
  joinUrl?: string | null;
  /** used as Graph transactionId for idempotent retries */
  transactionId: string;
  subject: string;
  /** local wall-clock in the given zone, "2026-01-12T10:00:00" */
  startLocal: string;
  endLocal: string;
  /** Windows time zone name, e.g. "India Standard Time" */
  timeZone: string;
  attendeeUpns: string[];
}

export interface CreatedEvent {
  eventId: string;
  joinUrl: string | null;
}

export interface MeetingOptions {
  recordAutomatically: boolean;
  allowedPresenters: 'roleIsPresenter' | 'organizer' | 'everyone' | 'organization';
  lobbyBypassScope: 'everyone' | 'organization' | 'organizer';
  isDialInBypassEnabled: boolean;
  allowAttendeeToEnableMic: boolean;
  allowAttendeeToEnableCamera: boolean;
  coorganizers: Array<{ upn: string; userId: string | null }>;
}

export interface GraphRecording {
  id: string;
  createdDateTime: string;
  /** Graph's recordingContentUrl (bytes behind app token); not used for playback */
  contentUrl: string | null;
  /** when resolvable, the OneDrive item */
  driveId: string | null;
  driveItemId: string | null;
  durationSeconds: number | null;
  sizeBytes: number | null;
}

export interface DriveItem {
  driveId: string;
  itemId: string;
  name: string;
  createdDateTime: string;
  sizeBytes: number | null;
  durationSeconds: number | null;
}

export class GraphError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string | null,
    public requestId: string | null,
    public endpoint: string,
  ) {
    super(message);
    this.name = 'GraphError';
  }
  /** 4xx (except 429) will not succeed on retry */
  get isPermanent() {
    return this.status >= 400 && this.status < 500 && this.status !== 429;
  }
}

export interface GraphClient {
  readonly mode: 'real' | 'mock';
  /** §7.2 step 1 */
  createCalendarEvent(input: CreateEventInput, correlationId?: string): Promise<CreatedEvent>;
  /** Fallback when Exchange does not attach a Teams link to calendar events: make the meeting directly. */
  createOnlineMeeting(input: CreateOnlineMeetingInput, correlationId?: string): Promise<CreatedOnlineMeeting>;
  /** §7.2 step 2 */
  findOnlineMeetingByJoinUrl(joinUrl: string, correlationId?: string): Promise<string | null>;
  /** §7.2 step 3 */
  patchOnlineMeetingOptions(meetingId: string, options: MeetingOptions, correlationId?: string): Promise<void>;
  /** §7.5 */
  deleteEvent(eventId: string, correlationId?: string): Promise<void>;
  patchEventTimes(eventId: string, startLocal: string, endLocal: string, timeZone: string, correlationId?: string): Promise<void>;
  /** teacher UPN -> Entra object id (cached in teachers.entra_user_id) */
  resolveUserId(upn: string, correlationId?: string): Promise<string | null>;
  /** §7.4 primary */
  listMeetingRecordings(meetingId: string, correlationId?: string): Promise<GraphRecording[]>;
  /** §7.4 fallback: service account OneDrive /Recordings */
  listRecordingsFolder(correlationId?: string): Promise<DriveItem[]>;
  /** §8 */
  getDownloadUrl(driveId: string, itemId: string, correlationId?: string): Promise<string>;
}
