**Subject:** ODL Online Classes portal — setup needed in Microsoft 365 and Google (step-by-step)

Dear IT team,

We are launching an online-class portal for the ODL programme. It will create Microsoft Teams meetings for every class automatically and let students sign in with their university Google account. For this to work we need a few one-time settings from you. Please follow the steps below exactly, in order, and send back the items listed in **Part 4**.

Nothing here changes existing users or mailboxes. Steps 1–3 need a Microsoft 365 **Global Administrator** (or Application Administrator + Teams Administrator). Step 4 needs a **Google Workspace administrator**.

---

### PART 1 — Register the portal as an application in Microsoft Entra (10 minutes)

1. Open **https://entra.microsoft.com** and sign in as an administrator.
2. On the left, click **Applications → App registrations → + New registration**.
3. Fill in:
   - Name: **SSU ODL Portal**
   - Supported account types: **Accounts in this organizational directory only** (single tenant)
   - Redirect URI: leave empty
   Click **Register**.
4. On the page that opens, copy these two values into a notepad — we need both:
   - **Application (client) ID**
   - **Directory (tenant) ID**
5. Click **Certificates & secrets → + New client secret**. Description: *ODL portal*. Expiry: **24 months**. Click **Add**.
   Copy the **Value** column immediately (it is shown only once). This is the **client secret**.
6. Click **API permissions → + Add a permission → Microsoft Graph → Application permissions** (NOT "Delegated"). Tick these five, one by one, then click **Add permissions**:
   - `Calendars.ReadWrite`
   - `OnlineMeetings.ReadWrite.All`
   - `OnlineMeetingRecording.Read.All`
   - `Files.Read.All`
   - `User.Read.All`
7. Still on API permissions, click **Grant admin consent for <organisation>** and confirm **Yes**. Every row should now show a green tick under "Status".

### PART 2 — The service account that will own all class meetings (10 minutes)

8. Create a new user in Microsoft 365 admin centre (**https://admin.microsoft.com → Users → Active users → Add a user**):
   - Name: **ODL Classes**
   - Username: **classes@srisriuniversity.edu.in** (or the domain you use for Teams)
   - Assign a licence that includes **Microsoft Teams** and **OneDrive** (e.g. Office 365 A1/A3/E3).
   Write down the password and keep it in the university password manager (we will not need it, but someone must own it).
9. Open **https://entra.microsoft.com → Users**, click the new user **ODL Classes**, and copy its **Object ID**.
10. Meeting policy for this account. Open **https://admin.teams.microsoft.com → Meetings → Meeting policies**:
    - Click **+ Add**, name it **ODL-Classes-Policy** and set:
      - *Anonymous users can join a meeting*: **On**
      - *Anonymous users and dial-in callers can start a meeting*: **On**
      - *Meeting recording* (cloud recording): **On**
      - *Who can present*: **Only organizers and co-organizers**
    - Save. Then go to **Users → Manage users**, open **ODL Classes → Policies → Edit**, set *Meeting policy* = **ODL-Classes-Policy**, Apply.
11. Recording retention — run this in **PowerShell as administrator** (install the module first if needed: `Install-Module MicrosoftTeams`):
    ```powershell
    Connect-MicrosoftTeams
    Set-CsTeamsMeetingPolicy -Identity "ODL-Classes-Policy" -NewMeetingRecordingExpirationDays 35
    ```

### PART 3 — Allow the application to create meetings for the service account (5 minutes, most important)

12. In the same PowerShell window, run the two commands below. Replace `<client id>` with the **Application (client) ID** from step 4.
    ```powershell
    New-CsApplicationAccessPolicy -Identity "SSU-ODL-Portal" -AppIds "<client id>" -Description "ODL portal meeting automation"
    Grant-CsApplicationAccessPolicy -PolicyName "SSU-ODL-Portal" -Identity "classes@srisriuniversity.edu.in"
    ```
    If the second command says the user is not found, wait 30 minutes after creating the user and try again.
13. **Test teacher account** — please also create one ordinary user called **ODL Test Teacher** (e.g. `odl.testteacher@srisriuniversity.edu.in`) with a Teams licence. We will send test meeting invites to this mailbox instead of real faculty. Tell us its address.
14. Faculty accounts — every teacher who will take online classes must have a Microsoft 365 account with a Teams licence in this same organisation. Please send us the list of their sign-in addresses (e.g. `name@srisriuniversity.edu.in`) or confirm they all exist.

### PART 4 — Google sign-in for students (10 minutes, Google Workspace admin)

15. Open **https://console.cloud.google.com** with a university Google admin account. Create a project called **SSU ODL Portal** (top bar → project selector → New project).
16. Left menu → **APIs & Services → OAuth consent screen**. User type: **Internal**. App name: *SSU ODL Classes*. Support email: the ODL office email. Save.
17. **APIs & Services → Credentials → + Create credentials → OAuth client ID**:
    - Application type: **Web application**
    - Name: *SSU ODL Portal*
    - Authorised redirect URI: **https://acflzvfiochinjuprrew.supabase.co/auth/v1/callback**
    Click **Create** and copy the **Client ID** and **Client secret**.

### PART 5 — What to send back to us

Please send these to <ODL project contact> **using the password manager or a secure share link — not in a plain email**:

| # | Item | From step |
|---|---|---|
| 1 | Directory (tenant) ID | 4 |
| 2 | Application (client) ID | 4 |
| 3 | Client secret value | 5 |
| 4 | Confirmation that admin consent was granted (screenshot of green ticks) | 7 |
| 5 | Service account sign-in address | 8 |
| 6 | Service account Object ID | 9 |
| 7 | Confirmation that the meeting policy and 35-day recording expiry were applied | 10–11 |
| 8 | Confirmation that both PowerShell commands in step 12 completed without error (copy of the output) | 12 |
| 9 | Test teacher account address | 13 |
| 10 | List of faculty Microsoft sign-in addresses | 14 |
| 11 | Google OAuth Client ID and Client secret | 17 |

Once we have these, we will run a 10-minute test that creates one dummy meeting on the service account calendar and deletes it again. We will let you know the result the same day.

Thank you,
<name>
ODL Online Classes project
