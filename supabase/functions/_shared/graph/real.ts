/**
 * Real Microsoft Graph client: app-only (client credentials), in-memory token cache,
 * 4 req/s throttle, Retry-After-aware exponential backoff with jitter (max 5 attempts),
 * and a log hook for every call (§7.3). Runtime-neutral: fetch + timers only.
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
  type GraphConfig,
  type GraphRecording,
  type MeetingOptions,
} from './types.ts';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

type Fetch = typeof fetch;

export interface RealGraphOptions {
  fetchImpl?: Fetch;
  onCall?: (log: GraphCallLog) => void | Promise<void>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

interface Token {
  value: string;
  expiresAt: number;
}

export class RealGraphClient implements GraphClient {
  readonly mode = 'real' as const;
  private token: Token | null = null;
  private tokenPromise: Promise<Token> | null = null;
  private recentCalls: number[] = [];
  private readonly fetchImpl: Fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly maxRps: number;
  private readonly maxAttempts: number;

  constructor(
    private readonly cfg: GraphConfig,
    private readonly opts: RealGraphOptions = {},
  ) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = opts.now ?? (() => Date.now());
    this.maxRps = cfg.maxRequestsPerSecond ?? 4;
    this.maxAttempts = cfg.maxAttempts ?? 5;
  }

  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------
  private async getToken(): Promise<string> {
    if (this.token && this.token.expiresAt - TOKEN_REFRESH_MARGIN_MS > this.now()) return this.token.value;
    if (!this.tokenPromise) {
      this.tokenPromise = this.fetchToken().finally(() => (this.tokenPromise = null));
    }
    this.token = await this.tokenPromise;
    return this.token.value;
  }

  private async fetchToken(): Promise<Token> {
    const url = `https://login.microsoftonline.com/${this.cfg.tenantId}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      client_id: this.cfg.clientId,
      client_secret: this.cfg.clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    });
    const started = this.now();
    const res = await this.fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const text = await res.text();
    await this.opts.onCall?.({ endpoint: 'POST /oauth2/v2.0/token', status: res.status, durationMs: this.now() - started, requestId: null, attempt: 1 });
    if (!res.ok) throw new GraphError(`Token request failed: ${res.status} ${text.slice(0, 300)}`, res.status, 'token', null, 'POST /oauth2/v2.0/token');
    const json = JSON.parse(text) as { access_token: string; expires_in: number };
    return { value: json.access_token, expiresAt: this.now() + json.expires_in * 1000 };
  }

  // ---------------------------------------------------------------------------
  // Throttle + retry
  // ---------------------------------------------------------------------------
  private async throttle() {
    const windowMs = 1000;
    for (;;) {
      const t = this.now();
      this.recentCalls = this.recentCalls.filter((x) => t - x < windowMs);
      if (this.recentCalls.length < this.maxRps) {
        this.recentCalls.push(t);
        return;
      }
      await this.sleep(windowMs - (t - this.recentCalls[0]) + 5);
    }
  }

  private async call<T>(method: string, path: string, body?: unknown, correlationId?: string, expectJson = true): Promise<T> {
    const endpoint = `${method} ${path.replace(this.cfg.serviceAccountUserId, '{sa}').replace(/\/[0-9a-zA-Z_=-]{20,}(?=\/|$|\?)/g, '/{id}')}`;
    let lastError: GraphError | null = null;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      await this.throttle();
      const token = await this.getToken();
      const started = this.now();
      let res: Response;
      try {
        res = await this.fetchImpl(`${GRAPH}${path}`, {
          method,
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch (e) {
        lastError = new GraphError(`Network error: ${(e as Error).message}`, 0, 'network', null, endpoint);
        await this.opts.onCall?.({ endpoint, status: 0, durationMs: this.now() - started, requestId: null, attempt, error: lastError.message, correlationId });
        await this.sleep(this.backoffMs(attempt, null));
        continue;
      }
      const requestId = res.headers.get('request-id') ?? res.headers.get('client-request-id');
      const text = await res.text();
      await this.opts.onCall?.({ endpoint, status: res.status, durationMs: this.now() - started, requestId, attempt, correlationId, error: res.ok ? undefined : text.slice(0, 500) });

      if (res.ok) {
        if (!expectJson || res.status === 204 || text.length === 0) return undefined as T;
        return JSON.parse(text) as T;
      }

      let code: string | null = null;
      let message = text.slice(0, 500);
      try {
        const j = JSON.parse(text) as { error?: { code?: string; message?: string } };
        code = j.error?.code ?? null;
        message = j.error?.message ?? message;
      } catch {
        /* not json */
      }
      lastError = new GraphError(`Graph ${res.status} ${code ?? ''}: ${message}`.trim(), res.status, code, requestId, endpoint);

      if (res.status === 401 && attempt < this.maxAttempts) {
        this.token = null; // token revoked/expired early: refresh and retry once more
        continue;
      }
      if (res.status === 429 || res.status === 503 || res.status === 504) {
        const retryAfter = Number(res.headers.get('Retry-After'));
        await this.sleep(this.backoffMs(attempt, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : null));
        continue;
      }
      throw lastError;
    }
    throw lastError ?? new GraphError('Graph call failed', 0, null, null, endpoint);
  }

  private backoffMs(attempt: number, retryAfterMs: number | null): number {
    if (retryAfterMs !== null) return retryAfterMs;
    const base = Math.min(30_000, 500 * 2 ** (attempt - 1));
    return base / 2 + Math.random() * (base / 2); // jitter in [base/2, base)
  }

  // ---------------------------------------------------------------------------
  // API
  // ---------------------------------------------------------------------------
  async createCalendarEvent(input: CreateEventInput, correlationId?: string): Promise<CreatedEvent> {
    const res = await this.call<{ id: string; onlineMeeting?: { joinUrl?: string } }>(
      'POST',
      `/users/${this.cfg.serviceAccountUserId}/events`,
      {
        transactionId: input.transactionId,
        subject: input.subject,
        start: { dateTime: input.startLocal, timeZone: input.timeZone },
        end: { dateTime: input.endLocal, timeZone: input.timeZone },
        ...(input.joinUrl
          ? {
              body: { contentType: 'html', content: `<p>Join the class on Microsoft Teams:<br/><a href="${input.joinUrl}">${input.joinUrl}</a></p>` },
              location: { displayName: 'Microsoft Teams Meeting' },
            }
          : { isOnlineMeeting: true, onlineMeetingProvider: 'teamsForBusiness' }),
        attendees: input.attendeeUpns.map((address) => ({ emailAddress: { address }, type: 'required' })),
      },
      correlationId,
    );
    return { eventId: res.id, joinUrl: res.onlineMeeting?.joinUrl ?? null };
  }

  async createOnlineMeeting(input: CreateOnlineMeetingInput, correlationId?: string): Promise<CreatedOnlineMeeting> {
    const res = await this.call<{ id: string; joinUrl?: string; joinWebUrl?: string }>(
      'POST',
      `/users/${this.cfg.serviceAccountUserId}/onlineMeetings`,
      { subject: input.subject, startDateTime: input.startUtc, endDateTime: input.endUtc },
      correlationId,
    );
    const joinUrl = res.joinUrl ?? res.joinWebUrl;
    if (!joinUrl) throw new GraphError('onlineMeeting created without a joinUrl', 502, 'noJoinUrl', null, 'POST /users/{sa}/onlineMeetings');
    return { meetingId: res.id, joinUrl };
  }

  async findOnlineMeetingByJoinUrl(joinUrl: string, correlationId?: string): Promise<string | null> {
    const filter = encodeURIComponent(`JoinWebUrl eq '${joinUrl.replace(/'/g, "''")}'`);
    const res = await this.call<{ value: Array<{ id: string }> }>('GET', `/users/${this.cfg.serviceAccountUserId}/onlineMeetings?$filter=${filter}`, undefined, correlationId);
    return res.value?.[0]?.id ?? null;
  }

  async patchOnlineMeetingOptions(meetingId: string, o: MeetingOptions, correlationId?: string): Promise<void> {
    await this.call(
      'PATCH',
      `/users/${this.cfg.serviceAccountUserId}/onlineMeetings/${meetingId}`,
      {
        recordAutomatically: o.recordAutomatically,
        allowedPresenters: o.allowedPresenters,
        lobbyBypassSettings: { scope: o.lobbyBypassScope, isDialInBypassEnabled: o.isDialInBypassEnabled },
        allowAttendeeToEnableMic: o.allowAttendeeToEnableMic,
        allowAttendeeToEnableCamera: o.allowAttendeeToEnableCamera,
        participants: {
          attendees: o.coorganizers.map((c) => ({
            upn: c.upn,
            role: 'coorganizer',
            ...(c.userId ? { identity: { user: { id: c.userId } } } : {}),
          })),
        },
      },
      correlationId,
      false,
    );
  }

  async deleteEvent(eventId: string, correlationId?: string): Promise<void> {
    try {
      await this.call('DELETE', `/users/${this.cfg.serviceAccountUserId}/events/${eventId}`, undefined, correlationId, false);
    } catch (e) {
      if (e instanceof GraphError && e.status === 404) return; // already gone: fine
      throw e;
    }
  }

  async patchEventTimes(eventId: string, startLocal: string, endLocal: string, timeZone: string, correlationId?: string): Promise<void> {
    await this.call('PATCH', `/users/${this.cfg.serviceAccountUserId}/events/${eventId}`, { start: { dateTime: startLocal, timeZone }, end: { dateTime: endLocal, timeZone } }, correlationId);
  }

  async resolveUserId(upn: string, correlationId?: string): Promise<string | null> {
    try {
      const res = await this.call<{ id: string }>('GET', `/users/${encodeURIComponent(upn)}?$select=id`, undefined, correlationId);
      return res.id ?? null;
    } catch (e) {
      if (e instanceof GraphError && e.status === 404) return null;
      throw e;
    }
  }

  async listMeetingRecordings(meetingId: string, correlationId?: string): Promise<GraphRecording[]> {
    const res = await this.call<{ value: Array<{ id: string; createdDateTime: string; recordingContentUrl?: string }> }>(
      'GET',
      `/users/${this.cfg.serviceAccountUserId}/onlineMeetings/${meetingId}/recordings`,
      undefined,
      correlationId,
    );
    return (res.value ?? []).map((r) => ({
      id: r.id,
      createdDateTime: r.createdDateTime,
      contentUrl: r.recordingContentUrl ?? null,
      driveId: null,
      driveItemId: null,
      durationSeconds: null,
      sizeBytes: null,
    }));
  }

  async listRecordingsFolder(correlationId?: string): Promise<DriveItem[]> {
    const res = await this.call<{
      value: Array<{ id: string; name: string; createdDateTime: string; size?: number; parentReference?: { driveId?: string }; video?: { duration?: number }; file?: unknown }>;
    }>('GET', `/users/${this.cfg.serviceAccountUserId}/drive/root:/Recordings:/children?$select=id,name,createdDateTime,size,parentReference,video,file&$top=200`, undefined, correlationId);
    return (res.value ?? [])
      .filter((i) => i.file)
      .map((i) => ({
        driveId: i.parentReference?.driveId ?? '',
        itemId: i.id,
        name: i.name,
        createdDateTime: i.createdDateTime,
        sizeBytes: i.size ?? null,
        durationSeconds: i.video?.duration ? Math.round(i.video.duration / 1000) : null,
      }));
  }

  async getDownloadUrl(driveId: string, itemId: string, correlationId?: string): Promise<string> {
    const res = await this.call<Record<string, unknown>>('GET', `/drives/${driveId}/items/${itemId}?$select=id,@microsoft.graph.downloadUrl`, undefined, correlationId);
    const url = res['@microsoft.graph.downloadUrl'];
    if (typeof url !== 'string') throw new GraphError('downloadUrl missing on drive item', 502, 'noDownloadUrl', null, 'GET /drives/{id}/items/{id}');
    return url;
  }
}
