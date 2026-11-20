import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDoc, collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { Bell, BellRing, Check, Clock, Plus, Volume2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { monthKey, prettyDate, today } from '../lib/format';
import { askPopUps, canPopUp, playChime, popUp, unlockSound } from '../lib/notify';
import { attentionItems, useOpenPastorNotes } from '../lib/pastoral';
import { can } from '../lib/roles';
import type { Reminder } from '../lib/types';
import { usePrayerRequests } from '../pages/Prayer';
import { useMonthReports } from '../pages/Reports';
import { Button, Field, Input, Modal, Textarea, cx, errorText, useToast } from './ui';
import { useSecuritySettings } from './IdleLogout';

interface Item { id: string; kind: 'reminder' | 'pastoral' | 'prayer' | 'report'; title: string; detail: string; link: string; reminderId?: string; noteId?: string }

const nowLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const SEEN_KEY = 'togg.notified';

/** The bell: due reminders + things waiting for this person. Rings and pops up when something new arrives. */
export function NotificationBell({ light }: { light?: boolean }) {
  const { profile } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [clock, setClock] = useState(nowLocal());
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const isHead = profile?.role === 'head_pastor';
  const notes = useOpenPastorNotes(isHead);
  const { requests } = usePrayerRequests();
  const reviewer = can(profile?.role, 'reports.review');
  const reports = useMonthReports(monthKey(), profile?.branchId ?? 'all', reviewer ? null : []) ?? [];

  useEffect(() => { const t = setInterval(() => setClock(nowLocal()), 30_000); return () => clearInterval(t); }, []);
  useEffect(() => {
    // Browsers only allow sound after the person has clicked somewhere once.
    const unlock = () => unlockSound();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);
  useEffect(() => {
    if (!profile) return;
    return onSnapshot(query(collection(db, 'reminders'), where('ownerUid', '==', profile.uid), where('done', '==', false)),
      (s) => setReminders(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Reminder)), (e) => console.error('reminders', e));
  }, [profile?.uid]);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    reminders.filter((r) => r.remindAt <= clock).sort((a, b) => a.remindAt.localeCompare(b.remindAt))
      .forEach((r) => out.push({ id: `r-${r.id}-${r.remindAt}`, kind: 'reminder', title: r.title, detail: r.note || `Set for ${r.remindAt.replace('T', ' ')}`, link: r.link || '', reminderId: r.id }));
    if (isHead) attentionItems(notes).forEach((n) => out.push({ id: `p-${n.id}`, kind: 'pastoral', title: n.memberName ? `${n.memberName} · ${n.area}` : n.area, detail: n.rating ? 'Marked: needs improvement' : n.note || `Reminder from ${prettyDate(n.remindOn)}`, link: n.memberId ? `/members/${n.memberId}` : '/', noteId: n.id }));
    requests.filter((r) => r.status === 'new').slice(0, 20).forEach((r) => out.push({ id: `q-${r.id}`, kind: 'prayer', title: r.kind === 'testimony' ? `Testimony from ${r.name || 'a member'}` : `Prayer request from ${r.name || 'a member'}`, detail: (r.text || (r.mediaType ? `${r.mediaType} message` : '')).slice(0, 90), link: '/prayer-requests' }));
    if (reviewer) reports.filter((r) => r.status === 'submitted').forEach((r) => out.push({ id: `d-${r.id}`, kind: 'report', title: 'Department report to review', detail: `${r.type} · submitted by ${r.submittedByName || 'department head'}`, link: `/reports/edit?dept=${r.departmentId}&branch=${r.branchId}&month=${r.month}&type=${r.type}` }));
    return out;
  }, [reminders, clock, isHead, notes, requests, reviewer, reports]);

  // Ring + pop up for anything not announced before (remembered on this device).
  const first = useRef(true);
  useEffect(() => {
    let seen: string[] = [];
    try { seen = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]'); } catch { /* */ }
    const fresh = items.filter((i) => !seen.includes(i.id));
    if (fresh.length) {
      if (!first.current || fresh.some((i) => i.kind === 'reminder' || i.kind === 'pastoral')) {
        playChime();
        fresh.slice(0, 3).forEach((i) => popUp(i.title, i.detail, () => i.link && nav(i.link)));
      }
      try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, ...fresh.map((i) => i.id)].slice(-500))); } catch { /* */ }
    }
    first.current = false;
  }, [items, nav]);

  // Keep ringing for due reminders (and the Head Pastor's attention items) at the interval the Head Pastor set.
  const { reminderRepeatMinutes } = useSecuritySettings();
  const urgent = items.filter((i) => i.kind === 'reminder' || i.kind === 'pastoral');
  const urgentRef = useRef(urgent); urgentRef.current = urgent;
  useEffect(() => {
    if (!reminderRepeatMinutes || reminderRepeatMinutes <= 0) return;
    const t = setInterval(() => {
      const u = urgentRef.current;
      if (!u.length) return;
      playChime();
      popUp(u.length === 1 ? `Reminder: ${u[0].title}` : `${u.length} reminders waiting`, u.length === 1 ? u[0].detail : u.slice(0, 3).map((x) => x.title).join(' · '), () => u[0].link && nav(u[0].link));
    }, reminderRepeatMinutes * 60_000);
    return () => clearInterval(t);
  }, [reminderRepeatMinutes, nav]);

  async function done(i: Item) {
    try {
      if (i.reminderId) await updateDoc(doc(db, 'reminders', i.reminderId), { done: true });
      if (i.noteId) await updateDoc(doc(db, 'pastorNotes', i.noteId), { done: true });
    } catch (e) { toast('err', errorText(e)); }
  }
  async function snooze(i: Item) {
    if (!i.reminderId) return;
    const d = new Date(Date.now() + 60 * 60_000);
    const at = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    try { await updateDoc(doc(db, 'reminders', i.reminderId), { remindAt: at }); } catch (e) { toast('err', errorText(e)); }
  }

  const upcoming = reminders.filter((r) => r.remindAt > clock).sort((a, b) => a.remindAt.localeCompare(b.remindAt)).slice(0, 5);
  return (
    <div className="relative">
      <button onClick={() => { setOpen(!open); unlockSound(); }} aria-label={`Notifications (${items.length})`}
        className={cx('relative rounded-xl p-2 transition', light ? 'text-royal-200 hover:bg-royal-900 hover:text-white' : 'text-royal-900 hover:bg-stone-100')}>
        {items.length ? <BellRing className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
        {items.length > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">{items.length > 99 ? '99+' : items.length}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="fixed left-2 right-2 top-16 z-50 max-h-[75vh] overflow-y-auto rounded-2xl border border-stone-200 bg-white text-stone-800 shadow-2xl sm:absolute sm:left-0 sm:right-auto sm:top-12 sm:w-96">
            <div className="sticky top-0 flex items-center justify-between border-b border-stone-100 bg-white px-4 py-3">
              <b className="text-sm">Notifications</b>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => { playChime(); askPopUps().then((ok) => toast(ok ? 'ok' : 'err', ok ? 'Sound and pop-ups are on.' : 'Pop-ups are blocked in this browser; the sound still works.')); }} title="Test sound and allow pop-ups"><Volume2 className="h-4 w-4" /></Button>
                <Button size="sm" variant="outline" onClick={() => { setAdding(true); setOpen(false); }}><Plus className="h-4 w-4" /> Reminder</Button>
              </div>
            </div>
            {items.length === 0 ? <p className="px-4 py-6 text-center text-sm text-stone-400">You are all caught up.</p> : (
              <ul className="divide-y divide-stone-100">
                {items.map((i) => (
                  <li key={i.id} className="px-4 py-3">
                    <button className="block w-full text-left" onClick={() => { if (i.link) { nav(i.link); setOpen(false); } }}>
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-gold-700">{{ reminder: 'Reminder', pastoral: 'For your attention', prayer: 'Prayer & testimony', report: 'To review' }[i.kind]}</div>
                      <div className="text-sm font-medium text-stone-900">{i.title}</div>
                      {i.detail && <div className="text-xs text-stone-500">{i.detail}</div>}
                    </button>
                    {(i.reminderId || i.noteId) && (
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => done(i)}><Check className="h-3.5 w-3.5" /> Done</Button>
                        {i.reminderId && <Button size="sm" variant="ghost" onClick={() => snooze(i)}><Clock className="h-3.5 w-3.5" /> In 1 hour</Button>}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {upcoming.length > 0 && (
              <div className="border-t border-stone-100 px-4 py-3">
                <div className="mb-1 text-[11px] font-semibold uppercase text-stone-400">Coming up</div>
                {upcoming.map((r) => <div key={r.id} className="text-xs text-stone-600">{r.remindAt.replace('T', ' ')} — {r.title}</div>)}
              </div>
            )}
            {canPopUp() && Notification.permission !== 'granted' && <p className="border-t border-stone-100 px-4 py-2 text-[11px] text-stone-500">Tip: press the 🔊 button to allow pop-up alerts on this computer.</p>}
          </div>
        </>
      )}
      {adding && <NewReminder onClose={() => setAdding(false)} />}
    </div>
  );
}

export function NewReminder({ onClose, defaultTitle = '', link = '' }: { onClose: () => void; defaultTitle?: string; link?: string }) {
  const { profile } = useAuth();
  const toast = useToast();
  const [title, setTitle] = useState(defaultTitle);
  const [note, setNote] = useState('');
  const [when, setWhen] = useState(`${today()}T${String(Math.min(23, new Date().getHours() + 1)).padStart(2, '0')}:00`);
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      await addDoc(collection(db, 'reminders'), { ownerUid: profile?.uid, title: title.trim(), note: note.trim(), remindAt: when, link, done: false, createdAt: serverTimestamp() });
      toast('ok', `Reminder set for ${when.replace('T', ' at ')}. The bell will ring.`); onClose();
    } catch (err) { toast('err', errorText(err)); setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title="New reminder">
      <form onSubmit={save} className="space-y-4">
        <Field label="Remind me to"><Input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Call the choir leader about Sunday" /></Field>
        <Field label="Note (optional)"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <Field label="When"><Input type="datetime-local" required value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
        <p className="text-xs text-stone-500">When the time comes, the bell rings with a sound and a pop-up while TOGG is open on any of your devices.</p>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy}>Save reminder</Button></div>
      </form>
    </Modal>
  );
}
