import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, Check, Maximize, Minus, Plus, QrCode, Search, UserPlus, X } from 'lucide-react';
import { Crest } from '../components/Logo';
import { cx, errorText, useToast } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { phoneKey, useSelfCheckins, useServiceCheckin, type SelfCheckIn } from '../lib/attendance';
import { db } from '../lib/firebase';
import { initials, prettyDate } from '../lib/format';
import { playChime } from '../lib/notify';
import { publicBase, usePayments } from '../lib/settings';
import type { Member } from '../lib/types';

/** Full-screen check-in for the usher's tablet or phone at the church door. */
export default function Station() {
  const { serviceId = '' } = useParams();
  const { profile } = useAuth();
  const { members, scope, setScope, canSwitchScope, branchName } = useData();
  const toast = useToast();
  const payments = usePayments();
  const s = useServiceCheckin(serviceId, members, profile?.uid);
  const selfReqs = useSelfCheckins(serviceId, s.service?.branchId);
  const [q, setQ] = useState('');
  const [flash, setFlash] = useState<string>('');
  const [newOne, setNewOne] = useState<{ name: string; phone: string } | null>(null);
  const [showQr, setShowQr] = useState(true);
  const input = useRef<HTMLInputElement>(null);
  const results = s.search(q, 9);

  // Global admins: make sure this branch's members are loaded.
  useEffect(() => { if (s.service && canSwitchScope && scope !== s.service.branchId) setScope(s.service.branchId); }, [s.service, canSwitchScope, scope, setScope]);

  async function tap(m: Member, method: 'station' | 'self' = 'station') {
    try {
      const added = await s.checkIn(m, method);
      setFlash(added ? `✓ ${m.firstName} ${m.lastName}` : `${m.firstName} is already in`);
      if (added) playChime();
      setTimeout(() => setFlash(''), 1800);
      setQ(''); input.current?.focus();
    } catch (e) { toast('err', errorText(e)); }
  }

  // Phones that scanned the QR code: match by phone number and check them in automatically.
  const handled = useRef(new Set<string>());
  const unmatched = useMemo(() => selfReqs.filter((r) => !s.branchMembers.some((m) => phoneKey(m.phone) && phoneKey(m.phone) === r.phoneKey)), [selfReqs, s.branchMembers]);
  useEffect(() => {
    selfReqs.forEach(async (r) => {
      if (handled.current.has(r.id)) return;
      const m = s.branchMembers.find((x) => phoneKey(x.phone) && phoneKey(x.phone) === r.phoneKey);
      if (!m) return;
      handled.current.add(r.id);
      try { await tap(m, 'self'); await updateDoc(doc(db, 'selfCheckins', r.id), { status: 'done', memberId: m.id, handledAt: serverTimestamp() }); }
      catch (e) { handled.current.delete(r.id); console.error(e); }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selfReqs, s.branchMembers]);

  async function resolve(r: SelfCheckIn, how: 'visitor' | 'dismiss') {
    try {
      handled.current.add(r.id); // the new visitor's phone would otherwise auto-match this same request
      if (how === 'visitor') {
        const id = await s.addVisitor(r.name || 'Visitor', r.phone, 'self');
        await updateDoc(doc(db, 'selfCheckins', r.id), { status: 'done', memberId: id, handledAt: serverTimestamp() });
        playChime(); setFlash(`✓ ${r.name || 'Visitor'} — welcome!`); setTimeout(() => setFlash(''), 1800);
      } else await updateDoc(doc(db, 'selfCheckins', r.id), { status: 'dismissed', handledAt: serverTimestamp() });
    } catch (e) { handled.current.delete(r.id); toast('err', errorText(e)); }
  }

  if (s.service === undefined) return <div className="flex min-h-screen items-center justify-center bg-royal-950 text-royal-200">Loading…</div>;
  if (s.service === null) return <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-royal-950 text-white">Service not found <Link to="/attendance" className="underline">Back</Link></div>;
  const svc = s.service;
  const total = (svc.count || 0) + (svc.visitors || 0);
  const qrUrl = `${publicBase(payments)}/here/${serviceId}?b=${svc.branchId}`;

  return (
    <div className="min-h-screen bg-royal-950 text-white">
      <header className="flex flex-wrap items-center gap-3 border-b border-royal-900 px-4 py-3 sm:px-6">
        <Link to={`/attendance/${serviceId}`} className="rounded-lg p-2 text-royal-300 hover:bg-royal-900" aria-label="Exit station"><ArrowLeft className="h-5 w-5" /></Link>
        <Crest className="h-10 w-10" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-lg font-bold">{svc.title || svc.type}</div>
          <div className="truncate text-xs text-royal-300">{prettyDate(svc.date)} · {branchName(svc.branchId)} · check-in station</div>
        </div>
        <div className="text-right"><div className="font-display text-4xl font-extrabold text-gold-400" aria-label="Total in church">{total}</div><div className="text-[11px] text-royal-300">{svc.count || 0} named · {svc.visitors || 0} head-count</div></div>
        <button onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})} className="hidden rounded-lg p-2 text-royal-300 hover:bg-royal-900 sm:block" title="Full screen" aria-label="Full screen"><Maximize className="h-5 w-5" /></button>
      </header>

      <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-5 top-1/2 h-7 w-7 -translate-y-1/2 text-royal-400" />
            <input ref={input} autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) tap(results[0]); }}
              placeholder="Type a name or phone number…" aria-label="Search member"
              className="w-full rounded-3xl border-4 border-gold-400 bg-white py-5 pl-16 pr-5 text-2xl text-stone-900 outline-none placeholder:text-stone-400" />
          </div>
          {flash && <div className="mt-4 rounded-2xl bg-emerald-500 px-5 py-4 text-center text-2xl font-bold">{flash}</div>}
          {q.trim() && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {results.map((m) => {
                const here = s.present.has(m.id);
                return (
                  <button key={m.id} onClick={() => tap(m)} className={cx('flex items-center gap-3 rounded-2xl p-4 text-left transition', here ? 'bg-emerald-600/30 ring-2 ring-emerald-400' : 'bg-white text-stone-900 hover:ring-4 hover:ring-gold-400')}>
                    <span className={cx('flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold', here ? 'bg-emerald-500 text-white' : 'bg-royal-100 text-royal-800')}>{here ? <Check className="h-7 w-7" /> : initials(m.firstName, m.lastName)}</span>
                    <span className="min-w-0"><span className="block truncate text-lg font-semibold">{m.title ? `${m.title} ` : ''}{m.firstName} {m.lastName}</span>
                      <span className={cx('block text-sm', here ? 'text-emerald-200' : 'text-stone-500')}>{here ? 'Already checked in' : m.phone ? `…${m.phone.replace(/\D/g, '').slice(-3)}` : m.category}</span></span>
                  </button>
                );
              })}
              <button onClick={() => setNewOne({ name: q.trim(), phone: '' })} className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-royal-600 p-4 text-left text-royal-100 hover:border-gold-400">
                <UserPlus className="h-8 w-8 shrink-0 text-gold-400" /><span><b className="block">First time here?</b><span className="text-sm text-royal-300">Add “{q.trim()}” as a visitor</span></span>
              </button>
            </div>
          )}
          {!q.trim() && <p className="mt-6 text-center text-royal-300">Type the first few letters of a name, or the last digits of a phone number, then tap the person. Press Enter to check in the first match.</p>}

          <div className="mt-6 flex items-center justify-center gap-4 rounded-2xl bg-royal-900 p-4">
            <span className="text-sm text-royal-200">Head-count of guests (not named)</span>
            <button onClick={() => s.bumpVisitors(-1)} className="rounded-xl bg-royal-800 p-3" aria-label="One less guest"><Minus className="h-5 w-5" /></button>
            <span className="w-12 text-center font-display text-3xl font-bold">{svc.visitors || 0}</span>
            <button onClick={() => s.bumpVisitors(1)} className="rounded-xl bg-gold-400 p-3 text-royal-950" aria-label="One more guest"><Plus className="h-5 w-5" /></button>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-3xl bg-white p-5 text-center text-stone-900">
            <button onClick={() => setShowQr(!showQr)} className="mb-2 flex w-full items-center justify-center gap-2 font-semibold"><QrCode className="h-5 w-5 text-royal-700" /> Scan to check yourself in</button>
            {showQr && <><div className="inline-block rounded-2xl border border-stone-200 p-3"><QRCodeSVG value={qrUrl} size={190} fgColor="#0a2b40" /></div><p className="mt-2 text-xs text-stone-500">Members type their phone number — they appear here automatically.</p></>}
          </div>
          {unmatched.length > 0 && (
            <div className="rounded-3xl bg-amber-50 p-4 text-stone-900">
              <div className="mb-2 font-semibold">Checked in by phone — not found</div>
              {unmatched.map((r) => (
                <div key={r.id} className="mb-2 rounded-xl bg-white p-3 text-sm">
                  <b>{r.name || 'No name'}</b> · {r.phone}
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => resolve(r, 'visitor')} className="rounded-lg bg-royal-800 px-3 py-1.5 text-xs text-white">Add as visitor</button>
                    <button onClick={() => { setQ(r.name); resolve(r, 'dismiss'); }} className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs">Find by name</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="rounded-3xl bg-royal-900 p-4">
            <div className="mb-2 text-sm font-semibold text-royal-200">Just arrived ({s.checkins.length})</div>
            <ul className="max-h-[45vh] space-y-1.5 overflow-y-auto">
              {s.checkins.slice(0, 40).map((c) => (
                <li key={c.id} className="flex items-center gap-2 rounded-xl bg-royal-950/60 px-3 py-2 text-sm">
                  <span className="flex-1 truncate">{c.name}{(c as { method?: string }).method === 'self' && <span className="ml-1 text-[10px] text-gold-300">(phone)</span>}</span>
                  <span className="text-[11px] text-royal-400">{c.at ? c.at.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'now'}</span>
                  <button onClick={() => s.undo(c)} className="text-royal-500 hover:text-red-400" aria-label={`Undo ${c.name}`}><X className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      {newOne && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setNewOne(null)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={async (e) => { e.preventDefault(); try { await s.addVisitor(newOne.name, newOne.phone, 'station'); playChime(); setFlash(`✓ Welcome ${newOne.name.split(' ')[0]}!`); setTimeout(() => setFlash(''), 1800); setNewOne(null); setQ(''); } catch (err) { toast('err', errorText(err)); } }}
            className="w-full max-w-md space-y-4 rounded-3xl bg-white p-6 text-stone-900">
            <h2 className="font-display text-xl font-bold">Welcome! First time here</h2>
            <input required autoFocus value={newOne.name} onChange={(e) => setNewOne({ ...newOne, name: e.target.value })} placeholder="Full name" className="w-full rounded-2xl border border-stone-300 px-4 py-3 text-lg" />
            <input value={newOne.phone} onChange={(e) => setNewOne({ ...newOne, phone: e.target.value })} placeholder="Phone (for a welcome SMS)" inputMode="tel" className="w-full rounded-2xl border border-stone-300 px-4 py-3 text-lg" />
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setNewOne(null)} className="rounded-xl px-4 py-2">Cancel</button><button type="submit" className="rounded-xl bg-royal-800 px-5 py-2 font-semibold text-white">Check in</button></div>
          </form>
        </div>
      )}
    </div>
  );
}
