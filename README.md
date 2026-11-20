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
- **Members are split into Members, Visitors, Not active, and Everyone.** Import your official list with *"This is the current official membership list"* ticked, and anyone not on it moves to **Not active**. Their records are kept, and they become active again if they reappear on a later list.
- **Free voice notes and videos:** Cloudinary's free plan (no card) can store prayer-request recordings instead of Firebase Storage. Set it up under *Payments & links → Voice notes & videos*.

### Latest additions
- **Free SMS server** (Google Apps Script, no Blaze plan) with **Gonlinesites**, Arkesel, mNotify or Hubtel. A **System status** page shows green or red for security, SMS, settings and church data, and has a button to send any stuck messages.
- **Service finance:** each service's collections (love offering, kingdom offering, offering, seed and special seed, projects offering, tithe, pledges) and expenses. Weekly or monthly report with **Service, Offering, Seed, Tithe, Projects, Pledges, Total, Expenses, 30%, Balance**. The 30% rate and what it applies to are adjustable.
- **Leadership & roles:** assign the Head Pastor, Associate Pastor, pastors, ministers, elders and **your own roles** from the member list. Choose department heads, assistants and cell leaders from members. One person can hold several roles, and their login access combines all of them. *Login access* opens Add user already filled in for that leader.
- **Cell leaders' log book**, following the TOGG paper form: the member list, CM / UCV / ECV status, weekly ticks for cell meetings, Sunday services and weekday services, and the weekly meeting table (date, attendance, offering) with average and total rows. It can be printed.
- **Notification bell** for everyone: personal reminders, the Head Pastor's attention items, new prayer requests and reports to review. It **plays a sound and shows a pop-up** when something new arrives, like WhatsApp Web.

### Expenses, offices and access
- **Expenses & offerings page:** every expense records which service's offering it was taken from (e.g. Kingdom offering of Sunday 16th), plus the details, who was paid and who approved it. An offering can't be overspent. Each service also records which offerings the **30%** comes from. A table shows, for each offering, collected − 30% − expenses = left. Service finance rows open a details page.
- **Access follows office:** link a login to the person's member record (Users → *Linked member record*, or *Login access* from Leadership). The departments they head and the cells they lead then give access automatically. When the office passes to someone else, that access is removed.
- **Extra access:** besides switching areas off, the Super Admin can now *also give* Attendance, Money, Members, Cells or SMS to a person for their own branch.
- **Cell leaders** can *Text my cell* and *Write meeting report* from their cell page.
- **Sender ID** is chosen from the IDs Gonlinesites has approved (TOGG). A new one is added only after Gonlinesites approves it, because an unapproved ID is silently refused.
- **Reminders** ring every minute (the Head Pastor can change this) until done, snoozed or muted with the bell's mute button.
- **Page not found** has Back and Home buttons. The build also writes `404.html` and real folders for the public pages, so every host opens the app.

### SMS, speed and safety
- **SMS goes straight to Gonlinesites from the app.** Paste the API key (or the whole API link) under *SMS messages → SMS provider*, use an approved Sender ID (**TOGG**), and press *Send test SMS*. Each message is claimed once, so two open screens never send it twice. Scheduled messages go out from any open screen of someone allowed to send SMS. Automatic messages still use the optional Apps Script server.
- **Automatic sign-out** when the app is left unattended, with a one-minute warning. The Head Pastor sets the time under *Payments & links → Security & reminders*.
- **Reminders keep ringing** at the interval the Head Pastor sets until they are marked done.
- **Back button** on every page. **Faster start-up:** pages and the Excel library load only when needed.

### Attendance and online giving
- **Check-in station** (Attendance → *Open check-in station*): a full-screen page for a tablet or laptop at the door. Type a few letters of a name or phone number and tap the person; it chimes. There is a one-tap form for first-time visitors and a head-count for guests who aren't named. **Undo** is beside every name.
- **QR self check-in:** the station shows a QR code. Members scan it, type their phone number, and are checked in automatically. A phone the system doesn't know appears on the station with *Add as visitor* or *Find by name*.
- **Attendance reports:** pick a month and a service type. You see each service's adults, teens, children and guests on a chart, the average against the previous month, each member's attendance rate, and **who did not come at all**, with a *Text them* button. Exports to Excel.
- **Paystack online giving** on the public **Give** page (`/pay`): tithe, offering, thanksgiving, seed, a project, welfare dues or charity, paid by MoMo or card. **Every payment is checked with Paystack by the server before it is recorded**, using the amount Paystack actually received. It goes into Giving (or Charity) under the right member, matched by phone number. Project totals and welfare months update by themselves, and Paystack's fee is noted. Set the keys under *Payments & links → Paystack*.

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

These rules are enforced by the database itself (`firestore.rules`), not just hidden in the screens. **172 automated tests** check them (`npm run test:rules`).

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
npm run test:rules    # 172 security-rule tests
npm run test:storage  # 8 voice-note / video upload tests
npm run test:sms      # 20 SMS engine tests (Cloud Functions version)
npm run test:sms-server  # 17 tests of the free Apps Script SMS server (incl. Gonlinesites)
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
| `selfCheckins` | QR self check-ins waiting for the station |
| `onlineGifts/{reference}`, `secrets/paystack` | Paystack payments (pending → success / failed, written only by the server), secret key (server-only) |
| `meta/setup`, `meta/counters` | first-admin bootstrap and membership-number counter |
