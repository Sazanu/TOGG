import { addDoc, collection, doc, getDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from './firebase';
import { sendFromApp } from './smsDirect';
import type { Audience, Member, SmsSettings } from './types';

export const DEFAULT_SMS_SETTINGS: SmsSettings = {
  provider: 'gonlinesites',
  senderId: 'TOGG',
  churchName: "Throne of God's Grace Ministries",
  absenteeEnabled: false,
  absenteeTemplate: 'Hello {firstName}, we missed you at church today. We love you and are praying for you. God bless you! - {church}',
  absenteeServiceTypes: ['Sunday Service'],
  absenteeHour: 15,
  birthdayEnabled: false,
  birthdayTemplate: 'Happy birthday {firstName}! May God grant you long life, joy and favour in this new year. - {church}',
};

export const TEMPLATES = [
  { label: 'Announcement', text: 'Dear {firstName}, ' },
  { label: 'Programme reminder', text: 'Hello {firstName}, reminder: [programme] on [day] at [time]. Venue: [venue]. Come with a friend! - {church}' },
  { label: 'Online programme', text: 'Hello {firstName}, join us online for [programme] at [time]. Link: [link] - {church}' },
  { label: 'We missed you', text: 'Hello {firstName}, we missed you at church on Sunday. We love you and are praying for you. - {church}' },
  { label: 'Welcome visitor', text: 'Hello {firstName}, thank you for worshipping with us. You are welcome to TOGG! We would love to see you again. - {church}' },
];

export { normalizePhone } from './smsDirect';
import { normalizePhone } from './smsDirect';

/** Estimate of who will receive a message, computed from members already loaded in the app. */
export function estimateRecipients(a: Audience, members: Member[], deptIds: (id: string) => string[]): number {
  if (a.type === 'custom') return new Set((a.phones ?? []).map(normalizePhone).filter(Boolean)).size;
  if (a.type === 'absentees') return -1; // worked out on the server
  const ok = (m: Member) => m.status === 'active' || (a.includeVisitors && m.status === 'visitor');
  const ids = a.type === 'department' && a.departmentId ? deptIds(a.departmentId) : [];
  const list = members.filter((m) => {
    if (!ok(m)) return false;
    if (a.branchId && m.branchId !== a.branchId) return false;
    if (a.type === 'department') return m.departmentIds?.some((x) => ids.includes(x));
    if (a.type === 'cell') return m.cellId === a.cellId;
    if (a.type === 'category') return m.category === a.category;
    return true;
  });
  return new Set(list.map((m) => normalizePhone(m.phone)).filter(Boolean)).size;
}

export async function queueSms(data: {
  branchId: string | null; message: string; audience: Audience; label: string; sendAt?: Date | null;
  createdBy?: string; createdByName?: string; estimate?: number;
}): Promise<{ id: string; delivered: boolean; via?: string; error?: string }> {
  const scheduled = !!data.sendAt && data.sendAt.getTime() > Date.now() + 60_000;
  const ref = await addDoc(collection(db, 'smsMessages'), {
    branchId: data.branchId, message: data.message, audience: data.audience, label: data.label,
    kind: scheduled ? 'scheduled' : 'instant', status: scheduled ? 'scheduled' : 'queued',
    sendAt: scheduled ? Timestamp.fromDate(data.sendAt!) : null, estimate: data.estimate ?? null,
    createdBy: data.createdBy ?? null, createdByName: data.createdByName ?? '', createdAt: serverTimestamp(),
  });
  if (scheduled) return { id: ref.id, delivered: false };
  // The Apps Script server sends it if it is running; otherwise this app sends it to Gonlinesites itself.
  if (await smsServerLive()) return wakeSmsServer(ref.id);
  const uid = data.createdBy ?? auth.currentUser?.uid;
  if (!uid) return wakeSmsServer(ref.id);
  const r = await sendFromApp(ref.id, uid);
  if (r.skipped) return { id: ref.id, delivered: true, via: 'app' }; // another screen or the server took it
  return { id: ref.id, delivered: r.sent > 0, via: 'app', error: r.error ?? (r.sent ? undefined : 'Nothing was sent — see the message in "Sent & scheduled".') };
}

/** True when the free Apps Script server has checked in during the last 20 minutes. */
export async function smsServerLive(): Promise<boolean> {
  try {
    const at = (await getDoc(doc(db, 'meta', 'heartbeat'))).data()?.at;
    return !!at && Date.now() - at.toDate().getTime() < 20 * 60_000;
  } catch { return false; }
}

/** Only a Google Apps Script web-app address can be the SMS server (not the Gonlinesites API link). */
export const isServerUrl = (u: string) => /^https:\/\/script\.google(usercontent)?\.com\/|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(u.trim()); // local address: testing only

/**
 * Asks the SMS server to send what is waiting.
 *  - Free Google Apps Script server: its web-app address is saved in settings/sms.relayUrl.
 *  - Otherwise Firebase Cloud Functions (Blaze plan).
 */
export async function wakeSmsServer(id?: string): Promise<{ id: string; delivered: boolean; via?: string; error?: string }> {
  let relayUrl = '';
  try { relayUrl = String((await getDoc(doc(db, 'settings', 'server'))).data()?.relayUrl ?? ''); } catch { /* public pages */ }
  if (!relayUrl) { try { relayUrl = String((await getDoc(doc(db, 'settings', 'sms'))).data()?.relayUrl ?? ''); } catch { /* ignore */ } }
  if (!isServerUrl(relayUrl)) relayUrl = '';
  if (relayUrl) {
    try {
      // The Apps Script answers from another site, so the reply is not readable here;
      // the message's status in "Sent & scheduled" shows the result a few seconds later.
      await fetch(relayUrl, { method: 'POST', mode: 'no-cors', body: 'run' });
      return { id: id ?? '', delivered: true, via: 'apps-script' };
    } catch (e) {
      return { id: id ?? '', delivered: false, via: 'apps-script', error: e instanceof Error ? e.message : String(e) };
    }
  }
  if (!id) return { id: '', delivered: false, error: 'No SMS server is set up.' };
  try {
    await httpsCallable(functions, 'sendSmsNow')({ id });
    return { id, delivered: true, via: 'cloud-functions' };
  } catch (e) {
    return { id, delivered: false, via: 'cloud-functions', error: e instanceof Error ? e.message : String(e) };
  }
}
