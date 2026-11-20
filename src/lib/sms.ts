import { addDoc, collection, doc, getDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebase';
import type { Audience, Member, SmsSettings } from './types';

export const DEFAULT_SMS_SETTINGS: SmsSettings = {
  provider: 'log',
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

/** Same rules the SMS server uses (functions/src/core.ts). */
export function normalizePhone(raw: string): string | null {
  const s = String(raw || '').trim();
  const d = s.replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('233') && d.length === 12) return d;
  if (d.startsWith('0') && d.length === 10) return '233' + d.slice(1);
  if (d.length === 9) return '233' + d;
  if (s.startsWith('+') && d.length >= 10 && d.length <= 15) return d;
  return null;
}

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
}): Promise<{ id: string; delivered: boolean; error?: string }> {
  const scheduled = !!data.sendAt && data.sendAt.getTime() > Date.now() + 60_000;
  const ref = await addDoc(collection(db, 'smsMessages'), {
    branchId: data.branchId, message: data.message, audience: data.audience, label: data.label,
    kind: scheduled ? 'scheduled' : 'instant', status: scheduled ? 'scheduled' : 'queued',
    sendAt: scheduled ? Timestamp.fromDate(data.sendAt!) : null, estimate: data.estimate ?? null,
    createdBy: data.createdBy ?? null, createdByName: data.createdByName ?? '', createdAt: serverTimestamp(),
  });
  if (scheduled) return { id: ref.id, delivered: false };
  return wakeSmsServer(ref.id);
}

/**
 * Asks the SMS server to send what is waiting.
 *  - Free Google Apps Script server: its web-app address is saved in settings/sms.relayUrl.
 *  - Otherwise Firebase Cloud Functions (Blaze plan).
 */
export async function wakeSmsServer(id?: string): Promise<{ id: string; delivered: boolean; via?: string; error?: string }> {
  let relayUrl = '';
  try { relayUrl = String((await getDoc(doc(db, 'settings', 'sms'))).data()?.relayUrl ?? ''); } catch { /* ignore */ }
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
