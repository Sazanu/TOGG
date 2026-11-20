import { useEffect, useState, type FormEvent } from 'react';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useSecuritySettings, type SecuritySettings } from '../components/IdleLogout';
import { useAuth } from '../context/AuthContext';
import { ExternalLink } from 'lucide-react';
import { Button, Card, Field, Input, PageHeader, Select, Textarea, errorText, useToast } from '../components/ui';
import { db, firebaseConfig } from '../lib/firebase';
import { publicBase, usePayments } from '../lib/settings';
import { useMediaSettings, type MediaSettings } from '../lib/media';
import type { PaymentSettings } from '../lib/types';

export default function Settings() {
  const toast = useToast();
  const saved = usePayments();
  const [d, setD] = useState<PaymentSettings | null>(null);
  useEffect(() => { if (!d && saved) setD(saved); }, [saved, d]);
  if (!d) return null;
  const set = (k: keyof PaymentSettings, v: string) => setD({ ...d, [k]: v });
  async function save(e: FormEvent) {
    e.preventDefault();
    try { await setDoc(doc(db, 'settings', 'payments'), { ...d, updatedAt: serverTimestamp() }); toast('ok', 'Saved.'); }
    catch (err) { toast('err', errorText(err)); }
  }
  const base = publicBase(d);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Payments & links" subtitle="Shown on the public giving page, project pages, the charity donation page and in welfare SMS reminders." />
      <form onSubmit={save} className="space-y-6">
        <Card className="space-y-4 p-6">
          <h2 className="font-semibold text-stone-900">How people pay</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Mobile Money number"><Input value={d.momoNumber} onChange={(e) => set('momoNumber', e.target.value)} placeholder="024 000 0000" /></Field>
            <Field label="Account name"><Input value={d.momoName} onChange={(e) => set('momoName', e.target.value)} /></Field>
            <Field label="Network"><Input value={d.momoNetwork} onChange={(e) => set('momoNetwork', e.target.value)} placeholder="MTN MoMo / Telecel Cash / AT Money" /></Field>
          </div>
          <Field label="Online payment link (optional)" hint="A payment page from Paystack, Hubtel, Flutterwave etc. People tap it to pay by MoMo or card.">
            <Input type="url" value={d.paymentLink} onChange={(e) => set('paymentLink', e.target.value)} placeholder="https://paystack.com/pay/togg" />
          </Field>
          <Field label="Bank details (optional)"><Textarea rows={2} value={d.bankDetails} onChange={(e) => set('bankDetails', e.target.value)} placeholder="Bank, branch, account name and number" /></Field>
        </Card>
        <Card className="space-y-3 p-6">
          <h2 className="font-semibold text-stone-900">Public web address</h2>
          <Field label="Address of the published system" hint={`Used in QR codes and SMS links. Leave empty to use the free Firebase address https://${firebaseConfig.projectId}.web.app`}>
            <Input type="url" value={d.publicSiteUrl} onChange={(e) => set('publicSiteUrl', e.target.value)} placeholder={`https://${firebaseConfig.projectId}.web.app`} />
          </Field>
          <p className="text-sm text-stone-500">Public pages:</p>
          <ul className="space-y-1 text-sm">
            {[['Giving / payment page', '/pay'], ['Member registration', '/join'], ['Visitor form', '/visit'], ['Prayer request & testimony', '/prayer'], ['Charity donations', '/charity-give']].map(([l, p]) => (
              <li key={p}><a className="inline-flex items-center gap-1 text-royal-700 hover:underline" href={`${base}${p}`} target="_blank" rel="noreferrer">{l}: {base}{p} <ExternalLink className="h-3 w-3" /></a></li>
            ))}
          </ul>
        </Card>
        <div className="flex justify-end"><Button type="submit">Save</Button></div>
      </form>
      <SecurityCard />
      <PaystackKeys />
      <MediaStorage />
    </div>
  );
}

