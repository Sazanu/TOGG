/**
 * Sends SMS straight from the app to Gonlinesites, with no server to set up.
 *
 * How it works:
 *  - The Gonlinesites key and Sender ID live in `smsSender/gonline`. Only staff who are allowed
 *    to send SMS can read it (see firestore.rules).
 *  - Each message is first "claimed" in a transaction (queued → sending, claimedBy = me), so it is
 *    sent once even if several screens are open, or the Apps Script server runs too.
 *  - Gonlinesites does not allow web pages to read its reply (no CORS), so the request is sent
 *    "no-cors". A network failure is still detected; Gonlinesites' own reply shows in its dashboard.
 *    Use "Check Gonlinesites" (balance + sender check) in SMS messages → SMS provider, which goes through
 *    the Apps Script server when it is set up.
 */
import { collection, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, updateDoc, where, type DocumentData } from 'firebase/firestore';
import { db } from './firebase';
import { fillTemplate, monthKey } from './format';
import { DEFAULT_WELFARE } from './settings';
import type { Audience, Gift, Member, WelfareSettings } from './types';
import { expectedMonths, monthShort, paidMonths, welfareMembers } from './welfare';

export const GONLINE_API = 'https://sms.gonlinesites.com/app/sms/api';

export interface SenderKey { apiKey: string; senderId: string }
interface Recipient { phone: string; firstName: string; name: string; vars?: Record<string, string> }

/** Same phone rules as the server: Ghana numbers become 233XXXXXXXXX. */
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

/** Gonlinesites answers with JSON. "ok"/"success" means accepted; numbered codes are errors (106 = invalid Sender ID …). */
export function gonlineResult(body: string): { ok: boolean; message: string } {
  const text = String(body || '').trim();
  try {
    const j = JSON.parse(text) as { code?: string | number; status?: string; message?: string };
    const code = String(j.code ?? j.status ?? '').toLowerCase();
    if (code === 'ok' || code === 'success' || code === '200' || code === '1000') return { ok: true, message: j.message ?? 'accepted' };
    return { ok: false, message: `${j.code ?? j.status ?? ''} ${j.message ?? text}`.trim() };
  } catch {
    const bad = /error|invalid|insufficient|fail|denied|wrong|incorrect|not ?allowed|unauthori[sz]ed|low balance|blacklist/i.test(text);
    return { ok: !bad && text.length > 0, message: text.slice(0, 200) || 'empty reply' };
  }
}

export function gonlineUrl(key: SenderKey, phones: string[], text: string): string {
  const q = new URLSearchParams({ action: 'send-sms', api_key: key.apiKey, to: phones.join(','), from: key.senderId, sms: text });
  return `${GONLINE_API}?${q.toString()}`;
}

export async function getSenderKey(): Promise<SenderKey | null> {
  try {
    const d = (await getDoc(doc(db, 'smsSender', 'gonline'))).data();
    if (!d?.apiKey) return null;
    return { apiKey: String(d.apiKey), senderId: String(d.senderId || 'TOGG') };
  } catch { return null; }
}

const member = (m: Member): Recipient | null => {
  const phone = normalizePhone(m.phone);
  return phone ? { phone, firstName: m.firstName || '', name: `${m.firstName || ''} ${m.lastName || ''}`.trim() } : null;
};
const dedupe = (list: (Recipient | null)[]) => {
  const seen = new Set<string>(); const out: Recipient[] = [];
  list.forEach((r) => { if (r && !seen.has(r.phone)) { seen.add(r.phone); out.push(r); } });
  return out;
};
const rows = <T,>(docs: { id: string; data(): DocumentData }[]) => docs.map((d) => ({ id: d.id, ...d.data() }) as T);

async function membersOf(branch: string | null): Promise<Member[]> {
  const base = collection(db, 'members');
  return rows<Member>((await getDocs(branch ? query(base, where('branchId', '==', branch)) : base)).docs);
}

/** Who receives a message. Uses only simple queries, so no database indexes are needed. */
export async function resolveRecipients(a: Audience, branchLock: string | null): Promise<Recipient[]> {
  const branch = branchLock || a.branchId || null;
  const ok = (m: Member) => m.status === 'active' || (!!a.includeVisitors && m.status === 'visitor');
  switch (a.type) {
    case 'custom':
      return dedupe((a.phones ?? []).map((p) => normalizePhone(p)).map((p) => (p ? { phone: p, firstName: '', name: '' } : null)));
    case 'members': {
      const list = await Promise.all((a.memberIds ?? []).slice(0, 500).map(async (id) => {
        const d = await getDoc(doc(db, 'members', id)).catch(() => null);
        return d?.exists() ? ({ id: d.id, ...d.data() } as Member) : null;
      }));
      return dedupe(list.filter((m): m is Member => !!m && (!branch || m.branchId === branch)).map(member));
    }
    case 'absentees': {
      if (!a.serviceId) return [];
      const svc = (await getDoc(doc(db, 'services', a.serviceId))).data();
      if (!svc || (branchLock && svc.branchId !== branchLock)) return [];
      const present = new Set((await getDocs(collection(db, 'services', a.serviceId, 'checkins'))).docs.map((d) => d.id));
      return dedupe((await membersOf(svc.branchId)).filter((m) => !present.has(m.id) && m.status === 'active' && m.category !== 'child').map(member));
    }
    case 'welfare_defaulters': {
      const w = { ...DEFAULT_WELFARE, ...((await getDoc(doc(db, 'settings', 'welfare'))).data() as Partial<WelfareSettings> | undefined) };
      const g = collection(db, 'giving');
      const gifts = rows<Gift>((await getDocs(branch ? query(g, where('branchId', '==', branch), where('type', '==', 'welfare')) : query(g, where('type', '==', 'welfare')))).docs);
      const paid = paidMonths(gifts);
      const pay = (await getDoc(doc(db, 'settings', 'payments'))).data() ?? {};
      const link = String(pay.paymentLink || `${String(pay.publicSiteUrl || window.location.origin).replace(/\/+$/, '')}/pay?for=welfare`);
      const now = monthKey();
      return dedupe(welfareMembers(await membersOf(branch)).map((m) => {
        const owed = expectedMonths(m, w.startMonth, now).filter((k) => !paid.get(m.id)?.has(k));
        const r = owed.length ? member(m) : null;
        if (!r) return null;
        const label = owed.map(monthShort);
        r.vars = { months: label.length > 4 ? `${label.slice(0, 3).join(', ')} and ${label.length - 3} more` : label.join(', '), amount: (owed.length * Number(w.amount || 0)).toFixed(2), link };
        return r;
      }));
    }
    default: {
      let list = (await membersOf(branch)).filter(ok);
      if (a.type === 'department' && a.departmentId) {
        const all = rows<{ id: string; parentId?: string | null }>((await getDocs(collection(db, 'departments'))).docs);
        const ids = new Set<string>(); const go = (x: string) => { if (ids.has(x)) return; ids.add(x); all.filter((d) => d.parentId === x).forEach((d) => go(d.id)); };
        go(a.departmentId);
        list = list.filter((m) => (m.departmentIds ?? []).some((x) => ids.has(x)));
      } else if (a.type === 'department') list = [];
      if (a.type === 'cell') list = a.cellId ? list.filter((m) => m.cellId === a.cellId) : [];
      if (a.type === 'category') list = list.filter((m) => m.category === (a.category || 'adult'));
      return dedupe(list.map(member));
    }
  }
}

