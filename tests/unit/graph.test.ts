import { describe, expect, it } from 'vitest';
import { createGraphClient, GraphError, hasRealGraphCredentials, MockGraphClient, RealGraphClient, type GraphCallLog } from '@shared/graph/index.ts';
import { meetingOptions, runProvisionSequence } from '@shared/graph/sequence.ts';

const cfg = { tenantId: 't', clientId: 'c', clientSecret: 's', serviceAccountUserId: 'sa-object-id', serviceAccountUpn: 'classes@x.onmicrosoft.com' };

function fakeFetch(handler: (url: string, init: RequestInit, n: number) => Response | Promise<Response>) {
  let n = 0;
  const seen: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    n++;
    seen.push({ url: String(url), init: init ?? {} });
    return handler(String(url), init ?? {}, n);
  }) as unknown as typeof fetch;
  return { fetch: f, seen };
}
const tokenResponse = () => new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 });
const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'request-id': 'rid-1', ...headers } });

describe('createGraphClient / env', () => {
  it('detects placeholder credentials and falls back to the mock unless GRAPH_MODE=real', () => {
    expect(hasRealGraphCredentials({ MS_TENANT_ID: 'REPLACE_ME' })).toBe(false);
    expect(hasRealGraphCredentials({ MS_TENANT_ID: 't', MS_CLIENT_ID: 'c', MS_CLIENT_SECRET: 's', MS_SERVICE_ACCOUNT_USER_ID: 'u', MS_SERVICE_ACCOUNT_UPN: 'a@b' })).toBe(true);
    expect(createGraphClient({ GRAPH_MODE: 'mock' }).mode).toBe('mock');
    expect(createGraphClient({}).mode).toBe('mock');
    expect(() => createGraphClient({ GRAPH_MODE: 'real' })).toThrow(/credentials are missing/);
    expect(() => createGraphClient({ GRAPH_MODE: 'weird' })).toThrow(/Unknown GRAPH_MODE/);
  });
});

