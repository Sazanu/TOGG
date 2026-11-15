# TOGG — Church Management System

<img src="public/logo-full.png" alt="Throne of God's Grace Ministries" height="140" />

The church management system for **Throne of God's Grace Ministries**: one church, many branches, with the Head Pastor and Associate Pastor as the main admins.

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

### New in this version
- **Member profile page:** details, departments, cell, attendance record, tithe card, giving, prayer requests, answered prayers and testimonies.
- **Head Pastor only:** rate each member's attendance, tithe, giving, cell and department service, prayer life, growth and conduct as *Good / Fair / Needs improvement*. Set reminders. Anything marked "needs improvement" and every reminder that is due shows on the dashboard under **For your attention**.
- **Projects:** fundraising like GoFundMe for building work such as roofing. Shows the goal, money raised, how far the work has gone, milestones and progress news, with a shareable public page and QR code.
- **Welfare dues:** a monthly amount per adult member, a register of who has paid and who hasn't, arrears, and **SMS reminders with the payment link** (by hand, or automatically each month).
- **Prayer requests and testimonies:** sent through a public form by text, **voice note or video**. The sender chooses who receives it, following the church hierarchy (cell leader → department head → branch pastor → Associate Pastor → Head Pastor). Requests to the Head Pastor stay private.
- **Charity Foundation:** people in need, aid given, support received (money and items), outreach, the foundation's balance, an Excel report and a public donation page.
- **Departments:** Evangelism & Follow-up, Music & Drama, Women's Ministry, Business Development, Charity Foundation, **Golden Heart 💛** (unmarried adults) and **Diamond Heart 💎** (married members). The last two fill themselves from marital status.
- **Cells** stand on their own (not under a department).
- **Online branch** for members who have travelled or live abroad, with their group link.
- **Access control:** department heads see only their department's members, cell leaders only their cell, finance only money, and branch staff only their branch. **The Super Admin can switch off any area for any person.**
- **Payments & links:** your MoMo number, online payment link and bank details, used on every public giving page.

👉 **To put it online, follow [DEPLOY.md](DEPLOY.md).**

## Roles

| Role | Branches | Can do |
|---|---|---|
| Head Pastor (Super Admin) | All | Everything, including appointing admins |
| Associate Pastor (Admin) | All | Everything except changing the Head Pastor or other admins |
| Branch Pastor | Own | Members, attendance, tithes and giving, cells, SMS; reviews department reports |
| Branch Administrator | Own | Members, attendance, sign-ups, cells, prayer requests, SMS (no money) |
| Finance | Own | **Only money:** tithes, giving, welfare, projects |
| Usher | Own | Attendance, and adding first-time visitors |
| Department Head | Own | **Only** members of their departments: registers and edits them; submits the monthly report, budget and plan |
| Cell Leader | Own | **Only** their cell: its members, meeting reports and new contacts |

These rules are enforced by the database itself (`firestore.rules`), not just hidden in the screens. **147 automated tests** check them (`npm run test:rules`).

---

## Setting up the Firebase project (one time)

The app is already connected to the **`attendanceform-cdb69`** Firebase project (see `src/lib/firebase.ts`).

1. In the [Firebase console](https://console.firebase.google.com/project/attendanceform-cdb69):
   - **Build → Authentication → Get started → Email/Password → Enable.**
   - **Build → Firestore Database → Create database → Production mode.** Choose `eur3 (europe)` or `europe-west1`, the closest to Ghana.
   - Your project already holds data from the **old 2025 attendance form** (a few `members` and the `attendance` records). TOGG shows those old members under **All branches**, so you can open each one and assign a branch. The old `attendance` records stay readable by the Head and Associate Pastor. **Once you deploy TOGG's rules, the old form can no longer save**, so stop using it.
2. On your computer (needs [Node.js 20+](https://nodejs.org)):
   ```bash
   npm install
   npm --prefix functions install
   npx firebase login
   npx firebase deploy --only firestore        # security rules + indexes
   ```
   > ⚠️ **Do this step first and soon.** Until the rules are deployed, the database is open to anyone on the internet.
3. Run it: `npm run dev`, then open http://localhost:5173. **The first account created becomes the Head Pastor (Super Admin).**

   **Stuck on "Account not set up" or "contact the pastor"?** This happens when you signed up before the database was ready.
   - **Usual fix:** sign in again. While no Head Pastor exists yet, you'll see **"Set me up as Head Pastor (Super Admin)"**. Press it.
   - **If someone else already took that role:** run the emergency tool with a service-account key from *Project settings → Service accounts → Generate new private key*:
     ```bash
     npm --prefix functions install
     node functions/scripts/make-super-admin.js path/to/key.json your@email.com
     ```
     Delete the key file afterwards.
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
npm run test:rules    # 147 security-rule tests
npm run test:storage  # 8 voice-note / video upload tests
npm run test:sms      # 20 SMS engine tests (audiences, reminders, absentees, birthdays, welfare…)
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