function MediaStorage() {
  const toast = useToast();
  const saved = useMediaSettings();
  const [d, setD] = useState<MediaSettings | null>(null);
  useEffect(() => { if (!d && saved) setD(saved); }, [saved, d]);
  if (!d) return null;
  async function save(e: FormEvent) {
    e.preventDefault();
    try { await setDoc(doc(db, 'settings', 'media'), { ...d, cloudName: d!.cloudName.trim(), uploadPreset: d!.uploadPreset.trim(), updatedAt: serverTimestamp() }); toast('ok', 'Saved.'); }
    catch (err) { toast('err', errorText(err)); }
  }
  return (
    <form onSubmit={save} className="mt-6">
      <Card className="space-y-4 p-6">
        <h2 className="font-semibold text-stone-900">Voice notes &amp; videos (prayer requests)</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {([['cloudinary', 'Cloudinary — free', 'Free plan, about 25 GB a month, no card. Recommended.'], ['firebase', 'Firebase Storage', 'Needs the Firebase Blaze (pay-as-you-go) plan.']] as const).map(([v, t, h]) => (
            <label key={v} className={`cursor-pointer rounded-xl border p-3 ${d.provider === v ? 'border-royal-500 bg-royal-50' : 'border-stone-200'}`}>
              <input type="radio" className="mr-2" checked={d.provider === v} onChange={() => setD({ ...d, provider: v })} />
              <b className="text-sm">{t}</b><p className="mt-1 text-xs text-stone-500">{h}</p>
            </label>
          ))}
        </div>
        {d.provider === 'cloudinary' && (
          <>
            <ol className="list-decimal space-y-1 rounded-xl bg-stone-50 p-4 pl-8 text-sm text-stone-600">
              <li>Create a free account at <a className="text-royal-700 underline" href="https://cloudinary.com/users/register_free" target="_blank" rel="noreferrer">cloudinary.com</a>.</li>
              <li>Copy your <b>Cloud name</b> from the Cloudinary dashboard.</li>
              <li>Settings → <b>Upload</b> → <b>Add upload preset</b> → Signing mode: <b>Unsigned</b> → Folder: <code>togg-prayer</code> → Save, and copy the preset name.</li>
              <li>Paste both below and press Save. The record button then appears on the prayer form.</li>
            </ol>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Cloud name"><Input value={d.cloudName} onChange={(e) => setD({ ...d, cloudName: e.target.value })} placeholder="e.g. togg-church" /></Field>
              <Field label="Unsigned upload preset"><Input value={d.uploadPreset} onChange={(e) => setD({ ...d, uploadPreset: e.target.value })} placeholder="e.g. togg_prayer" /></Field>
            </div>
            <p className="text-xs text-stone-500">Privacy: each recording gets a long random web address that is only shown to church staff inside TOGG. Anyone who is given that exact link could play it.</p>
          </>
        )}
        <div className="flex justify-end"><Button type="submit">Save</Button></div>
      </Card>
    </form>
  );
}

