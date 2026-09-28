# Faculty Microsoft 365 accounts still needed

Regenerate this list any time with `npm run faculty:microsoft -- --pending`.
Check any address IT sends with `npm run graph:check-users -- <address> …` before using it.

## What we need, and why

Each online class is created as a Microsoft Teams meeting by the ODL service account. For the teacher
to be able to admit students, start the recording and manage the meeting, they must be named on it as
**co-organiser** — and Teams only accepts a co-organiser who is **a licensed user inside the
`srisriuniversity.edu.in` tenant**. A personal Gmail address cannot be used, however it is licensed
elsewhere.

So for each faculty member below we need: **a Microsoft 365 account in the university tenant, enabled,
with a Teams licence** — and the sign-in address (UPN) of that account.

## Already done — no action needed

| Employee code | Name | Address |
|---|---|---|
| F016 | Mr. Harshvardhan Pandey | harshvardhan.p@srisriuniversity.edu.in |
| F017 | Mr. Rushikesh Dattatray Joshi | rushikesh.j@srisriuniversity.edu.in |
| F018 | Mr. Sankar Maharana | sankar.m@srisriuniversity.edu.in |

## Urgent — an address was supplied, but it is a personal Gmail

These three were given as `sasmita.dancer@gmail.com`, `guruashisdas@gmail.com` and
`shivangimitra123@gmail.com`. The tenant has no account for any of them, so they cannot be
co-organisers. **They need university accounts creating.** Between them they carry the whole Odissi
dance programme.

| Code | Name | Upcoming classes | Class groups |
|---|---|---|---|
| F015 | Guru Ashis Kumar Das | 23 | MOD-S1, MOD-S2, MOD-S3, MOD-S4 |
| F020 | Ms. Sasmita Panda | 22 | MOD-S1, MOD-S2, MOD-S3, MOD-S4 |
| F021 | Ms. Shivangi Mitra | 8 | MHS-S2, MOD-S2 |

## Still to be supplied — 15 faculty

Ordered by how many classes each one is holding up.

| Code | Name | Upcoming classes | Class groups |
|---|---|---|---|
| F006 | Dr. Jharana Rani Tripathy, Asst. Prof. | 32 | MHS-S1, MHS-S2, MHS-S3, MHS-S4 |
| F008 | Dr. Praag Bhardwaj, Asst. Prof. | 28 | MAY-S1, MAY-S2, MAY-S3, MAY-S4, MHS-S3, MOD-S3 |
| F009 | Dr. Pritidhara Hota, Asst. Prof. | 27 | BBA-S1, BBA-S2, BBA-S3, BBA-S4, BCOM-S1, MBA-S1 |
| F019 | Mr. Sunil Kumar Mishra, Asst. Prof. (Visiting) | 24 | BBA-S1, BBA-S2, BBA-S3, BBA-S4, BCOM-S1 |
| F007 | Dr. Jyoti Sharma, Asst. Prof. | 20 | MAY-S1, MAY-S2, MAY-S3, MAY-S4 |
| F013 | Dr. Sabnoor Khatoon, Asst. Prof. | 15 | BBA-S2, BBA-S3, BBA-S4, BCOM-S1, MBA-S1 |
| F005 | Dr. Gayatri Rath, Asst. Prof. | 12 | MHS-S1, MHS-S2, MHS-S3, MOD-S1 |
| F011 | Dr. Ravish Mathew, Asst. Prof. | 12 | BBA-S1, BBA-S3, BBA-S4, BCOM-S1 |
| F003 | Dr. Bhagirathi Nayak, Prof. | 10 | BBA-S4, MBA-S1, MOD-S4 |
| F014 | Dr. Shweta Saival Samanta Sahoo, Asst. Prof. | 10 | BBA-S1, BCOM-S1, MBA-S1 |
| F004 | Dr. Gagana D P, Tutor (BNYS) | 8 | MAY-S1, MAY-S2, MAY-S4 |
| F010 | Dr. Rajat Kumar Balaiar Singh, Asst. Prof. | 6 | MBA-S1 |
| F012 | Dr. Richa Baghel, Asst. Prof. | 3 | MHS-S3 |
| F002 | Dr. B. Maithili Dutta Pradhan, Asst. Prof. | 2 | MAY-S2 |
| F001 | Dr. Aradhana Panagrahi, Asst. Prof. | 1 | MHS-S4 |

**18 faculty, covering 263 of the 277 remaining classes this term.**

## What to send back

Just the name and the account's sign-in address, one per line, as IT did last time:

    Dr. Jharana Rani Tripathy    jharana.t@srisriuniversity.edu.in

## What happens then

1. Check the addresses: `npm run graph:check-users -- <address> …`
2. Add the verified ones to `MAPPING` in `scripts/update-faculty-microsoft.ts`
3. `npm run faculty:microsoft -- --apply --recreate`

That sets each teacher's sign-in address and their co-organiser UPN, and rebuilds their upcoming Teams
meetings so the co-organiser takes effect. Rebuilding issues a new join link — students read the link
from the portal, so that is safe, but a link somebody copied out by hand will stop working.

## Not faculty

Mr. SK Abdul Wasim (Assistant Section Officer, abdul.w@…) and Ms. Arpita Bose (Admin Executive,
arpita.b@…) both have valid, licensed accounts, but they are office staff rather than teaching staff and
have no portal account yet. If they need one it should be an ODL office **administrator** account, not a
faculty one.
