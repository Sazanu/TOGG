import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { can, isGlobal } from '../lib/roles';
import { smsServerLive } from '../lib/sms';
import { sendFromApp, waitingMessages } from '../lib/smsDirect';

/**
 * While someone who may send SMS has the app open, scheduled messages that are due (and any left
 * waiting in the last day) are sent from here, unless the Apps Script server is running.
 * Each message is claimed first, so several open screens never send it twice.
 */
export function SmsPump() {
  const { profile } = useAuth();
  const allowed = !!profile && can(profile.role, 'sms.send');
  const branch = profile && !isGlobal(profile.role) ? profile.branchId ?? null : null;
  useEffect(() => {
    if (!allowed || !profile) return;
    let busy = false;
    const run = async () => {
      if (busy || document.hidden) return;
      busy = true;
      try {
        if (await smsServerLive()) return;
        for (const id of await waitingMessages(branch)) await sendFromApp(id, profile.uid);
      } catch (e) { console.warn('SMS pump', e); } finally { busy = false; }
    };
    const first = setTimeout(run, 8000);
    const t = setInterval(run, 60_000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [allowed, branch, profile?.uid]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
