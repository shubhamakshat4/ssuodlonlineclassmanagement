# Faculty Microsoft 365 accounts — what is still outstanding

Regenerate with `npm run faculty:microsoft -- --pending` (reads the live data, so it never goes stale).
Check any address IT sends with `npm run graph:check-users -- <address> …` before using it.

**Status at 5 Oct 2026: 17 of 21 faculty have a verified university account. Four do not.**

## Still needed — 4 faculty, 72 of the 259 remaining classes

| Code | Name | Upcoming classes | Class groups | Note |
|---|---|---|---|---|
| F019 | Mr. Sunil Kumar Mishra, Asst. Prof. (Visiting) | 23 | BBA-S1 → S4, BCOM-S1 | no address supplied yet |
| F015 | Guru Ashis Kumar Das | 21 | MOD-S1 → S4 | given as `guruashisdas@gmail.com` |
| F020 | Ms. Sasmita Panda | 21 | MOD-S1 → S4 | given as `sasmita.dancer@gmail.com` |
| F021 | Ms. Shivangi Mitra, Visiting Faculty | 7 | MHS-S2, MOD-S2 | given as `shivangimitra123@gmail.com` |

Three of those four already have an address on file, but it is a **personal Gmail address**, and the
tenant has no account for any of them. A Teams meeting only accepts a co-organiser who is a licensed
user **inside the `srisriuniversity.edu.in` tenant**, so those accounts have to be created. Between
them, F015, F020 and F021 carry the entire Odissi dance programme.

## What to ask IT for

> For each person below, please create a Microsoft 365 account in the srisriuniversity.edu.in tenant,
> enabled, with a Teams licence, and send back the sign-in address:
>
>     Mr. Sunil Kumar Mishra    sunil.m@srisriuniversity.edu.in
>     Guru Ashis Kumar Das      ...
>     Ms. Sasmita Panda         ...
>     Ms. Shivangi Mitra        ...

## Verified and ready to apply — 14 faculty (5 Oct 2026)

All checked against the tenant: enabled, Teams licence present.

| Code | Name | Address |
|---|---|---|
| F001 | Dr. Aradhana Panigrahi | aradhana.p@srisriuniversity.edu.in |
| F002 | Dr. B. Maithili Dutta Pradhan | maithili.p@srisriuniversity.edu.in |
| F003 | Dr. Bhagirathi Nayak | bhagirathi.n@srisriuniversity.edu.in |
| F004 | Dr. Gagana D P | gagana.d@srisriuniversity.edu.in |
| F005 | Dr. Gayatri Rath | gayatri.r@srisriuniversity.edu.in |
| F006 | Dr. Jharana Rani Tripathy | jharana.t@srisriuniversity.edu.in |
| F007 | Dr. Jyoti Sharma | jyoti.s@srisriuniversity.edu.in |
| F008 | Dr. Praag Bhardwaj | praag.b@srisriuniversity.edu.in |
| F009 | Dr. Pritidhara Hota | pritidhara.h@srisriuniversity.edu.in |
| F010 | Dr. Rajat Kumar Baliarsingh | rajat.b@srisriuniversity.edu.in |
| F011 | Dr. Ravish Mathew | ravish.m@srisriuniversity.edu.in |
| F012 | Dr. Richa Baghel | richa.b@srisriuniversity.edu.in |
| F013 | Dr. Sabnoor Khatoon | sabnoor.k@srisriuniversity.edu.in |
| F014 | Dr. Shwetasaibal Samanta Sahoo | shwetasaibal.s@srisriuniversity.edu.in |

Three of those names were spelled differently in the timetable workbook — Panagrahi/**Panigrahi**,
Shweta Saival/**Shwetasaibal**, Balaiar Singh/**Baliarsingh**. The tenant is the person's own account,
so the portal is corrected to match.

## Applied earlier — 28 Sep 2026

| Code | Name | Address |
|---|---|---|
| F016 | Mr. Harshvardhan Pandey | harshvardhan.p@srisriuniversity.edu.in |
| F017 | Mr. Rushikesh Dattatray Joshi | rushikesh.j@srisriuniversity.edu.in |
| F018 | Mr. Sankar Maharana | sankar.m@srisriuniversity.edu.in |

## How to apply

1. Check the addresses: `npm run graph:check-users -- <address> …`
2. Add the verified ones to `MAPPING` in `scripts/update-faculty-microsoft.ts`
3. `npm run faculty:microsoft` to see what would change, then
   `npm run faculty:microsoft -- --apply --recreate`

`--recreate` is not optional if you want the co-organiser to take effect on classes that already exist:
the provisioner only ever *patches* a session that already has a meeting, and a patch changes the times,
not the participants. Rebuilding issues a new join link — students read the link from the portal, so that
is safe, but a link somebody copied out by hand will stop working.

The teacher's sign-in address changes with it (for example `jharana.rani@` → `jharana.t@`). Their
existing password carries over.

## Not faculty

Mr. SK Abdul Wasim (Assistant Section Officer, `abdul.w@…`) and Ms. Arpita Bose (Admin Executive,
`arpita.b@…`) both have valid, licensed accounts, but they are office staff rather than teaching staff
and have no portal account. If they need one it should be an ODL office **administrator** account.

## Test accounts

`npm run accounts:test -- --apply` creates:

| Address | Role | Detail |
|---|---|---|
| testuser02@srisriuniversity.edu.in | Faculty | employee code F022, Microsoft account resolved for co-organiser |
| testuser03@srisriuniversity.edu.in | Student | MHS-S1 (MA Hindu Studies, Semester 1), roll `TEST-MHS-S1-01` |

Both start on the standard first-login password and are asked to change it, so testing goes through the
same first-run flow everybody else sees. The test teacher has no classes until one is assigned.
