# TOGG — Church Management System

The church management system for **Throne of God's Grace**: one church, many branches, with the Head Pastor and Associate Pastor as the main admins.

| Area | What it does |
|---|---|
| **Members** | Adults, teens and children; membership / tithe-card numbers (TOGG-0001…); departments and cells; Excel export |
| **Registration and import** | Register members one by one, through public `/join` and `/visit` links with QR codes, or by **importing old Excel/CSV files**. Columns are matched for you, dates are read day-first (05/03/1990), and duplicates are skipped |
| **Tithes** | Monthly tithe register (who has and hasn't paid), a 12-month tithe card per member, % of members tithing, and **import of old tithe records** |
| **Giving and offerings** | Offerings, thanksgiving, building fund, missions and more; cash, MoMo, bank, cheque or card; totals by fund and by branch |
| **Attendance** | Type a name and press Enter to check in, live counts, quick-add for first-time visitors, and **"Text absentees"** |
| **Departments** | Main departments (Administration, Organising, Children's, Protocol, Financial, Media) with **sub-departments** and heads. **Department heads register members into their own department** |
| **Department reports** | Every month each department head submits a **Monthly report**, **Budget** and **Planned activities**. They go draft → submitted → approved or returned with a comment, and can be printed |
| **Cells and growth** | Cells sit under a department. Leaders submit meeting reports (attendance, first-timers, converts, offering, testimonies). **New contacts can be added to the church list as visitors in one tick.** Shows a 6-month growth chart and cells that need follow-up |
| **SMS** | Send now or schedule; texts to a branch, department, cell, age group or typed numbers. **Recurring programme reminders** (e.g. *Peak Hour Prayer* with the Zoom/Meet link). **Automatic texts** to members who missed a service, and birthday wishes |
| **Users and roles** | The super admin adds staff accounts directly or approves sign-ups |
| **Database** | Shows the connected Firebase project and how many records are stored; full **backup** (.json and Excel) and **restore** |

## Roles

| Role | Branches | Can do |
|---|---|---|
| Head Pastor (Super Admin) | All | Everything, including appointing admins |
| Associate Pastor (Admin) | All | Everything except changing the Head Pastor or other admins |
| Branch Pastor | Own | Members, attendance, tithes and giving, cells, SMS; reviews department reports |
| Secretary | Own | Members, attendance, sign-ups, cells, SMS (no money) |
| Finance | Own | Tithes and giving |
| Usher | Own | Attendance, and adding first-time visitors |
| Department Head | Own | Registers and edits members of **their** departments (sub-departments included); runs their cells; submits the monthly report, budget and plan |
| Cell Leader | Own | Meeting reports for their cells; adds new contacts as visitors |

These rules are enforced by the database itself (`firestore.rules`), not just hidden in the screens. **105 automated tests** check them (`npm run test:rules`).

---

## Setting up the Firebase project (one time)

The app is already connected to the **`attendanceform-cdb69`** Firebase project (see `src/lib/firebase.ts`).

1. In the [Firebase console](https://console.firebase.google.com/project/attendanceform-cdb69):
   - **Build → Authentication → Get started → Email/Password → Enable.**
   - **Build → Firestore Database → Create database → Production mode.** Choose `eur3 (europe)` or `europe-west1`, the closest to Ghana.
   - The old attendance form uses the *Realtime Database*. TOGG uses *Firestore*, a separate database, so the old form is not affected.
2. On your computer (needs [Node.js 20+](https://nodejs.org)):
   ```bash
   npm install
   npm --prefix functions install
   npx firebase login
   npx firebase deploy --only firestore        # security rules + indexes
   ```
3. Run it: `npm run dev`, then open http://localhost:5173. **The first account created becomes the Head Pastor (Super Admin).**
4. Put it online on Firebase Hosting: `npm run deploy:web`. It will be at `https://attendanceform-cdb69.web.app`.
   You can connect your own domain later under *Hosting → Add custom domain*.

### Turning on SMS

SMS is sent by two small Cloud Functions in `functions/`, so the SMS API key never reaches anyone's browser.

1. Upgrade the Firebase project to the **Blaze (pay-as-you-go)** plan. Cloud Functions require it, but a church's usage normally stays inside the free monthly allowance. You only pay your SMS provider for the texts.
2. Deploy the functions: `npx firebase deploy --only functions`.
   - `sendSmsNow` sends instantly when you press **Send SMS**.
   - `smsTick` runs every 5 minutes (Ghana time). It sends scheduled messages, programme reminders, missed-service texts and birthday wishes.
3. In the app go to **SMS messages → SMS provider** and choose:
   - **Arkesel**, **mNotify** or **Hubtel** (for Hubtel, enter the key as `clientId:clientSecret`).
   - Your approved **Sender ID** (e.g. `TOGG`).
   - Your **API key**. The key can be saved but never read back, even by admins.
4. Press **Send test SMS** to your own phone.
5. Under **Automatic SMS**, switch on missed-service texts and birthday wishes. Under **Programme reminders**, add *Peak Hour Prayer* (days, time, link, how long before).

Until a provider is chosen, the system is in **Test mode**: messages are recorded but not sent.

## Importing old records

- **Members:** *Members → Import old file*. Any Excel/CSV with a header row works: "Full Name" or "First/Last name", Phone, Sex, Date of Birth, Department, Card No, Date Joined… You confirm the column matching and see a preview before anything is saved.
- **Tithes:** *Tithes → Import old records*. One row per payment: Date, Amount, and Card No / Phone / Name to match the member. Import members first.

## Development

```bash
npm run emulators   # local Auth + Firestore + Functions (needs Java)
# .env.local:  VITE_USE_EMULATORS=true  VITE_FIREBASE_PROJECT_ID=demo-togg
npm run dev
npm run test:rules  # 105 security-rule tests
npm run test:sms    # 17 SMS engine tests (audiences, reminders, absentees, birthdays…)
npm run typecheck
```

## Data model (Firestore)

| Collection | Contents |
|---|---|
| `users` | role, `branchId`, `departmentIds`, `cellIds`, active |
| `branches`, `departments` (`parentId` for sub-departments) | church structure |
| `members` | details, `membershipNo`, `category`, `status`, `branchId`, `departmentIds`, `cellId`, `source` |
| `services/{id}/checkins` | attendance |
| `giving` | tithes (`type: tithe`) and all other giving |
| `cells`, `cellReports` | cells under departments, and their meeting reports |
| `deptReports` | id `{dept}_{branch}_{YYYY-MM}_{report\|budget\|plan}` |
| `smsMessages`, `programmes`, `settings/sms`, `secrets/sms` | SMS outbox, recurring reminders, automation settings, API key (server-only) |
| `registrations` | public form submissions |
| `meta/setup`, `meta/counters` | first-admin bootstrap and membership-number counter |
