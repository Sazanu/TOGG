import { useEffect, useState, type FormEvent } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { ExternalLink } from 'lucide-react';
import { Button, Card, Field, Input, PageHeader, Textarea, errorText, useToast } from '../components/ui';
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
