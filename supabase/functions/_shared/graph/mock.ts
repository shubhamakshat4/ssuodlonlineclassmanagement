/**
 * In-memory Graph mock for tests, CI and credential-less environments.
 * Deterministic ids, inspectable state, and switchable failure modes that mirror the
 * real-world failures listed in SPEC §15 (403 access policy, recordAutomatically rejected, 429).
 */
import {
  GraphError,
  type CreateEventInput,
  type CreatedEvent,
  type CreateOnlineMeetingInput,
  type CreatedOnlineMeeting,
  type DriveItem,
  type GraphCallLog,
  type GraphClient,
  type GraphRecording,
  type MeetingOptions,
} from './types.ts';

export type MockFailure = 'none' | 'access-policy-403' | 'record-automatically-400' | 'throttle-429-once' | 'network' | 'no-calendar-join-url';

export interface MockEvent {
  id: string;
  subject: string;
  startLocal: string;
  endLocal: string;
  timeZone: string;
  attendees: string[];
  joinUrl: string;
  meetingId: string;
  transactionId: string;
  deleted: boolean;
}

export interface MockMeeting {
  id: string;
  joinUrl: string;
  options: MeetingOptions | null;
  recordings: GraphRecording[];
}

export class MockGraphClient implements GraphClient {
  readonly mode = 'mock' as const;
  failure: MockFailure = 'none';
  events = new Map<string, MockEvent>();
  meetings = new Map<string, MockMeeting>();
  users = new Map<string, string>(); // upn -> object id
  driveItems: DriveItem[] = [];
  calls: GraphCallLog[] = [];
  private seq = 0;
  private throttled = false;

  constructor(private readonly onCall?: (log: GraphCallLog) => void | Promise<void>) {}

  private async log(endpoint: string, status: number, correlationId?: string, error?: string) {
    const entry: GraphCallLog = { endpoint, status, durationMs: 1, requestId: `mock-req-${++this.seq}`, attempt: 1, correlationId, error };
    this.calls.push(entry);
    await this.onCall?.(entry);
  }

  private async maybeFail(endpoint: string, correlationId?: string) {
    if (this.failure === 'access-policy-403') {
      await this.log(endpoint, 403, correlationId, 'Forbidden');
      throw new GraphError('Graph 403 Forbidden: Application access policy not granted for the service account', 403, 'Forbidden', `mock-req-${this.seq}`, endpoint);
    }
    if (this.failure === 'network') {
      await this.log(endpoint, 0, correlationId, 'network');
      throw new GraphError('Network error: mock offline', 0, 'network', null, endpoint);
    }
    if (this.failure === 'throttle-429-once' && !this.throttled) {
      this.throttled = true;
      await this.log(endpoint, 429, correlationId, 'TooManyRequests');
      throw new GraphError('Graph 429 TooManyRequests', 429, 'TooManyRequests', `mock-req-${this.seq}`, endpoint);
    }
  }

  async createCalendarEvent(input: CreateEventInput, correlationId?: string): Promise<CreatedEvent> {
    const endpoint = 'POST /users/{sa}/events';
    await this.maybeFail(endpoint, correlationId);
    // transactionId idempotency: same transaction -> same event
    const existing = [...this.events.values()].find((e) => e.transactionId === input.transactionId && !e.deleted);
    if (existing) {
      await this.log(endpoint, 201, correlationId);
      return { eventId: existing.id, joinUrl: existing.joinUrl };
    }
    const n = ++this.seq;
    const id = `mock-event-${n}`;
    // Exchange did not attach a Teams link (mirrors a mailbox without teamsForBusiness enabled)
    if (this.failure === 'no-calendar-join-url' && !input.joinUrl) {
      this.events.set(id, { id, subject: input.subject, startLocal: input.startLocal, endLocal: input.endLocal, timeZone: input.timeZone, attendees: input.attendeeUpns, joinUrl: '', meetingId: '', transactionId: input.transactionId, deleted: false });
      await this.log(endpoint, 201, correlationId);
      return { eventId: id, joinUrl: null };
    }
    const meetingId = `mock-meeting-${n}`;
    const joinUrl = input.joinUrl ?? `https://teams.microsoft.com/l/meetup-join/mock/${n}`;
    this.events.set(id, { id, subject: input.subject, startLocal: input.startLocal, endLocal: input.endLocal, timeZone: input.timeZone, attendees: input.attendeeUpns, joinUrl, meetingId, transactionId: input.transactionId, deleted: false });
    if (!input.joinUrl) this.meetings.set(meetingId, { id: meetingId, joinUrl, options: null, recordings: [] });
    await this.log(endpoint, 201, correlationId);
    return { eventId: id, joinUrl };
  }