describe('RealGraphClient', () => {
  it('caches the token and sends the §7.2 step-1 body', async () => {
    const { fetch, seen } = fakeFetch((url) => {
      if (url.includes('/oauth2/v2.0/token')) return tokenResponse();
      return jsonResponse({ id: 'evt-1', onlineMeeting: { joinUrl: 'https://teams.microsoft.com/l/x' } }, 201);
    });
    const logs: GraphCallLog[] = [];
    const g = new RealGraphClient(cfg, { fetchImpl: fetch, onCall: (l) => void logs.push(l), sleep: async () => {} });
    const r1 = await g.createCalendarEvent({ transactionId: 's1', subject: 'X', startLocal: '2026-01-12T10:00:00', endLocal: '2026-01-12T11:00:00', timeZone: 'India Standard Time', attendeeUpns: ['t@x'] }, 's1');
    const r2 = await g.createCalendarEvent({ transactionId: 's2', subject: 'Y', startLocal: '2026-01-12T10:00:00', endLocal: '2026-01-12T11:00:00', timeZone: 'India Standard Time', attendeeUpns: ['t@x'] }, 's2');
    expect(r1).toEqual({ eventId: 'evt-1', joinUrl: 'https://teams.microsoft.com/l/x' });
    expect(r2.eventId).toBe('evt-1');
    expect(seen.filter((s) => s.url.includes('/token'))).toHaveLength(1); // cached
    const body = JSON.parse(String(seen[1].init.body));
    expect(body).toMatchObject({ transactionId: 's1', isOnlineMeeting: true, onlineMeetingProvider: 'teamsForBusiness', start: { dateTime: '2026-01-12T10:00:00', timeZone: 'India Standard Time' } });
    expect(body.attendees).toEqual([{ emailAddress: { address: 't@x' }, type: 'required' }]);
    expect(seen[1].url).toBe('https://graph.microsoft.com/v1.0/users/sa-object-id/events');
    expect((seen[1].init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    // logged with normalised endpoint and correlation id
    expect(logs.find((l) => l.endpoint === 'POST /users/{sa}/events')).toMatchObject({ status: 201, requestId: 'rid-1', correlationId: 's1' });
  });

  it('honours Retry-After on 429 and gives up after maxAttempts', async () => {
    const sleeps: number[] = [];
    const { fetch } = fakeFetch((url, _init, n) => {
      if (url.includes('/token')) return tokenResponse();
      if (n <= 3) return jsonResponse({ error: { code: 'TooManyRequests', message: 'slow down' } }, 429, { 'Retry-After': '2' });
      return jsonResponse({ value: [{ id: 'm-1' }] });
    });
    const g = new RealGraphClient({ ...cfg, maxAttempts: 5 }, { fetchImpl: fetch, sleep: async (ms) => void sleeps.push(ms) });
    expect(await g.findOnlineMeetingByJoinUrl('https://teams.microsoft.com/l/x')).toBe('m-1');
    expect(sleeps.filter((s) => s === 2000)).toHaveLength(2);

    const { fetch: always429 } = fakeFetch((url) => (url.includes('/token') ? tokenResponse() : jsonResponse({ error: { code: 'TooManyRequests' } }, 429)));
    const g2 = new RealGraphClient({ ...cfg, maxAttempts: 3 }, { fetchImpl: always429, sleep: async () => {} });
    await expect(g2.findOnlineMeetingByJoinUrl('u')).rejects.toMatchObject({ status: 429, code: 'TooManyRequests' });
  });

  it('does not retry permanent 4xx errors and surfaces the Graph error code', async () => {
    let calls = 0;
    const { fetch } = fakeFetch((url) => {
      if (url.includes('/token')) return tokenResponse();
      calls++;
      return jsonResponse({ error: { code: 'Forbidden', message: 'Application access policy' } }, 403);
    });
    const g = new RealGraphClient(cfg, { fetchImpl: fetch, sleep: async () => {} });
    await expect(g.createCalendarEvent({ transactionId: 's', subject: 'X', startLocal: 'a', endLocal: 'b', timeZone: 'UTC', attendeeUpns: [] })).rejects.toSatisfy(
      (e: unknown) => e instanceof GraphError && e.status === 403 && e.isPermanent && /Application access policy/.test(e.message),
    );
    expect(calls).toBe(1);
  });

  it('throttles to N requests per second', async () => {
    let t = 0;
    const sleeps: number[] = [];
    const { fetch } = fakeFetch((url) => (url.includes('/token') ? tokenResponse() : jsonResponse({ value: [] })));
    const g = new RealGraphClient({ ...cfg, maxRequestsPerSecond: 2 }, { fetchImpl: fetch, now: () => t, sleep: async (ms) => void (sleeps.push(ms), (t += ms)) });
    await g.findOnlineMeetingByJoinUrl('a');
    await g.findOnlineMeetingByJoinUrl('b');
    await g.findOnlineMeetingByJoinUrl('c'); // third within the same second must wait
    expect(sleeps.length).toBeGreaterThan(0);
    expect(sleeps[0]).toBeGreaterThan(900);
  });

  it('treats 404 on delete as success and reads the download URL property', async () => {
    const { fetch } = fakeFetch((url, init) => {
      if (url.includes('/token')) return tokenResponse();
      if (init.method === 'DELETE') return jsonResponse({ error: { code: 'ErrorItemNotFound' } }, 404);
      return jsonResponse({ id: 'i', '@microsoft.graph.downloadUrl': 'https://x.sharepoint.com/dl?tempauth=1' });
    });
    const g = new RealGraphClient(cfg, { fetchImpl: fetch, sleep: async () => {} });
    await expect(g.deleteEvent('evt')).resolves.toBeUndefined();
    expect(await g.getDownloadUrl('d', 'i')).toContain('tempauth');
  });
});

describe('runProvisionSequence (mock)', () => {
  it('runs steps 1→3 and applies the hardened meeting options with the teacher as co-organiser', async () => {
    const g = new MockGraphClient();
    g.users.set('teacher@x.onmicrosoft.com', 'teacher-oid');
    const out = await runProvisionSequence(g, {
      sessionId: 'sess-1',
      subject: 'Financial Management — BBA-ODL-2025',
      startLocal: '2026-01-12T10:00:00',
      endLocal: '2026-01-12T11:00:00',
      startUtc: '2026-01-12T04:30:00.000Z',
      endUtc: '2026-01-12T05:30:00.000Z',
      timeZone: 'Asia/Kolkata',
      teacherUpn: 'teacher@x.onmicrosoft.com',
      teacherUserId: null,
      recordAutomatically: true,
    });
    expect(out.joinUrl).toMatch(/^https:\/\/teams\.microsoft\.com\//);
    expect(out.autoRecording).toBe(true);
    expect(out.teacherUserId).toBe('teacher-oid');
    const m = g.meetings.get(out.meetingId)!;
    expect(m.options).toEqual(meetingOptions({ teacherUpn: 'teacher@x.onmicrosoft.com', teacherUserId: 'teacher-oid', recordAutomatically: true }));
    expect(m.options?.allowedPresenters).toBe('roleIsPresenter');
    expect(m.options?.lobbyBypassScope).toBe('everyone');
    expect(g.events.get(out.eventId)?.timeZone).toBe('India Standard Time');
    expect(g.calls.map((c) => c.endpoint)).toEqual(['GET /users/{id}', 'POST /users/{sa}/events', 'GET /users/{sa}/onlineMeetings?$filter=JoinWebUrl', 'PATCH /users/{sa}/onlineMeetings/{id}']);
  });

  it('is idempotent on transactionId (a retried step 1 returns the same event)', async () => {
    const g = new MockGraphClient();
    const a = await g.createCalendarEvent({ transactionId: 'same', subject: 'a', startLocal: 's', endLocal: 'e', timeZone: 'UTC', attendeeUpns: [] });
    const b = await g.createCalendarEvent({ transactionId: 'same', subject: 'a', startLocal: 's', endLocal: 'e', timeZone: 'UTC', attendeeUpns: [] });
    expect(a.eventId).toBe(b.eventId);
  });

  it('falls back to manual recording when recordAutomatically is rejected, keeping the other options', async () => {
    const g = new MockGraphClient();
    g.failure = 'record-automatically-400';
    const out = await runProvisionSequence(g, {
      sessionId: 's',
      subject: 'x',
      startLocal: 'a',
      endLocal: 'b',
      startUtc: '2026-01-12T04:30:00.000Z',
      endUtc: '2026-01-12T05:30:00.000Z',
      timeZone: 'Asia/Kolkata',
      teacherUpn: 't@x',
      teacherUserId: 'oid',
      recordAutomatically: true,
    });
    expect(out.autoRecording).toBe(false);
    expect(out.recordAutomaticallyError).toMatch(/recordAutomatically/);
    expect(g.meetings.get(out.meetingId)?.options?.recordAutomatically).toBe(false);
    expect(g.meetings.get(out.meetingId)?.options?.allowedPresenters).toBe('roleIsPresenter');
  });

  it('falls back to meeting-first when Exchange attaches no Teams link to the event', async () => {
    const g = new MockGraphClient();
    g.failure = 'no-calendar-join-url';
    g.users.set('t@x', 'oid');
    const out = await runProvisionSequence(g, {
      sessionId: 's',
      subject: 'Subject — BATCH',
      startLocal: '2026-01-12T10:00:00',
      endLocal: '2026-01-12T11:00:00',
      startUtc: '2026-01-12T04:30:00.000Z',
      endUtc: '2026-01-12T05:30:00.000Z',
      timeZone: 'Asia/Kolkata',
      teacherUpn: 't@x',
      teacherUserId: 'oid',
      recordAutomatically: true,
    });
    expect(out.path).toBe('meeting-first');
    expect(out.joinUrl).toMatch(/^https:\/\/teams\.microsoft\.com\//);
    expect(out.autoRecording).toBe(true);
    // the meeting carries the hardened options, and the surviving event advertises the same link
    expect(g.meetings.get(out.meetingId)?.options?.coorganizers).toEqual([{ upn: 't@x', userId: 'oid' }]);
    const live = [...g.events.values()].filter((e) => !e.deleted);
    expect(live).toHaveLength(1);
    expect(live[0].id).toBe(out.eventId);
    expect(live[0].joinUrl).toBe(out.joinUrl);
    expect(live[0].attendees).toEqual(['t@x']);
    // the first, link-less event was cleaned up
    expect([...g.events.values()].filter((e) => e.deleted)).toHaveLength(1);
  });

  it('deletes a half-provisioned event when a later step fails', async () => {
    const g = new MockGraphClient();
    // step 3 fails with a transient error, which must not be swallowed by the recording fallback
    g.patchOnlineMeetingOptions = async () => {
      throw new GraphError('Graph 500 InternalServerError', 500, 'InternalServerError', null, 'PATCH /users/{sa}/onlineMeetings/{id}');
    };
    await expect(
      runProvisionSequence(g, {
        sessionId: 's',
        subject: 'x',
        startLocal: 'a',
        endLocal: 'b',
        startUtc: '2026-01-12T04:30:00.000Z',
        endUtc: '2026-01-12T05:30:00.000Z',
        timeZone: 'Asia/Kolkata',
        teacherUpn: 't@x',
        teacherUserId: 'oid',
        recordAutomatically: true,
      }),
    ).rejects.toMatchObject({ status: 500 });
    expect([...g.events.values()].every((e) => e.deleted)).toBe(true);
  });

  it('propagates the 403 access-policy failure untouched', async () => {
    const g = new MockGraphClient();
    g.failure = 'access-policy-403';
    await expect(
      runProvisionSequence(g, { sessionId: 's', subject: 'x', startLocal: 'a', endLocal: 'b', startUtc: '2026-01-12T04:30:00.000Z', endUtc: '2026-01-12T05:30:00.000Z', timeZone: 'Asia/Kolkata', teacherUpn: 't@x', teacherUserId: 'oid', recordAutomatically: true }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
