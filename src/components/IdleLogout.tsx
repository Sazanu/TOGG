import { useEffect, useRef, useState } from 'react';
import { signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

const KEY = 'togg.lastActive';
const now = () => Date.now();
const mark = () => { try { localStorage.setItem(KEY, String(now())); } catch { /* private mode */ } };
const last = (fallback: number) => { try { return Number(localStorage.getItem(KEY)) || fallback; } catch { return fallback; } };

/** Head Pastor's security settings (settings/security). */
export interface SecuritySettings { idleMinutes: number; reminderRepeatMinutes: number }
export const DEFAULT_SECURITY: SecuritySettings = { idleMinutes: 20, reminderRepeatMinutes: 15 };

export function useSecuritySettings(): SecuritySettings {
  const [s, setS] = useState(DEFAULT_SECURITY);
  useEffect(() => onSnapshot(doc(db, 'settings', 'security'), (d) => setS({ ...DEFAULT_SECURITY, ...(d.data() as Partial<SecuritySettings> | undefined) }), () => {}), []);
  return s;
}

/**
 * Signs the person out when the app is left unattended (no mouse, keyboard, touch or scroll)
 * for the time the Head Pastor set. Activity in any open tab keeps every tab signed in.
 * A one-minute warning lets the person stay.
 */
export function IdleLogout() {
  const { idleMinutes } = useSecuritySettings();
  const [left, setLeft] = useState<number | null>(null);
  const lastLocal = useRef(now());
  useEffect(() => {
    if (!idleMinutes || idleMinutes <= 0) return;
    mark();
    let throttle = 0;
    const active = () => { lastLocal.current = now(); if (now() - throttle > 5000) { throttle = now(); mark(); } };
    const events = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart', 'wheel'] as const;
    events.forEach((e) => window.addEventListener(e, active, { passive: true }));
    const t = setInterval(() => {
      const idle = now() - Math.max(last(0), lastLocal.current);
      const limit = idleMinutes * 60_000;
      if (idle >= limit) { try { localStorage.removeItem(KEY); } catch { /* */ } signOut(auth); return; }
      const remaining = Math.ceil((limit - idle) / 1000);
      setLeft(remaining <= 60 ? remaining : null);
    }, 1000);
    return () => { events.forEach((e) => window.removeEventListener(e, active)); clearInterval(t); };
  }, [idleMinutes]);
  if (left === null) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-royal-950/70 p-4" role="alertdialog" aria-label="Signing out soon">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl">
        <div className="font-display text-4xl font-bold text-royal-900">{left}s</div>
        <p className="mt-2 text-stone-700">You have been away for a while. For safety you will be signed out.</p>
        <div className="mt-5 flex justify-center gap-2">
          <button onClick={() => signOut(auth)} className="rounded-xl border border-stone-300 px-4 py-2 text-sm">Sign out now</button>
          <button onClick={() => { lastLocal.current = now(); mark(); setLeft(null); }} className="rounded-xl bg-royal-800 px-5 py-2 text-sm font-semibold text-white">Stay signed in</button>
        </div>
      </div>
    </div>
  );
}
