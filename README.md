# TOGG — Church Management System

Church management for **Throne of God's Grace**, built for one church with many branches.

- **Members:** adults, teens and children; departments; search and filters; CSV import and export.
- **Attendance:** start a service, type a name, tap to check in. Live counts by age group, quick-add for first-time visitors, and a head-count for uncounted guests.
- **Giving:** tithes, offerings, thanksgiving, building fund, missions and more. Cash, MoMo, bank, cheque or card. Monthly totals, breakdown by fund and by branch, and Excel/CSV export.
- **Sign-up links and QR codes:** a public `/join` (member) form and `/visit` (visitor) form, with prayer requests. Submissions land in an inbox for approval.
- **Branches and departments:** HQ plus every branch, and shared departments.
- **Users and roles:** the Head and Associate Pastor see everything. Every other role is locked to one branch.
- **Dashboard:** member counts, attendance trend, giving this month, branch comparison and birthdays.

Built with React, TypeScript, Vite, Tailwind CSS and Firebase (Auth + Firestore). It works on phones, tablets and desktops.

## Roles

| Role | Branches | What they can do |
|---|---|---|
| Head Pastor | All | Everything, including appointing the Associate Pastor |
| Associate Pastor | All | Everything except changing the Head Pastor or other pastors at that level |
| Branch Pastor | Own | Members, attendance, giving, sign-ups |
| Secretary / Admin | Own | Members, attendance, sign-ups (no giving) |
| Finance | Own | Giving, and viewing members |
| Usher | Own | Attendance, and adding first-time visitors |
| Department Leader | Own | Viewing members (filtered to their departments) |

These rules are enforced on the server in `firestore.rules`, not only in the app. `tests/rules.test.mjs` checks them with 53 tests.

## Setup

1. **Create a Firebase project** at <https://console.firebase.google.com>.
   - Add a **Web app** and copy its config.
   - Turn on **Authentication → Sign-in method → Email/Password**.
   - Create a **Firestore Database** in production mode. Choose a region near Ghana, such as `europe-west`.
2. **Configure the app:**
   ```bash
   npm install
   cp .env.example .env.local   # paste your Firebase web config values
   ```
3. **Deploy the security rules and indexes:**
   ```bash
   npx firebase login
   npx firebase use --add        # pick your project
   npx firebase deploy --only firestore
   ```
4. **Run it:** `npm run dev`, then open <http://localhost:5173>.
5. **First sign-up:** the first account created becomes the **Head Pastor**. Everyone after that signs up and waits until the Head or Associate Pastor gives them a role and branch under *Users & roles*.
6. **Put it online (Firebase Hosting):** `npm run deploy`.

## Development

```bash
npm run emulators     # local Auth + Firestore (needs Java)
# in .env.local set VITE_USE_EMULATORS=true and VITE_FIREBASE_PROJECT_ID=demo-togg
npm run dev
npm run test:rules    # security rules tests
npm run typecheck
```

## Data model (Firestore)

| Collection | Contents |
|---|---|
| `users/{uid}` | name, email, `role`, `branchId` (null for Head/Associate), `departmentIds`, `active` |
| `branches/{id}` | name, location, pastor, phone, `isHQ` |
| `departments/{id}` | name, leader, description (shared by all branches) |
| `members/{id}` | personal details, `category` (adult/teen/child), `status`, `branchId`, `departmentIds` |
| `services/{id}` | `branchId`, `date`, type, `count`, `visitors` |
| `services/{id}/checkins/{memberId}` | one per person present |
| `giving/{id}` | `branchId`, `date`, `amount`, `type`, `method`, member, reference |
| `registrations/{id}` | public form submissions awaiting approval |
| `meta/setup` | records that the first Head Pastor has been created |
