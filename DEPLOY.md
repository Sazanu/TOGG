# Putting TOGG online — step by step

You only need to do this once (and again after each update). It takes about 15 minutes.

## What you need
- A computer with **Node.js 20 or newer** (https://nodejs.org → "LTS").
- Your Google account that owns the Firebase project **attendanceform-cdb69**.

## 1. Unzip and install
Open a terminal (Windows: *Command Prompt* or *PowerShell*) in the unzipped `TOGG` folder:
```
npm install
npm --prefix functions install
npx firebase login
```

## 2. ⚠️ Protect the database (most important)
```
npx firebase deploy --only firestore
```
This uploads the **security rules** (who may see what) and the **indexes**. Until this is done, **anyone on the internet can read the church database**, and some pages may show empty lists.

## 3. Voice notes and videos
**Free option (recommended): Cloudinary.** No Blaze plan needed.
1. Create a free account at https://cloudinary.com/users/register_free.
2. Cloudinary → Settings → Upload → *Add upload preset* → Signing mode **Unsigned**, folder `togg-prayer`.
3. In TOGG: *Payments & links → Voice notes & videos* → choose Cloudinary, then paste your **Cloud name** and **preset name**.

**Or Firebase Storage** (needs the Blaze plan):
1. Firebase console → **Build → Storage → Get started** (choose a location in Europe).
   Projects created after October 2024 need the **Blaze (pay-as-you-go)** plan for this; a church stays well inside the free allowance.
2. Then run:
```
npx firebase deploy --only storage
```

## 4. Publish the website
```
npm run deploy:web
```
The system is then at **https://attendanceform-cdb69.web.app**. The QR codes, the prayer form,
project pages and welfare SMS links all point there. (To use your own domain: Firebase console →
Hosting → *Add custom domain*, then enter it in the app under *Payments & links*.)

### Other hosts (instead of Firebase Hosting)
The website is only the `dist` folder, so any static host works. The routing files are already included (`public/_redirects`, `netlify.toml`, `vercel.json`).

| Host | Free plan | How |
|---|---|---|
| **Firebase Hosting** (recommended) | 10 GB storage, 360 MB/day transfer | `npm run deploy:web` (same project as the database) |
| **Cloudflare Pages** | Unlimited bandwidth | Create a Pages project, connect GitHub (build `npm run build`, output `dist`), or drag-and-drop the `dist` folder |
| **Vercel** | 100 GB/month | Import the GitHub repository. Settings are read from `vercel.json` |
| **Netlify** | 100 GB/month | Drag the `dist` folder onto app.netlify.com/drop, or connect GitHub (`netlify.toml`) |

Whichever host you use, enter its address in TOGG under **Payments & links → Public web address** so the QR codes and SMS links point to it.

## 5. Turn on SMS (needs the Blaze plan)
```
npx firebase deploy --only functions
```
Then in the app: **SMS messages → SMS provider** → choose Arkesel / mNotify / Hubtel, Sender ID and API key → *Send test SMS*.

## After an update
Run steps 2, 3 (deploy line only), 4 and 5 again, or simply:
```
npm run deploy
```

## Something wrong?
- **"Account not set up" / "contact the pastor":** sign in again. If no Head Pastor exists yet you'll get *"Set me up as Head Pastor"*. Otherwise, see `functions/scripts/make-super-admin.js`.
- **Adding a user says the email already has a login:** ask that person to sign in once. They then appear in *Users & roles* as "Awaiting approval", and you give them a role.
- **QR code / form doesn't open on a phone:** the website must be published (step 4). Forms do not work from `localhost` on another device.