  /** Direct Teams meeting (hybrid path). */
  async createOnlineMeeting(input: CreateOnlineMeetingInput, correlationId?: string): Promise<CreatedOnlineMeeting> {
    const endpoint = 'POST /users/{sa}/onlineMeetings';
    await this.maybeFail(endpoint, correlationId);
    const n = ++this.seq;
    const meetingId = `mock-meeting-${n}`;
    const joinUrl = `https://teams.microsoft.com/l/meetup-join/mock/${n}`;
    this.meetings.set(meetingId, { id: meetingId, joinUrl, options: null, recordings: [] });
    await this.log(endpoint, 201, correlationId);
    return { meetingId, joinUrl };
  }

  async findOnlineMeetingByJoinUrl(joinUrl: string, correlationId?: string): Promise<string | null> {
    const endpoint = 'GET /users/{sa}/onlineMeetings?$filter=JoinWebUrl';
    await this.maybeFail(endpoint, correlationId);
    await this.log(endpoint, 200, correlationId);
    return [...this.meetings.values()].find((m) => m.joinUrl === joinUrl)?.id ?? null;
  }

  async patchOnlineMeetingOptions(meetingId: string, options: MeetingOptions, correlationId?: string): Promise<void> {
    const endpoint = 'PATCH /users/{sa}/onlineMeetings/{id}';
    await this.maybeFail(endpoint, correlationId);
    const m = this.meetings.get(meetingId);
    if (!m) {
      await this.log(endpoint, 404, correlationId);
      throw new GraphError('Graph 404: meeting not found', 404, 'NotFound', null, endpoint);
    }
    if (this.failure === 'record-automatically-400' && options.recordAutomatically) {
      await this.log(endpoint, 400, correlationId, 'recordAutomatically not supported');
      throw new GraphError("Graph 400 BadRequest: The property 'recordAutomatically' is not supported for this meeting", 400, 'BadRequest', `mock-req-${this.seq}`, endpoint);
    }
    m.options = options;
    await this.log(endpoint, 200, correlationId);
  }

  async deleteEvent(eventId: string, correlationId?: string): Promise<void> {
    const endpoint = 'DELETE /users/{sa}/events/{id}';
    await this.maybeFail(endpoint, correlationId);
    const e = this.events.get(eventId);
    if (e) e.deleted = true;
    await this.log(endpoint, e ? 204 : 404, correlationId);
  }

  async patchEventTimes(eventId: string, startLocal: string, endLocal: string, timeZone: string, correlationId?: string): Promise<void> {
    const endpoint = 'PATCH /users/{sa}/events/{id}';
    await this.maybeFail(endpoint, correlationId);
    const e = this.events.get(eventId);
    if (!e || e.deleted) {
      await this.log(endpoint, 404, correlationId);
      throw new GraphError('Graph 404: event not found', 404, 'ErrorItemNotFound', null, endpoint);
    }
    e.startLocal = startLocal;
    e.endLocal = endLocal;
    e.timeZone = timeZone;
    await this.log(endpoint, 200, correlationId);
  }

  async resolveUserId(upn: string, correlationId?: string): Promise<string | null> {
    const endpoint = 'GET /users/{id}';
    await this.maybeFail(endpoint, correlationId);
    const id = this.users.get(upn.toLowerCase()) ?? null;
    await this.log(endpoint, id ? 200 : 404, correlationId);
    return id;
  }

  async listMeetingRecordings(meetingId: string, correlationId?: string): Promise<GraphRecording[]> {
    const endpoint = 'GET /users/{sa}/onlineMeetings/{id}/recordings';
    await this.maybeFail(endpoint, correlationId);
    await this.log(endpoint, 200, correlationId);
    return this.meetings.get(meetingId)?.recordings ?? [];
  }

  async listRecordingsFolder(correlationId?: string): Promise<DriveItem[]> {
    const endpoint = 'GET /users/{sa}/drive/root:/Recordings:/children';
    await this.maybeFail(endpoint, correlationId);
    await this.log(endpoint, 200, correlationId);
    return this.driveItems;
  }

  async getDownloadUrl(driveId: string, itemId: string, correlationId?: string): Promise<string> {
    const endpoint = 'GET /drives/{id}/items/{id}';
    await this.maybeFail(endpoint, correlationId);
    const item = this.driveItems.find((i) => i.driveId === driveId && i.itemId === itemId);
    if (!item) {
      await this.log(endpoint, 404, correlationId);
      throw new GraphError('Graph 404: item not found', 404, 'itemNotFound', null, endpoint);
    }
    await this.log(endpoint, 200, correlationId);
    return `https://mock.sharepoint.example/download/${itemId}?tempauth=${Date.now()}`;
  }

  // ---- test helpers -------------------------------------------------------
  addRecording(meetingId: string, rec: Partial<GraphRecording> & { id: string; createdDateTime: string }) {
    const m = this.meetings.get(meetingId);
    if (!m) throw new Error(`no meeting ${meetingId}`);
    m.recordings.push({ contentUrl: null, driveId: null, driveItemId: null, durationSeconds: null, sizeBytes: null, ...rec });
  }
  addDriveItem(item: DriveItem) {
    this.driveItems.push(item);
  }
}
