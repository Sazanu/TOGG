import { useEffect, useState, type FormEvent } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { ExternalLink } from 'lucide-react';
import { Button, Card, Field, Input, PageHeader, Textarea, errorText, useToast } from '../components/ui';
import { db, firebaseConfig } from '../lib/firebase';
import { publicBase, usePayments } from '../lib/settings';
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
    </div>
  );
}