function PaystackKeys() {
  const toast = useToast();
  const saved = usePayments();
  const [pk, setPk] = useState<string | null>(null);
  const [sk, setSk] = useState('');
  const [skSet, setSkSet] = useState<boolean | null>(null);
  const [server, setServer] = useState('');
  useEffect(() => { if (pk === null && saved) setPk(saved.paystackPublicKey ?? ''); }, [saved, pk]);
  useEffect(() => {
    getDoc(doc(db, 'settings', 'paystackKeyStatus')).then((x) => setSkSet(!!x.data()?.set)).catch(() => setSkSet(null));
    getDoc(doc(db, 'settings', 'server')).then((x) => setServer(String(x.data()?.relayUrl ?? ''))).catch(() => {});
  }, []);
  if (pk === null) return null;
  async function save(e: FormEvent) {
    e.preventDefault();
    const p = pk!.trim(), s = sk.trim();
    if (p && !/^pk_(live|test)_/.test(p)) { toast('err', 'The public key starts with pk_live_ or pk_test_.'); return; }
    if (s && !/^sk_(live|test)_/.test(s)) { toast('err', 'The secret key starts with sk_live_ or sk_test_.'); return; }
    if (p && s && p.slice(3, 7) !== s.slice(3, 7)) { toast('err', 'Use both LIVE keys or both TEST keys.'); return; }
    try {
      await setDoc(doc(db, 'settings', 'payments'), { paystackPublicKey: p }, { merge: true });
      if (s) {
        await setDoc(doc(db, 'secrets', 'paystack'), { secretKey: s, updatedAt: serverTimestamp() });
        await setDoc(doc(db, 'settings', 'paystackKeyStatus'), { set: true, mode: s.slice(3, 7), at: serverTimestamp() });
        setSk(''); setSkSet(true);
      }
      toast('ok', 'Paystack saved.');
    } catch (err) { toast('err', errorText(err)); }
  }
  return (
    <form onSubmit={save} className="mt-6">
      <Card className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-stone-900">Paystack — online giving (MoMo &amp; card)</h2>
          {pk.startsWith('pk_test_') && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">TEST keys — no real money</span>}
          {pk.startsWith('pk_live_') && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">LIVE</span>}
        </div>
        <ol className="list-decimal space-y-1 rounded-xl bg-stone-50 p-4 pl-8 text-sm text-stone-600">
          <li>Log in at <a className="text-royal-700 underline" href="https://dashboard.paystack.com" target="_blank" rel="noreferrer">dashboard.paystack.com</a> → <b>Settings → API Keys &amp; Webhooks</b>.</li>
          <li>Copy the <b>Public key</b> and the <b>Secret key</b> below (start with Test keys, switch to Live when ready).</li>
          <li>Set the <b>Webhook URL</b> on that page to your SMS server address{server ? <>: <code className="break-all">{server}</code></> : ' (see SMS messages → SMS provider)'} — payments then confirm instantly.</li>
        </ol>
        <Field label="Public key"><Input value={pk} onChange={(e) => setPk(e.target.value)} placeholder="pk_live_…" /></Field>
        <Field label="Secret key" hint={skSet ? 'A secret key is saved. Type a new one only to replace it — it can never be shown again.' : 'Only the server can read it — used to confirm every payment with Paystack.'}>
          <Input type="password" autoComplete="off" value={sk} onChange={(e) => setSk(e.target.value)} placeholder={skSet ? '•••••••• (saved)' : 'sk_live_…'} />
        </Field>
        <p className="text-xs text-stone-500">Payments are only recorded after the server confirms them with Paystack, using the amount Paystack actually received. Paystack's fee is noted on each record.</p>
        <div className="flex justify-end"><Button type="submit">Save Paystack</Button></div>
      </Card>
    </form>
  );
}

/** Head Pastor: automatic sign-out and how often reminders ring again. */
function SecurityCard() {
  const toast = useToast();
  const { profile } = useAuth();
  const saved = useSecuritySettings();
  const [d, setD] = useState<SecuritySettings | null>(null);
  useEffect(() => { setD(saved); }, [saved]);
  if (!d) return null;
  const head = profile?.role === 'head_pastor';
  async function save(e: FormEvent) {
    e.preventDefault();
    try { await setDoc(doc(db, 'settings', 'security'), { idleMinutes: Number(d!.idleMinutes) || 0, reminderRepeatMinutes: Number(d!.reminderRepeatMinutes) || 0, by: profile?.displayName ?? '', at: serverTimestamp() }); toast('ok', 'Saved for everyone.'); }
    catch (err) { toast('err', errorText(err)); }
  }
  return (
    <form onSubmit={save} className="mt-6">
      <Card className="space-y-4 p-6">
        <h2 className="font-semibold text-stone-900">Security &amp; reminders</h2>
        {!head && <p className="text-sm text-stone-500">Only the Head Pastor can change these.</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Sign out when left unattended for" hint="Minutes without any click, typing or scrolling. 0 = never.">
            <Select disabled={!head} value={String(d.idleMinutes)} onChange={(e) => setD({ ...d, idleMinutes: Number(e.target.value) })}>
              {[5, 10, 15, 20, 30, 45, 60, 120, 0].map((n) => <option key={n} value={n}>{n ? `${n} minutes` : 'Never'}</option>)}
            </Select>
          </Field>
          <Field label="Ring again for due reminders every" hint="Reminders keep ringing until they are marked done. 0 = ring once.">
            <Select disabled={!head} value={String(d.reminderRepeatMinutes)} onChange={(e) => setD({ ...d, reminderRepeatMinutes: Number(e.target.value) })}>
              {[1, 5, 10, 15, 30, 60, 120, 0].map((n) => <option key={n} value={n}>{n ? `${n} minute${n > 1 ? 's' : ''}` : 'Ring once only'}</option>)}
            </Select>
          </Field>
        </div>
        {head && <div className="flex justify-end"><Button type="submit">Save</Button></div>}
      </Card>
    </form>
  );
}
