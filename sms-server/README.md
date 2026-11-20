# Free SMS server (Google Apps Script) — no Blaze plan needed

This small script sends every SMS that TOGG queues: **Send now**, scheduled messages,
programme reminders (Peak Hour Prayer), missed-service texts, birthdays and welfare reminders.
It runs free on Google's servers with **your** Google account. ⏱ About 10 minutes, once.

> Use the Google account that **owns the Firebase project** `attendanceform-cdb69`.

## 1. Create the script
1. Go to **https://script.google.com** → **New project**. Rename it **TOGG SMS server** (top left).
2. Click the ⚙️ **Project Settings** (left) → tick **“Show "appsscript.json" manifest file in editor”**.
3. Back in the **Editor** (`< >` on the left):
   - Open `appsscript.json`, delete everything, paste the contents of **`sms-server/appsscript.json`**.
   - Open `Code.gs`, delete everything, paste the contents of **`sms-server/Code.js`**.
   - Press 💾 **Save**.

## 2. Start it
1. In the toolbar choose the function **`setup`** → **Run**.
2. Google asks for permission → **Review permissions** → choose your account →
   “Google hasn’t verified this app” → **Advanced** → **Go to TOGG SMS server (unsafe)** → **Allow**.
   (It is your own script; it only talks to your Firestore and your SMS provider.)
3. The log should say **“TOGG SMS server is running.”** It now runs every 5 minutes by itself.

## 3. Let TOGG wake it instantly
1. **Deploy** → **New deployment** → ⚙️ type **Web app**.
2. *Execute as*: **Me** · *Who has access*: **Anyone** → **Deploy** → copy the **Web app URL**.
3. In TOGG: **SMS messages → SMS provider**:
   - **SMS server**: paste the Web app URL
   - **SMS provider**: Arkesel (or mNotify / Hubtel), **Sender ID** (approved by the provider), **API key**
   - **Save** → **Send test SMS** to your phone.
4. Open **System status** in TOGG: the SMS lines should be **green**. Press **“Send waiting messages now”**
   to send anything that was stuck in the queue.

## 4. Paystack online giving (optional)
The same script also confirms Paystack payments. It asks Paystack directly (`/transaction/verify`) with your secret key and only then records the gift, once. Nothing else is needed in the script:
1. In TOGG, go to **Payments & links → Paystack**. Paste the public key and the secret key (both *test* or both *live*) and Save.
2. In the Paystack dashboard, go to **Settings → API Keys & Webhooks → Webhook URL**. Paste the **same Web app URL** as above.
3. A payment is then recorded within seconds. Even without the webhook, it is picked up within 5 minutes.

## If something is red
| Message | Fix |
|---|---|
| `PERMISSION_DENIED` / `Cloud Firestore API has not been used in project …` | Apps Script ⚙️ Project Settings → **Google Cloud Platform (GCP) Project** → **Change project** → enter the Firebase **project number** (Firebase console → Project settings → General). Then run `setup` again. |
| `Arkesel 401` / `invalid api key` | Copy the API key again from the Arkesel dashboard → paste in TOGG → Save. |
| Sender ID rejected | Sender IDs must be approved by your SMS provider first (max 11 letters). |
| `Paystack 401` / `Invalid key` | Paste the **secret** key again (Payments & links → Paystack). It must be the same mode (test or live) as the public key. |
| SMS server “Stopped” | Run **setup** again in the Apps Script editor (restarts the timer). |

**Updating the script later:** paste the new `Code.js`, Save, then **Deploy → Manage deployments → ✏️ → Version: New version → Deploy** (the URL stays the same).

Free limits (consumer Google account): 20,000 web requests per day and 90 minutes of timers per day —
far more than a church needs. Tested with `npm run test:sms-server`.
