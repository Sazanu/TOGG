import { useState, type FormEvent } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { CheckCircle2 } from 'lucide-react';
import { FullLogo } from '../components/Logo';
import { Button, Card, Field, Input, errorText } from '../components/ui';
import { phoneKey } from '../lib/attendance';
import { db } from '../lib/firebase';

/** Members scan the QR code at the door and check themselves in with their phone number. */
export default function PublicHere() {
  const { serviceId = '' } = useParams();
  const [params] = useSearchParams();
  const branchId = params.get('b') ?? '';
  const [phone, setPhone] = useState(() => { try { return localStorage.getItem('togg.phone') ?? ''; } catch { return ''; } });
  const [name, setName] = useState(() => { try { return localStorage.getItem('togg.name') ?? ''; } catch { return ''; } });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (phoneKey(phone).length < 9) { setError('Please enter your full phone number.'); return; }
    setBusy(true); setError('');
    try {
      await addDoc(collection(db, 'selfCheckins'), { serviceId, branchId, phone: phone.trim().slice(0, 30), phoneKey: phoneKey(phone), name: name.trim().slice(0, 80), status: 'new', createdAt: serverTimestamp() });
      try { localStorage.setItem('togg.phone', phone.trim()); localStorage.setItem('togg.name', name.trim()); } catch { /* */ }
      setDone(true);
    } catch (err) { setError(errorText(err).includes('permission') ? 'This check-in link has expired. Please ask an usher.' : errorText(err)); }
    finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-royal-950 via-royal-900 via-[14rem] to-cream to-[26rem] px-4 py-10">
      <div className="mx-auto max-w-sm">
        <div className="mb-6 text-center text-white">
          <div className="mx-auto mb-4 inline-block rounded-3xl bg-white p-3 shadow-xl"><FullLogo className="h-20" /></div>
          <h1 className="font-display text-3xl font-extrabold">Welcome to church!</h1>
          <p className="mt-1 text-sm text-royal-200">Check yourself in for today's service.</p>
        </div>
        <Card className="p-6">
          {done ? (
            <div className="py-6 text-center">
              <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
              <h2 className="mt-3 font-display text-xl font-bold text-royal-950">You're checked in{name ? `, ${name.split(' ')[0]}` : ''}!</h2>
              <p className="mt-1 text-sm text-stone-500">God bless you. Enjoy the service.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <Field label="Your phone number"><Input required inputMode="tel" autoFocus value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="024 000 0000" className="!text-lg" /></Field>
              <Field label="Your name (first time? please add it)"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></Field>
              {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              <Button type="submit" loading={busy} className="w-full !py-3 text-base">I'm here</Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
