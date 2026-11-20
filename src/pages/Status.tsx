import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { collection, doc, getCountFromServer, getDoc, getDocs, query, where } from 'firebase/firestore';
import { CheckCircle2, CircleAlert, Loader2, RefreshCw, Send, XCircle } from 'lucide-react';
import { Button, Card, PageHeader, cx, useToast } from '../components/ui';
import { db, firebaseConfig } from '../lib/firebase';
import { isLocalAddress } from '../lib/settings';
import { wakeSmsServer } from '../lib/sms';

type Light = 'green' | 'amber' | 'red';
interface Check { area: string; name: string; light: Light; detail: ReactNode; fix?: ReactNode }

async function safe<T>(fn: () => Promise<T>): Promise<{ ok: true; v: T } | { ok: false; code: string }> {
  try { return { ok: true, v: await fn() }; } catch (e) { return { ok: false, code: (e as { code?: string }).code ?? String(e) }; }
}

export default function Status() {
  const toast = useToast();
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    setChecks(null);
    const out: Check[] = [];
    // 1. Security rules: the SMS API key must NOT be readable from the app.
    const secret = await safe(() => getDoc(doc(db, 'secrets', 'sms')));
    out.push(secret.ok
      ? { area: 'Security', name: 'Database security rules', light: 'red', detail: 'NOT deployed — anyone on the internet can read the church database.', fix: <>Run <code>npx firebase deploy --only firestore</code> (DEPLOY.md step 2).</> }
      : { area: 'Security', name: 'Database security rules', light: 'green', detail: 'Deployed — each person only sees what they are allowed to.' });

    // 2. SMS
    const sms = (await safe(() => getDoc(doc(db, 'settings', 'sms'))));
    const s = sms.ok ? (sms.v.data() ?? {}) : {};
    const keySet = await safe(() => getDoc(doc(db, 'settings', 'smsKeyStatus')));
    const hasKey = keySet.ok && !!keySet.v.data()?.set;
    if (!s.provider || s.provider === 'log') out.push({ area: 'SMS', name: 'SMS provider', light: 'red', detail: 'Test mode — messages are recorded but NOT sent.', fix: <>SMS messages → SMS provider: choose Arkesel / mNotify / Hubtel and save your API key.</> });
    else out.push({ area: 'SMS', name: 'SMS provider', light: hasKey ? 'green' : 'red', detail: hasKey ? `${s.provider} · sender ID “${s.senderId || 'TOGG'}”` : `${s.provider} chosen but no API key saved.`, fix: hasKey ? undefined : <>SMS messages → SMS provider → paste the API key.</> });
    const hb = await safe(() => getDoc(doc(db, 'meta', 'heartbeat')));
    const beat = hb.ok && hb.v.exists() ? hb.v.data() : null;
    const at: Date | null = beat?.at?.toDate ? beat.at.toDate() : null;
    const mins = at ? Math.round((Date.now() - at.getTime()) / 60000) : null;
    out.push(!at
      ? { area: 'SMS', name: 'SMS server', light: 'red', detail: 'No SMS server has ever checked in, so nothing is sent.', fix: <>Set up the free server: <code>sms-server/README.md</code> (10 minutes, no Blaze plan), then paste its URL under SMS provider.</> }
      : mins! <= 15 ? { area: 'SMS', name: 'SMS server', light: beat?.ok === false ? 'amber' : 'green', detail: `Running (${beat?.via}) — last checked in ${mins} min ago.${beat?.error ? ` Last error: ${beat.error}` : ''}` }
        : { area: 'SMS', name: 'SMS server', light: 'red', detail: `Stopped — last checked in ${at.toLocaleString('en-GB')}.`, fix: <>In the Apps Script editor run <b>setup</b> again (it restarts the 5-minute timer).</> });
    const queued = await safe(() => getDocs(query(collection(db, 'smsMessages'), where('status', '==', 'queued'))));
    if (queued.ok) {
      const stuck = queued.v.docs.filter((d) => { const c = d.data().createdAt?.toDate?.(); return !c || Date.now() - c.getTime() > 10 * 60000; }).length;
      out.push(stuck ? { area: 'SMS', name: 'Waiting messages', light: 'red', detail: `${stuck} message(s) waiting more than 10 minutes.`, fix: <>Use “Send waiting messages now” below once the server is set up.</> }
        : { area: 'SMS', name: 'Waiting messages', light: 'green', detail: 'Nothing stuck in the queue.' });
    }
    const recent = await safe(() => getDocs(query(collection(db, 'smsMessages'), where('status', 'in', ['sent', 'failed']))));
    if (recent.ok && recent.v.size) {
      const last = recent.v.docs.map((d) => d.data()).sort((a, b) => (b.finishedAt?.toMillis?.() ?? 0) - (a.finishedAt?.toMillis?.() ?? 0))[0];
      out.push({ area: 'SMS', name: 'Last message', light: last.status === 'sent' ? 'green' : 'red', detail: last.status === 'sent' ? `“${last.label || 'Message'}” — ${last.sentCount}/${last.recipientsCount} accepted by ${last.provider}.` : `“${last.label || 'Message'}” failed: ${last.error || 'unknown error'}` });
    }

    // 3. Other settings
    const pay = await safe(() => getDoc(doc(db, 'settings', 'payments')));
    const p = pay.ok ? pay.v.data() ?? {} : {};
    out.push(p.momoNumber || p.paymentLink ? { area: 'Settings', name: 'Payment details', light: 'green', detail: p.paymentLink ? 'Online payment link set.' : `MoMo ${p.momoNumber}` }
      : { area: 'Settings', name: 'Payment details', light: 'amber', detail: 'No MoMo number or payment link — giving pages and welfare SMS have nowhere to send people.', fix: <Link className="underline" to="/settings">Payments &amp; links</Link> });
    const address = p.publicSiteUrl || (isLocalAddress(window.location.origin) ? '' : window.location.origin);
    out.push(address ? { area: 'Settings', name: 'Public web address', light: 'green', detail: `QR codes and SMS links use ${address}` }
      : { area: 'Settings', name: 'Public web address', light: 'amber', detail: `Not set — links use https://${firebaseConfig.projectId}.web.app, which only works if the site is published there.`, fix: <Link className="underline" to="/settings">Payments &amp; links → Public web address</Link> });
    const media = await safe(() => getDoc(doc(db, 'settings', 'media')));
    const m = media.ok ? media.v.data() ?? {} : {};
    out.push(m.provider === 'firebase' || (m.cloudName && m.uploadPreset) ? { area: 'Settings', name: 'Voice notes & videos', light: 'green', detail: m.provider === 'firebase' ? 'Firebase Storage' : `Cloudinary (${m.cloudName})` }
      : { area: 'Settings', name: 'Voice notes & videos', light: 'amber', detail: 'Not set up — the prayer form only accepts typed requests.', fix: <Link className="underline" to="/settings">Payments &amp; links → Voice notes &amp; videos</Link> });

    // 4. Church data
    const count = async (c: string, ...w: ReturnType<typeof where>[]) => { const r = await safe(() => getCountFromServer(w.length ? query(collection(db, c), ...w) : collection(db, c))); return r.ok ? r.v.data().count : -1; };
    const [branches, depts, active, heads] = await Promise.all([count('branches'), count('departments'), count('members', where('status', '==', 'active')), count('users', where('role', '==', 'head_pastor'))]);
    out.push({ area: 'Church', name: 'Branches & departments', light: branches > 0 && depts > 0 ? 'green' : 'amber', detail: `${branches} branches, ${depts} departments` });
    out.push({ area: 'Church', name: 'Members', light: active > 0 ? 'green' : 'amber', detail: `${active} active members` });
    out.push({ area: 'Church', name: 'Head Pastor account', light: heads > 0 ? 'green' : 'red', detail: `${heads} account(s) with full access` });
    setChecks(out);
  }, []);
  useEffect(() => { run(); }, [run]);

  async function sendNow() {
    setBusy(true);
    const r = await wakeSmsServer();
    toast(r.delivered ? 'ok' : 'err', r.delivered ? 'Asked the SMS server to send everything waiting. Refreshing…' : r.error ?? 'No SMS server set up.');
    setTimeout(() => { run(); setBusy(false); }, 6000);
  }

  const red = checks?.filter((c) => c.light === 'red').length ?? 0;
  const amber = checks?.filter((c) => c.light === 'amber').length ?? 0;
  const icon = (l: Light) => l === 'green' ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : l === 'amber' ? <CircleAlert className="h-5 w-5 text-amber-500" /> : <XCircle className="h-5 w-5 text-red-500" />;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="System status" subtitle="Green means working. Fix anything red first."
        actions={<><Button variant="outline" loading={busy} onClick={sendNow}><Send className="h-4 w-4" /> Send waiting messages now</Button><Button variant="outline" onClick={run}><RefreshCw className="h-4 w-4" /> Check again</Button></>} />
      {!checks ? <div className="flex items-center gap-2 py-16 text-stone-500"><Loader2 className="h-5 w-5 animate-spin" /> Checking everything…</div> : (
        <>
          <div className={cx('mb-6 rounded-2xl px-5 py-4 text-sm font-medium', red ? 'bg-red-50 text-red-800' : amber ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-800')}>
            {red ? `${red} problem(s) need fixing.` : amber ? `Working, with ${amber} thing(s) to finish setting up.` : 'All green — everything is working. 🎉'}
          </div>
          {['Security', 'SMS', 'Settings', 'Church'].map((area) => (
            <Card key={area} className="mb-4">
              <div className="border-b border-stone-100 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-stone-500">{area}</div>
              <ul className="divide-y divide-stone-100">
                {checks.filter((c) => c.area === area).map((c) => (
                  <li key={c.name} className="flex gap-3 px-5 py-3">
                    {icon(c.light)}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-stone-900">{c.name}</div>
                      <div className="text-sm text-stone-600">{c.detail}</div>
                      {c.fix && c.light !== 'green' && <div className="mt-1 text-xs text-stone-500">How to fix: {c.fix}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
