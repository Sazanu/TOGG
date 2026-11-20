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

## If something is red
| Message | Fix |
|---|---|
| `PERMISSION_DENIED` / `Cloud Firestore API has not been used in project …` | Apps Script ⚙️ Project Settings → **Google Cloud Platform (GCP) Project** → **Change project** → enter the Firebase **project number** (Firebase console → Project settings → General). Then run `setup` again. |
| `Arkesel 401` / `invalid api key` | Copy the API key again from the Arkesel dashboard → paste in TOGG → Save. |
| Sender ID rejected | Sender IDs must be approved by your SMS provider first (max 11 letters). |
| SMS server “Stopped” | Run **setup** again in the Apps Script editor (restarts the timer). |

**Updating the script later:** paste the new `Code.js`, Save, then **Deploy → Manage deployments → ✏️ → Version: New version → Deploy** (the URL stays the same).

Free limits (consumer Google account): 20,000 web requests per day and 90 minutes of timers per day —
far more than a church needs. Tested with `npm run test:sms-server`.
