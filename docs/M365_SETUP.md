# Microsoft 365 setup checklist (done by SSU IT, not by code)

The portal cannot create Teams meetings until every item below is confirmed. Tick them in order.

- [ ] **Entra app registration** (single tenant). Record: tenant id, client id, a client secret (store in Supabase Edge Function secrets, never in the repo).
- [ ] **Application permissions** (not delegated), admin-consented:
  - [ ] `Calendars.ReadWrite`
  - [ ] `OnlineMeetings.ReadWrite.All`
  - [ ] `OnlineMeetingRecording.Read.All`
  - [ ] `Files.Read.All`
  - [ ] `User.Read.All`
- [ ] **Application access policy** (Teams PowerShell, as a Teams admin):
  ```powershell
  Connect-MicrosoftTeams
  New-CsApplicationAccessPolicy -Identity "SSU-ODL-Portal" -AppIds "<client id>" -Description "ODL portal meeting automation"
  Grant-CsApplicationAccessPolicy -PolicyName "SSU-ODL-Portal" -Identity "classes@<tenant>"
  ```
  Without this, every app-only `onlineMeetings` call returns **403**. Allow up to 30 min to propagate.
- [ ] **Service account** `classes@…`: licensed for Teams + OneDrive; record its Entra **object id** (`MS_SERVICE_ACCOUNT_USER_ID`) and UPN.
- [ ] **Teams meeting policy** assigned to the service account:
  - [ ] Anonymous users can join a meeting: **On**
  - [ ] Anonymous users and dial-in callers can start a meeting: **On**
  - [ ] Cloud recording: **On**
- [ ] **Recording expiry**: `Set-CsTeamsMeetingPolicy -Identity <policy> -NewMeetingRecordingExpirationDays 35`
- [ ] **Teachers** are licensed Entra ID users in the same tenant (co-organiser assignment fails otherwise).
- [ ] **Test accounts**: one test teacher mailbox for the Phase 6 spike (real faculty receive real invites).
- [ ] Set Edge Function secrets:
  ```bash
  supabase secrets set MS_TENANT_ID=… MS_CLIENT_ID=… MS_CLIENT_SECRET=… MS_SERVICE_ACCOUNT_USER_ID=… MS_SERVICE_ACCOUNT_UPN=… GRAPH_MODE=real
  ```
- [ ] Run `npm run graph:spike` from a machine with `.env.local` filled in; confirm all three steps pass.
- [ ] Before launch: join a provisioned meeting from a personal Google account outside the tenant and confirm no lobby.
