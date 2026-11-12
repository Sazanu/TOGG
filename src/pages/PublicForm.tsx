import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { addDoc, collection, getDocs, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { CheckCircle2 } from 'lucide-react';
import { Crest } from '../components/Logo';
import { Button, Card, Field, Input, Select, Textarea, errorText } from '../components/ui';
import { db } from '../lib/firebase';
import type { Branch, MemberCategory } from '../lib/types';

export default function PublicForm({ kind }: { kind: 'member' | 'visitor' }) {
  const [params] = useSearchParams();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [d, setD] = useState({
    firstName: '', lastName: '', phone: '', email: '', gender: '', category: 'adult' as MemberCategory,
    branchId: params.get('branch') ?? '', invitedBy: '', prayerRequest: '',
  });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getDocs(query(collection(db, 'branches'), orderBy('name'))).then((s) => {
      const list = s.docs.map((x) => ({ id: x.id, ...x.data() }) as Branch);
      setBranches(list);
      if (!d.branchId && list.length === 1) setD((p) => ({ ...p, branchId: list[0].id }));
    }).catch(() => setError('Could not load branches. Please try again later.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await addDoc(collection(db, 'registrations'), {
        kind,
        firstName: d.firstName.trim().slice(0, 60),
        lastName: d.lastName.trim().slice(0, 60),
        phone: d.phone.trim().slice(0, 30),
        email: d.email.trim().slice(0, 120),
        gender: d.gender,
        category: d.category,
        branchId: d.branchId,
        invitedBy: d.invitedBy.trim().slice(0, 120),
        prayerRequest: d.prayerRequest.trim().slice(0, 2000),
        status: 'new',
        createdAt: serverTimestamp(),
      });
      setDone(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const set = (k: keyof typeof d, v: string) => setD((p) => ({ ...p, [k]: v }));

  return (
    <div className="min-h-screen bg-gradient-to-b from-royal-950 via-royal-900 to-cream to-[22rem] px-4 py-10">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 text-center text-white">
          <Crest className="mx-auto mb-3 h-14 w-14" />
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-300">Throne of God's Grace</p>
          <h1 className="mt-2 font-display text-3xl font-extrabold">{kind === 'member' ? 'Member registration' : 'Welcome, friend!'}</h1>
          <p className="mt-2 text-sm text-royal-200">
            {kind === 'member' ? 'Fill in your details to join the church family.' : "We're so glad you worshipped with us today. Tell us a little about you."}
          </p>
        </div>
        <Card className="p-6">
          {done ? (
            <div className="py-8 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
              <h2 className="mt-4 font-display text-xl font-bold text-royal-950">Thank you{d.firstName ? `, ${d.firstName}` : ''}!</h2>
              <p className="mt-2 text-sm text-stone-500">{kind === 'member' ? 'The church office will confirm your registration.' : 'Someone from the church will reach out to you. God bless you!'}</p>
              <Button variant="outline" className="mt-6" onClick={() => { setDone(false); setD({ ...d, firstName: '', lastName: '', phone: '', email: '', invitedBy: '', prayerRequest: '' }); }}>Submit another</Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="First name"><Input required maxLength={60} value={d.firstName} onChange={(e) => set('firstName', e.target.value)} /></Field>
                <Field label="Last name"><Input required maxLength={60} value={d.lastName} onChange={(e) => set('lastName', e.target.value)} /></Field>
              </div>
              <Field label="Phone"><Input required maxLength={30} inputMode="tel" value={d.phone} onChange={(e) => set('phone', e.target.value)} placeholder="024 000 0000" /></Field>
              <Field label="Email (optional)"><Input type="email" maxLength={120} value={d.email} onChange={(e) => set('email', e.target.value)} /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Gender">
                  <Select value={d.gender} onChange={(e) => set('gender', e.target.value)}>
                    <option value="">—</option><option value="male">Male</option><option value="female">Female</option>
                  </Select>
                </Field>
                <Field label="Age group">
                  <Select value={d.category} onChange={(e) => set('category', e.target.value)}>
                    <option value="adult">Adult (18+)</option><option value="teen">Teen (13–17)</option><option value="child">Child (0–12)</option>
                  </Select>
                </Field>
              </div>
              <Field label="Branch">
                <Select required value={d.branchId} onChange={(e) => set('branchId', e.target.value)}>
                  <option value="">Choose your branch…</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}{b.location ? ` — ${b.location}` : ''}</option>)}
                </Select>
              </Field>
              {kind === 'visitor' && (
                <>
                  <Field label="Who invited you? (optional)"><Input maxLength={120} value={d.invitedBy} onChange={(e) => set('invitedBy', e.target.value)} /></Field>
                  <Field label="Prayer request (optional)"><Textarea maxLength={2000} value={d.prayerRequest} onChange={(e) => set('prayerRequest', e.target.value)} /></Field>
                </>
              )}
              {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              <Button type="submit" variant="primary" loading={busy} className="w-full">Submit</Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
