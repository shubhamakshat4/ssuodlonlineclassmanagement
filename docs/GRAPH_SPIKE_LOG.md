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

# Graph spike — 2026-09-23T05:07:02.935Z

Teacher/attendee: odl.testteacher@srisriuniversity.edu.in
Window: 2026-09-23T11:37:02 → 2026-09-23T12:07:02 IST

## FAILED
- endpoint: POST /users/{sa}/events
- status: 502 code: noJoinUrl request-id: -
- message: Event created without an onlineMeeting.joinUrl — is Teams enabled for the service account?

**VERDICT: RED — do not build on §7.2 until this passes. Fallback (§7.4) is implemented; record the failure in docs/BLOCKERS.md.**

## Calls
- POST /oauth2/v2.0/token → 200 (1504 ms, attempt 1, request-id -)
- GET /users/odl.testteacher%40srisriuniversity.edu.in?$select=id → 200 (504 ms, attempt 1, request-id ae489d2e-2504-4ee8-b236-ad4bd6db00f6)
- POST /users/{sa}/events → 201 (731 ms, attempt 1, request-id 16e67dfa-90e5-4703-afb5-87b93cefb925)

---

# Graph spike — 2026-09-23T05:14:06.472Z

Teacher/attendee: odl.testteacher@srisriuniversity.edu.in
Window: 2026-09-23T11:44:06 → 2026-09-23T12:14:06 IST

## Result
- Path: meeting-first (Exchange did not attach a Teams link to the calendar event; created the meeting first and put its link in the invite)
- Step 1 calendar event: OK — eventId=AAMkAGRkMjA5ZmZjLTI1ZGMtNDY5MC04YjdiLTFjZDRiYzQxNmU1YQBGAAAAAACThFKDc8tWTqQRqEH7p5K1BwCv5mva1unFSqouh3PytgQQAAAAAAENAACv5mva1unFSqouh3PytgQQAAAAP7MOAAA=
- joinUrl: https://teams.microsoft.com/l/meetup-join/19%3ameeting_NmM5MDY0OWItMTQzMC00ZDA4LWJlN2MtMThlMWM3MTBmYjU4%40thread.v2/0?context=%7b%22Tid%22%3a%22bbc4292d-ab9a-4d9d-a1e0-8b6f77f87be0%22%2c%22Oid%22%3a%220fb39d14-0be3-4970-8ca6-3960552a97ba%22%7d
- Step 2 resolve onlineMeeting: OK — meetingId=MSowZmIzOWQxNC0wYmUzLTQ5NzAtOGNhNi0zOTYwNTUyYTk3YmEqMCoqMTk6bWVldGluZ19ObU01TURZME9XSXRNVFF6TUMwMFpEQTRMV0psTjJNdE1UaGxNV00zTVRCbVlqVTRAdGhyZWFkLnYy
- Step 3 meeting options: OK with recordAutomatically=true
- Teacher object id: 68684ca1-c6af-4b52-b94b-83d74d93baaa

**VERDICT: GREEN — design assumption holds on this tenant.**
- Cleanup: deleted event AAMkAGRkMjA5ZmZjLTI1ZGMtNDY5MC04YjdiLTFjZDRiYzQxNmU1YQBGAAAAAACThFKDc8tWTqQRqEH7p5K1BwCv5mva1unFSqouh3PytgQQAAAAAAENAACv5mva1unFSqouh3PytgQQAAAAP7MOAAA=

## Calls
- POST /oauth2/v2.0/token → 200 (661 ms, attempt 1, request-id -)
- GET /users/odl.testteacher%40srisriuniversity.edu.in?$select=id → 200 (463 ms, attempt 1, request-id 6165e0f2-1707-4b4d-8e72-d828a8597ec0)
- POST /users/{sa}/events → 201 (465 ms, attempt 1, request-id 39e5bbab-4ea4-4d9e-8d5f-9bf719793506)
- DELETE /users/{sa}/events/{id} → 204 (411 ms, attempt 1, request-id a63cf1b1-c370-4da5-8cb6-05551511fbc6)
- POST /users/{sa}/onlineMeetings → 201 (2113 ms, attempt 1, request-id 9706a201-f047-41c1-859e-2a5091dadd14)
- POST /users/{sa}/events → 201 (494 ms, attempt 1, request-id cb773a06-400b-4e4d-82ff-3256dfd8d392)
- PATCH /users/{sa}/onlineMeetings/{id} → 200 (1395 ms, attempt 1, request-id 932a53a4-fb67-40da-b860-b82dd20f77ee)
- DELETE /users/{sa}/events/{id} → 204 (358 ms, attempt 1, request-id f7164f7e-2842-4059-93b6-ea13c379f365)

---