/** One request per number: the reply cannot be read, so we never risk a whole group on one call. */
async function post(url: string): Promise<boolean> {
  try { await fetch(url, { mode: 'no-cors', cache: 'no-store', referrerPolicy: 'no-referrer' }); return true; }
  catch { return false; }
}

/** Claims a queued (or due scheduled) message and sends it to Gonlinesites from this browser. */
export async function sendFromApp(id: string, uid: string): Promise<{ sent: number; failed: number; skipped?: boolean; error?: string }> {
  const ref = doc(db, 'smsMessages', id);
  const claimed = await runTransaction(db, async (tx) => {
    const s = await tx.get(ref);
    const m = s.data();
    if (!m) return null;
    const due = m.status === 'queued' || (m.status === 'scheduled' && (!m.sendAt || m.sendAt.toDate().getTime() <= Date.now()));
    if (!due) return null;
    tx.update(ref, { status: 'sending', via: 'app', claimedBy: uid, startedAt: serverTimestamp() });
    return m;
  }).catch(() => null);
  if (!claimed) return { sent: 0, failed: 0, skipped: true };

  const finish = (o: Record<string, unknown>) => updateDoc(ref, { ...o, finishedAt: serverTimestamp() });
  try {
    const key = await getSenderKey();
    if (!key) { await finish({ status: 'failed', error: 'No Gonlinesites API key saved (SMS messages → SMS provider).' }); return { sent: 0, failed: 0, error: 'no key' }; }
    const settings = (await getDoc(doc(db, 'settings', 'sms'))).data() ?? {};
    const church = String(settings.churchName || "Throne of God's Grace Ministries");
    const recipients = await resolveRecipients(claimed.audience as Audience, (claimed.branchId as string | null) ?? null);
    if (!recipients.length) { await finish({ status: 'failed', recipientsCount: 0, sentCount: 0, failedCount: 0, error: 'No recipients with a valid phone number.' }); return { sent: 0, failed: 0 }; }
    let sent = 0, failed = 0;
    const jobs = recipients.map((r) => () => {
      const text = fillTemplate(String(claimed.message || ''), { firstName: r.firstName || 'friend', name: r.name || 'friend', church, ...(r.vars ?? {}) });
      return post(gonlineUrl(key, [r.phone], text)).then((ok) => { if (ok) sent++; else failed++; });
    });
    for (let i = 0; i < jobs.length; i += 5) await Promise.all(jobs.slice(i, i + 5).map((j) => j()));
    await finish({
      status: sent > 0 ? 'sent' : 'failed', provider: 'gonlinesites', recipientsCount: recipients.length, sentCount: sent, failedCount: failed,
      providerResponse: `Handed to Gonlinesites from the app (sender ${key.senderId}). Delivery reports are in your Gonlinesites dashboard.`,
      ...(failed && !sent ? { error: 'Could not reach Gonlinesites (no internet?).' } : {}),
    });
    return { sent, failed };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finish({ status: 'failed', error: msg }).catch(() => {});
    return { sent: 0, failed: 0, error: msg };
  }
}

/** Messages this person may send that are waiting (queued in the last day, or scheduled and due). */
export async function waitingMessages(branchId: string | null, maxAgeHours = 24): Promise<string[]> {
  const base = collection(db, 'smsMessages');
  const q = (status: string) => getDocs(branchId ? query(base, where('branchId', '==', branchId), where('status', '==', status)) : query(base, where('status', '==', status)));
  const [queued, scheduled] = await Promise.all([q('queued'), q('scheduled')]);
  const dayAgo = Date.now() - maxAgeHours * 3600_000;
  return [
    ...queued.docs.filter((d) => (d.data().createdAt?.toDate?.().getTime() ?? Date.now()) > dayAgo).map((d) => d.id),
    ...scheduled.docs.filter((d) => { const t = d.data().sendAt?.toDate?.().getTime(); return t && t <= Date.now() && t > dayAgo; }).map((d) => d.id),
  ];
}
