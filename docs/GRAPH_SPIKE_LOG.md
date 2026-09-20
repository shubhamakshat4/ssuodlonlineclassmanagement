# Graph spike — 2026-09-20T11:11:39.150Z

> **NOT RUN AGAINST THE REAL TENANT.** GRAPH_MODE=(unset); credentials missing.
> Running the same sequence against the mock so the code path is exercised. Set GRAPH_MODE=real and the MS_* values in .env.local to run for real.

Teacher/attendee: classes@example.onmicrosoft.com
Window: 2026-09-20T17:41:39 → 2026-09-20T18:11:39 IST

## Result
- Step 1 create calendar event: OK — eventId=mock-event-2
- joinUrl: https://teams.microsoft.com/l/meetup-join/mock/2
- Step 2 resolve onlineMeeting: OK — meetingId=mock-meeting-2
- Step 3 meeting options: OK with recordAutomatically=true
- Teacher object id: 00000000-0000-4000-8000-00000000c0de

**VERDICT: MOCK ONLY — no conclusion about the real tenant.**
- Cleanup: deleted event mock-event-2

## Calls
- GET /users/{id} → 200 (1 ms, attempt 1, request-id mock-req-1)
- POST /users/{sa}/events → 201 (1 ms, attempt 1, request-id mock-req-3)
- GET /users/{sa}/onlineMeetings?$filter=JoinWebUrl → 200 (1 ms, attempt 1, request-id mock-req-4)
- PATCH /users/{sa}/onlineMeetings/{id} → 200 (1 ms, attempt 1, request-id mock-req-5)
- DELETE /users/{sa}/events/{id} → 204 (1 ms, attempt 1, request-id mock-req-6)

---

