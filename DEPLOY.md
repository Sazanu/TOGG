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
| **Wasmer Edge** | Free tier | `npm run build`, then `wasmer deploy` (uses `wasmer.toml` + `wasmer-settings/config.toml`) |
| **Netlify** | 100 GB/month | Drag the `dist` folder onto app.netlify.com/drop, or connect GitHub (`netlify.toml`) |

Whichever host you use, enter its address in TOGG under **Payments & links → Public web address** so the QR codes and SMS links point to it.

## 5. Turn on SMS — free, no Blaze plan
Follow **[sms-server/README.md](sms-server/README.md)** (about 10 minutes). In short:
1. script.google.com → New project → paste `sms-server/Code.js` and `sms-server/appsscript.json` → run **setup**.
2. Deploy → New deployment → **Web app** (Execute as *Me*, access *Anyone*) → copy the URL.
3. In TOGG: **SMS messages → SMS provider** → paste the URL, choose **Gonlinesites** (or Arkesel / mNotify / Hubtel),
   Sender ID and **API key** → Save → *Send test SMS*.
4. Open **System status**: the SMS lines should be green. Press *Send waiting messages now* to send anything stuck.

*(Alternative with the Blaze plan: `npx firebase deploy --only functions`.)*

## 6. Online giving with Paystack (optional)
1. Create a Paystack business account at paystack.com (Ghana) and complete the business verification for live payments.
2. Go to dashboard.paystack.com → **Settings → API Keys & Webhooks**. Copy the **Public key** and **Secret key** into TOGG under **Payments & links → Paystack**. Start with the *Test* keys.
3. On the same Paystack page, set the **Webhook URL** to your SMS server's Web app URL from step 5. Payments are then confirmed within seconds. Without it, the server's 5-minute check still confirms them.
4. Open `/pay` on your site and give a test amount with Paystack's test card or test MoMo number. It should show **"received and recorded"** and appear under **Giving → Online payments**.
5. When you're happy, replace both keys with the **Live** keys. **System status** turns green.

## After an update
Run steps 2, 3 (deploy line only), 4 and 5 again, or simply:
```
npm run deploy
```

## Something wrong?
- **"Account not set up" / "contact the pastor":** sign in again. If no Head Pastor exists yet you'll get *"Set me up as Head Pastor"*. Otherwise, see `functions/scripts/make-super-admin.js`.
- **Adding a user says the email already has a login:** ask that person to sign in once. They then appear in *Users & roles* as "Awaiting approval", and you give them a role.
- **QR code / form doesn't open on a phone:** the website must be published (step 4). Forms do not work from `localhost` on another device.
