import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { collection, doc, getDocs, onSnapshot, orderBy, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { CheckCircle2, CreditCard, Loader2, ShieldCheck, Smartphone } from 'lucide-react';
import { HowToPay } from '../components/HowToPay';
import { FullLogo } from '../components/Logo';
import { Button, Card, Field, Input, Select, errorText } from '../components/ui';
import { phoneKey } from '../lib/attendance';
import { db, functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { money } from '../lib/format';
import { PURPOSES, loadPaystack, newReference, payWithPaystack } from '../lib/paystack';
import { usePayments } from '../lib/settings';
import { wakeSmsServer } from '../lib/sms';
import type { Branch, OnlineGift, OnlinePurpose, Project } from '../lib/types';

export default function PublicPay() {
  const [params] = useSearchParams();
  const p = usePayments();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const initial = (PURPOSES.find((x) => x.value === params.get('for'))?.value ?? 'tithe') as OnlinePurpose;
  const [d, setD] = useState({ purpose: initial, projectId: params.get('project') ?? '', branchId: params.get('branch') ?? '', name: '', phone: '', email: '', amount: params.get('amount') ?? '' });
  const [stage, setStage] = useState<'form' | 'paying' | 'confirming' | 'done' | 'failed'>('form');
  const [ref, setRef] = useState('');
  const [gift, setGift] = useState<OnlineGift | null>(null);
  const [error, setError] = useState('');
  const online = !!p.paystackPublicKey;
  const label = PURPOSES.find((x) => x.value === d.purpose)?.label ?? 'Giving';

  useEffect(() => {
    getDocs(query(collection(db, 'branches'), orderBy('name'))).then((s) => { const l = s.docs.map((x) => ({ id: x.id, ...x.data() }) as Branch); setBranches(l); if (!d.branchId && l.length === 1) setD((v) => ({ ...v, branchId: l[0].id })); }).catch(() => {});
    getDocs(query(collection(db, 'projects'), where('public', '==', true))).then((s) => setProjects(s.docs.map((x) => ({ id: x.id, ...x.data() }) as Project).filter((x) => x.status !== 'completed'))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Wait for the server to confirm the payment with Paystack.
  useEffect(() => {
    if (!ref || stage === 'form') return;
    return onSnapshot(doc(db, 'onlineGifts', ref), (s) => {
      const g = s.exists() ? ({ id: s.id, ...s.data() } as OnlineGift) : null;
      setGift(g);
      if (g?.status === 'success') setStage('done');
      if (g?.status === 'failed') setStage('failed');
    }, () => {});
  }, [ref, stage]);

  // Never leave the giver stuck on a spinner: after 20 s show the receipt and a way out.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (stage !== 'confirming') { setSlow(false); return; }
    const t = setTimeout(() => setSlow(true), 20_000);
    return () => clearTimeout(t);
  }, [stage]);

  async function give(e: FormEvent) {
    e.preventDefault();
    const amount = Math.round(Number(d.amount) * 100) / 100;
    if (!(amount >= 1)) { setError('Enter an amount of at least GH₵1.'); return; }
    if (d.purpose === 'project' && !d.projectId) { setError('Choose the project.'); return; }
    if (phoneKey(d.phone).length < 9) { setError('Enter your phone number.'); return; }
    setError('');
    const reference = newReference();
    try {
      await loadPaystack();
      await setDoc(doc(db, 'onlineGifts', reference), {
        purpose: d.purpose, projectId: d.purpose === 'project' ? d.projectId : '', branchId: d.branchId, name: d.name.trim().slice(0, 80),
        phone: d.phone.trim().slice(0, 30), phoneKey: phoneKey(d.phone), email: d.email.trim().slice(0, 120), amount, currency: 'GHS', status: 'pending', createdAt: serverTimestamp(),
      });
      setRef(reference); setStage('paying');
      const email = d.email.trim() || `${phoneKey(d.phone) || 'giver'}@example.com`; // reserved domain: Paystack needs an email, receipts to it go nowhere
      const res = await payWithPaystack({ key: p.paystackPublicKey!, email, amount, reference, name: d.name.trim(), phone: d.phone.trim(), purposeLabel: label });
      if (res === 'closed') { setStage('form'); return; }
      setStage('confirming');
      // The free server (or Cloud Functions) asks Paystack itself before anything is recorded.
      const woke = await wakeSmsServer();
      if (!woke.delivered) httpsCallable(functions, 'confirmPayment')({ reference }).catch(() => { /* the 5-minute check will catch it */ });
    } catch (err) { setStage('form'); setError(errorText(err)); }
  }

  const set = (k: keyof typeof d, v: string) => setD((x) => ({ ...x, [k]: v }));
  return (
    <div className="min-h-screen bg-gradient-to-b from-royal-950 via-royal-900 via-[14rem] to-cream to-[26rem] px-4 py-10">
      <div className="mx-auto max-w-md">
        <div className="mb-6 text-center text-white">
          <div className="mx-auto mb-4 inline-block rounded-3xl bg-white p-3 shadow-xl"><FullLogo className="h-24" /></div>
          <h1 className="font-display text-3xl font-extrabold">Give</h1>
          <p className="mt-2 text-sm text-royal-200">“God loves a cheerful giver.” — 2 Corinthians 9:7</p>
        </div>
        {online && (
          <Card className="mb-5 p-6">
            {stage === 'done' && gift ? (
              <div className="py-4 text-center">
                <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
                <h2 className="mt-3 font-display text-xl font-bold text-royal-950">Thank you{gift.name ? `, ${gift.name.split(' ')[0]}` : ''}!</h2>
                <p className="mt-1 text-sm text-stone-600">{money(gift.amount)} for {PURPOSES.find((x) => x.value === gift.purpose)?.label.toLowerCase()} has been received and recorded.</p>
                <p className="mt-2 font-mono text-xs text-stone-400">Receipt: {gift.id}</p>
                <Button variant="outline" className="mt-5" onClick={() => { setStage('form'); setRef(''); setGift(null); set('amount', ''); }}>Give again</Button>
              </div>
            ) : stage === 'confirming' && slow ? (
              <div className="py-4 text-center">
                <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
                <h2 className="mt-3 font-display text-xl font-bold text-royal-950">Payment received by Paystack</h2>
                <p className="mt-1 text-sm text-stone-600">Thank you! It will appear in the church records once it is confirmed. Keep this receipt number:</p>
                <p className="mt-2 font-mono text-sm text-stone-700">{ref}</p>
                <div className="mt-5 flex justify-center gap-2">
                  <Button variant="outline" onClick={() => window.history.length > 1 ? window.history.back() : (window.location.href = '/')}>Back</Button>
                  <Button onClick={() => { setStage('form'); setRef(''); setGift(null); set('amount', ''); }}>Done</Button>
                </div>
              </div>
            ) : stage === 'confirming' || stage === 'paying' ? (
              <div className="py-8 text-center">
                <Loader2 className="mx-auto h-10 w-10 animate-spin text-royal-600" />
                <p className="mt-3 font-medium text-stone-800">{stage === 'paying' ? 'Complete the payment in the Paystack window…' : 'Confirming your payment with Paystack…'}</p>
                {stage === 'confirming' && <p className="mt-1 text-xs text-stone-500">This usually takes a few seconds. You can close this page — your gift will still be recorded. Reference: {ref}</p>}
              </div>
            ) : (
              <form onSubmit={give} className="space-y-4">
                {stage === 'failed' && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">That payment did not go through{gift?.error ? `: ${gift.error}` : ''}. You were not charged. Please try again.</p>}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Giving for"><Select value={d.purpose} onChange={(e) => set('purpose', e.target.value)}>{PURPOSES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</Select></Field>
                  <Field label="Amount (GH₵)"><Input required type="number" min={1} step="0.01" inputMode="decimal" value={d.amount} onChange={(e) => set('amount', e.target.value)} placeholder="0.00" className="!text-lg" /></Field>
                </div>
                {d.purpose === 'project' && (
                  <Field label="Project"><Select required value={d.projectId} onChange={(e) => set('projectId', e.target.value)}><option value="">Choose…</option>{projects.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</Select></Field>
                )}
                <Field label="Branch"><Select required value={d.branchId} onChange={(e) => set('branchId', e.target.value)}><option value="">Choose your branch…</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Your name"><Input required maxLength={80} value={d.name} onChange={(e) => set('name', e.target.value)} /></Field>
                  <Field label="Phone"><Input required maxLength={30} inputMode="tel" value={d.phone} onChange={(e) => set('phone', e.target.value)} placeholder="024…" /></Field>
                </div>
                <Field label="Email for your receipt (optional)"><Input type="email" maxLength={120} value={d.email} onChange={(e) => set('email', e.target.value)} /></Field>
                {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
                <Button type="submit" variant="gold" className="w-full !py-3 text-base">Give {d.amount ? money(Number(d.amount) || 0) : ''} securely</Button>
                <div className="flex items-center justify-center gap-3 text-xs text-stone-500">
                  <span className="flex items-center gap-1"><Smartphone className="h-3.5 w-3.5" /> MoMo</span><span className="flex items-center gap-1"><CreditCard className="h-3.5 w-3.5" /> Card</span>
                  <span className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" /> Secured by Paystack</span>
                </div>
              </form>
            )}
          </Card>
        )}
        <Card className="p-6">
          {online && <h2 className="mb-3 text-sm font-semibold text-stone-700">Or give directly</h2>}
          <HowToPay p={{ ...p, paymentLink: online ? '' : p.paymentLink }} reference={label} />
        </Card>
      </div>
    </div>
  );
}
