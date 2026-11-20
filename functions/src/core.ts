import type { Firestore, DocumentData } from 'firebase-admin/firestore';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { makeProvider, type Provider } from './providers';

export interface Audience {
  type: 'all' | 'branch' | 'department' | 'cell' | 'category' | 'absentees' | 'custom' | 'members' | 'welfare_defaulters';
  branchId?: string | null;
  departmentId?: string;
  cellId?: string;
  category?: string;
  serviceId?: string;
  phones?: string[];
  memberIds?: string[];
  includeVisitors?: boolean;
}

export interface Recipient { phone: string; firstName: string; name: string; vars?: Record<string, string> }

export const DEFAULT_SETTINGS = {
  provider: 'log',
  senderId: 'TOGG',
  churchName: "Throne of God's Grace Ministries",
  absenteeEnabled: false,
  absenteeTemplate: "Hello {firstName}, we missed you at church today. We love you and are praying for you. God bless you! - {church}",
  absenteeServiceTypes: ['Sunday Service'],
  absenteeHour: 15,
  birthdayEnabled: false,
  birthdayTemplate: 'Happy birthday {firstName}! May God grant you long life, joy and favour this new year. - {church}',
};
export type Settings = typeof DEFAULT_SETTINGS;

/** Ghana numbers → 233XXXXXXXXX. International numbers starting with + are kept. Returns null if unusable. */
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

export function fillTemplate(t: string, vars: Record<string, string>): string {
  return t.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

/** Current date/time in Ghana (GMT, no daylight saving). */
export function ghanaNow(now: Date) {
  const iso = now.toISOString();
  return { date: iso.slice(0, 10), minutes: now.getUTCHours() * 60 + now.getUTCMinutes(), day: now.getUTCDay(), hour: now.getUTCHours(), md: iso.slice(5, 10) };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const DEFAULT_WELFARE = {
  amount: 20, startMonth: '2026-01', remindEnabled: false, remindDay: 5,
  template: 'Dear {firstName}, your TOGG welfare dues for {months} (GH₵{amount}) are outstanding. Kindly pay via {link}. God bless you.',
};

export function monthsBetween(start: string, end: string): string[] {
  const out: string[] = [];
  let [y, m] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  while ((y < ey || (y === ey && m <= em)) && out.length < 120) { out.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++; } }
  return out;
}

/** Link put in welfare reminders: the online payment page if set, otherwise the church's public /pay page. */
export async function paymentLinkFor(db: Firestore, purpose: string): Promise<string> {
  const p = (await db.doc('settings/payments').get()).data() ?? {};
  if (p.paymentLink) return String(p.paymentLink);
  const base = String(p.publicSiteUrl || `https://${process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'attendanceform-cdb69'}.web.app`).replace(/\/+$/, '');
  return `${base}/pay?for=${purpose}`;
}

/** Active adult members (not excused) who have unpaid welfare months, with what they owe. */
export async function welfareDefaulters(db: Firestore, branch: string | null, now: Date): Promise<Recipient[]> {
  const w = { ...DEFAULT_WELFARE, ...((await db.doc('settings/welfare').get()).data() ?? {}) };
  const current = now.toISOString().slice(0, 7);
  const q = branch ? db.collection('members').where('branchId', '==', branch) : db.collection('members');
  const members = (await q.get()).docs.map((d) => ({ id: d.id, ...d.data() })) as (DocumentData & { id: string })[];
  const paid = new Map<string, Set<string>>();
  (await db.collection('giving').where('type', '==', 'welfare').get()).docs.forEach((d) => {
    const g = d.data();
    if (!g.memberId) return;
    const set = paid.get(g.memberId) ?? new Set<string>();
    (Array.isArray(g.forMonths) && g.forMonths.length ? g.forMonths : [String(g.date).slice(0, 7)]).forEach((k: string) => set.add(k));
    paid.set(g.memberId, set);
  });
  const link = await paymentLinkFor(db, 'welfare');
  const out: Recipient[] = [];
  for (const m of members) {
    if (m.status !== 'active' || m.category !== 'adult' || m.welfareExempt) continue;
    const phone = normalizePhone(m.phone);
    if (!phone) continue;
    const joined = typeof m.joinedAt === 'string' ? m.joinedAt.slice(0, 7) : '';
    const from = joined && joined > w.startMonth ? joined : w.startMonth;
    const owed = monthsBetween(from, current).filter((k) => !(paid.get(m.id) ?? new Set()).has(k));
    if (!owed.length) continue;
    const label = owed.map((k) => `${MONTHS[Number(k.slice(5)) - 1]} ${k.slice(0, 4)}`);
    const months = label.length > 4 ? `${label.slice(0, 3).join(', ')} and ${label.length - 3} more` : label.join(', ');
    out.push({ phone, firstName: m.firstName ?? '', name: `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim(), vars: { months, amount: (owed.length * Number(w.amount || 0)).toFixed(2), link } });
  }
  return out;
}

export async function loadSettings(db: Firestore): Promise<Settings> {
  const s = await db.doc('settings/sms').get();
  return { ...DEFAULT_SETTINGS, ...(s.exists ? (s.data() as Partial<Settings>) : {}) };
}

export async function loadProvider(db: Firestore, settings: Settings): Promise<Provider> {
  const sec = await db.doc('secrets/sms').get();
  return makeProvider({ provider: settings.provider, senderId: settings.senderId, apiKey: (sec.data()?.apiKey as string) ?? '' });
}

function memberRecipient(m: DocumentData): Recipient | null {
  const phone = normalizePhone(m.phone);
  if (!phone) return null;
  return { phone, firstName: m.firstName ?? '', name: `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() };
}

async function deptAndChildren(db: Firestore, id: string): Promise<string[]> {
  const all = (await db.collection('departments').get()).docs.map((d) => ({ id: d.id, parentId: d.data().parentId ?? null }));
  const out: string[] = [];
  const go = (x: string) => { if (out.includes(x)) return; out.push(x); all.filter((d) => d.parentId === x).forEach((d) => go(d.id)); };
  go(id);
  return out;
}

/**
 * Works out who receives a message. `branchLock` (the message's branchId) always wins over the
 * audience's own branch, so a branch user can never text another branch.
 */
export async function resolveRecipients(db: Firestore, a: Audience, branchLock: string | null, now = new Date()): Promise<Recipient[]> {
  const branch = branchLock ?? a.branchId ?? null;
  const okStatus = (m: DocumentData) => m.status === 'active' || (a.includeVisitors && m.status === 'visitor');
  const inBranch = (m: DocumentData) => !branch || m.branchId === branch;
  let docs: DocumentData[] = [];

  switch (a.type) {
    case 'welfare_defaulters':
      return dedupe(await welfareDefaulters(db, branch, now));
    case 'custom':
      return dedupe((a.phones ?? []).map((p) => normalizePhone(p)).filter((p): p is string => !!p).map((phone) => ({ phone, firstName: '', name: '' })));
    case 'members': {
      const ids = (a.memberIds ?? []).slice(0, 500);
      const snaps = await Promise.all(ids.map((id) => db.doc(`members/${id}`).get()));
      docs = snaps.filter((s) => s.exists).map((s) => s.data()!).filter(inBranch);
      return dedupe(docs.map(memberRecipient).filter((r): r is Recipient => !!r));
    }
    case 'absentees': {
      if (!a.serviceId) return [];
      const svc = await db.doc(`services/${a.serviceId}`).get();
      if (!svc.exists) return [];
      const s = svc.data()!;
      if (branchLock && s.branchId !== branchLock) return [];
      const present = new Set((await svc.ref.collection('checkins').get()).docs.map((d) => d.id));
      docs = (await db.collection('members').where('branchId', '==', s.branchId).get()).docs
        .filter((d) => !present.has(d.id)).map((d) => d.data()).filter((m) => m.status === 'active' && m.category !== 'child');
      return dedupe(docs.map(memberRecipient).filter((r): r is Recipient => !!r));
    }
    case 'department': {
      if (!a.departmentId) return [];
      const ids = (await deptAndChildren(db, a.departmentId)).slice(0, 30);
      docs = (await db.collection('members').where('departmentIds', 'array-contains-any', ids).get()).docs.map((d) => d.data());
      break;
    }
    case 'cell':
      if (!a.cellId) return [];
      docs = (await db.collection('members').where('cellId', '==', a.cellId).get()).docs.map((d) => d.data());
      break;
    case 'category':
      docs = (await db.collection('members').where('category', '==', a.category ?? 'adult').get()).docs.map((d) => d.data());
      break;
    case 'branch':
    case 'all':
    default: {
      const q = branch ? db.collection('members').where('branchId', '==', branch) : db.collection('members');
      docs = (await q.get()).docs.map((d) => d.data());
    }
  }
  return dedupe(docs.filter(okStatus).filter(inBranch).map(memberRecipient).filter((r): r is Recipient => !!r));
}

function dedupe(list: Recipient[]): Recipient[] {
  const seen = new Map<string, Recipient>();
  list.forEach((r) => { if (!seen.has(r.phone)) seen.set(r.phone, r); });
  return [...seen.values()];
}

/** Sends personalised texts, grouping identical ones into batches of 100. */
export async function deliver(provider: Provider, recipients: Recipient[], template: string, church: string) {
  const groups = new Map<string, string[]>();
  for (const r of recipients) {
    const text = fillTemplate(template, { firstName: r.firstName || 'friend', name: r.name || 'friend', church, ...(r.vars ?? {}) });
    groups.set(text, [...(groups.get(text) ?? []), r.phone]);
  }
  let sent = 0; let failed = 0; let error = ''; let response = '';
  for (const [text, phones] of groups) {
    for (let i = 0; i < phones.length; i += 100) {
      const chunk = phones.slice(i, i + 100);
      try {
        const res = await provider.send(chunk, text);
        sent += res.sent; failed += res.failed;
        if (res.error) error = res.error;
        if (res.response) response = res.response;
      } catch (e) {
        failed += chunk.length; error = e instanceof Error ? e.message : String(e);
      }
    }
  }
  return { sent, failed, error, response };
}

/** Claims and sends one message from smsMessages. Safe to call twice: only one call will send. */
export async function processMessage(db: Firestore, id: string, now = new Date(), providerOverride?: Provider) {
  const ref = db.doc(`smsMessages/${id}`);
  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const m = snap.data()!;
    if (m.status !== 'queued' && m.status !== 'scheduled') return null;
    if (m.status === 'scheduled' && m.sendAt && (m.sendAt as Timestamp).toMillis() > now.getTime()) return null;
    tx.update(ref, { status: 'sending', startedAt: FieldValue.serverTimestamp() });
    return m;
  });
  if (!claimed) return { skipped: true };
  try {
    const settings = await loadSettings(db);
    const provider = providerOverride ?? (await loadProvider(db, settings));
    const recipients = await resolveRecipients(db, claimed.audience ?? { type: 'custom' }, claimed.branchId ?? null, now);
    if (!recipients.length) {
      await ref.update({ status: 'failed', recipientsCount: 0, sentCount: 0, failedCount: 0, error: 'No recipients with a valid phone number.', finishedAt: FieldValue.serverTimestamp() });
      return { sent: 0, failed: 0 };
    }
    const res = await deliver(provider, recipients, claimed.message ?? '', settings.churchName);
    await ref.update({
      status: res.sent > 0 ? 'sent' : 'failed', provider: provider.name, recipientsCount: recipients.length,
      sentCount: res.sent, failedCount: res.failed, error: res.error || FieldValue.delete(), finishedAt: FieldValue.serverTimestamp(),
      ...(res.response ? { providerResponse: res.response } : {}),
    });
    return res;
  } catch (e) {
    await ref.update({ status: 'failed', error: e instanceof Error ? e.message : String(e), finishedAt: FieldValue.serverTimestamp() });
    throw e;
  }
}

/** Runs every few minutes: due scheduled messages, programme reminders, missed-service texts, birthdays. */
export async function runTick(db: Firestore, now = new Date(), providerOverride?: Provider) {
  const g = ghanaNow(now);
  const settings = await loadSettings(db);
  const created: string[] = [];
  const queue = async (data: DocumentData) => {
    const ref = await db.collection('smsMessages').add({ kind: 'automated', status: 'queued', createdAt: FieldValue.serverTimestamp(), createdByName: 'Automatic', ...data });
    created.push(ref.id);
  };

  // 1. Programme reminders (e.g. Peak Hour Prayer)
  const progs = await db.collection('programmes').where('active', '==', true).get();
  for (const p of progs.docs) {
    const d = p.data();
    if (!Array.isArray(d.days) || !d.days.includes(g.day) || d.lastSentOn === g.date) continue;
    const [hh, mm] = String(d.time || '00:00').split(':').map(Number);
    const eventMin = hh * 60 + mm;
    const remindAt = eventMin - (Number(d.remindMinutesBefore) || 0);
    if (g.minutes < remindAt || g.minutes > eventMin + 30) continue;
    const message = fillTemplate(d.message || '{title} starts at {time}. {link}', { title: d.title ?? '', link: d.link ?? '', time: d.time ?? '' });
    await p.ref.update({ lastSentOn: g.date });
    await queue({ branchId: d.branchId ?? null, message, audience: d.audience ?? { type: 'all' }, label: `Reminder: ${d.title}`, programmeId: p.id });
  }

  // 2. Members who missed today's service
  if (settings.absenteeEnabled && g.hour >= settings.absenteeHour) {
    const svcs = await db.collection('services').where('date', '==', g.date).get();
    for (const s of svcs.docs) {
      const d = s.data();
      if (d.absenteeSmsQueued || !(d.count > 0) || !settings.absenteeServiceTypes.includes(d.type)) continue;
      await s.ref.update({ absenteeSmsQueued: true });
      await queue({ branchId: d.branchId, message: settings.absenteeTemplate, audience: { type: 'absentees', serviceId: s.id, branchId: d.branchId }, label: `Missed ${d.title || d.type} (${d.date})` });
    }
  }

  // 3. Birthdays, once a day from 7am
  if (settings.birthdayEnabled && g.hour >= 7) {
    const marker = db.doc('meta/automation');
    const ran = (await marker.get()).data()?.birthdaysOn;
    if (ran !== g.date) {
      await marker.set({ birthdaysOn: g.date }, { merge: true });
      const people = (await db.collection('members').where('status', '==', 'active').get()).docs
        .filter((m) => typeof m.data().dob === 'string' && m.data().dob.slice(5, 10) === g.md && m.data().phone);
      if (people.length) await queue({ branchId: null, message: settings.birthdayTemplate, audience: { type: 'members', memberIds: people.map((p) => p.id) }, label: `Birthdays ${g.date}` });
    }
  }

  // 4. Monthly welfare reminders to members who owe (with the payment link)
  const welfare = { ...DEFAULT_WELFARE, ...((await db.doc('settings/welfare').get()).data() ?? {}) };
  if (welfare.remindEnabled && now.getUTCDate() === Number(welfare.remindDay) && g.hour >= 9) {
    const marker = db.doc('meta/automation');
    if ((await marker.get()).data()?.welfareOn !== g.date) {
      await marker.set({ welfareOn: g.date }, { merge: true });
      await queue({ branchId: null, message: welfare.template, audience: { type: 'welfare_defaulters' }, label: `Welfare reminder ${g.date.slice(0, 7)}` });
    }
  }

  // 5. Send everything that is due: new automated ones, scheduled ones, and any stuck in the queue
  const due = { docs: (await db.collection('smsMessages').where('status', '==', 'scheduled').get()).docs
    .filter((d) => { const t = d.data().sendAt as Timestamp | undefined; return !!t && t.toMillis() <= now.getTime(); }) };
  const queued = await db.collection('smsMessages').where('status', '==', 'queued').get();
  const ids = new Set([...created, ...due.docs.map((d) => d.id), ...queued.docs.map((d) => d.id)]);
  for (const id of ids) await processMessage(db, id, now, providerOverride);
  await verifyOnlineGifts(db, now).catch((e) => console.error('paystack', e));
  await db.doc('meta/heartbeat').set({ at: FieldValue.serverTimestamp(), via: 'cloud-functions', provider: settings.provider, ok: true }, { merge: true });
  return { processed: ids.size, created: created.length };
}

/* ---------------- Paystack online giving ---------------- */
const PAYSTACK_TYPE: Record<string, string> = { tithe: 'tithe', offering: 'offering', thanksgiving: 'thanksgiving', seed: 'seed', project: 'project', welfare: 'welfare', building: 'building', missions: 'missions' };
type Fetch = (url: string, init?: { headers?: Record<string, string> }) => Promise<{ status: number; json(): Promise<any> }>;

/** Confirms pending Paystack payments with Paystack and records paid ones exactly once. */
export async function verifyOnlineGifts(db: Firestore, now = new Date(), fetchImpl: Fetch = fetch as unknown as Fetch, onlyRef?: string) {
  const secret = String((await db.doc('secrets/paystack').get()).data()?.secretKey ?? '');
  if (!secret) return 0;
  const pending = onlyRef ? [await db.doc(`onlineGifts/${onlyRef}`).get()].filter((d) => d.exists && d.data()!.status === 'pending')
    : (await db.collection('onlineGifts').where('status', '==', 'pending').get()).docs;
  let recorded = 0;
  for (const d of pending) {
    const g = d.data()!;
    const res = await fetchImpl(`https://api.paystack.co/transaction/verify/${encodeURIComponent(d.id)}`, { headers: { Authorization: `Bearer ${secret}` } });
    const body = await res.json().catch(() => null);
    const data = body?.data;
    const created = (g.createdAt as Timestamp | undefined)?.toMillis?.() ?? now.getTime();
    if (res.status === 200 && body?.status && data?.status === 'success' && data.reference === d.id) {
      if (data.currency !== 'GHS') { await d.ref.update({ status: 'failed', error: `Paid in ${data.currency}, expected GHS`, checkedAt: now }); continue; }
      const amount = Math.round(Number(data.amount)) / 100;
      const date = String(data.paid_at || now.toISOString()).slice(0, 10);
      const method = data.channel === 'mobile_money' ? 'momo' : data.channel === 'card' ? 'card' : 'bank';
      const members = g.branchId ? (await db.collection('members').where('branchId', '==', g.branchId).get()).docs : [];
      const member = g.phoneKey ? members.find((m) => String(m.data().phone || '').replace(/\D/g, '').slice(-9) === g.phoneKey) : undefined;
      const who = member ? `${member.data().firstName ?? ''} ${member.data().lastName ?? ''}`.trim() : (g.name || 'Online giver');
      const fee = data.fees ? ` · Paystack fee GH₵${(Number(data.fees) / 100).toFixed(2)}` : '';
      try {
        await db.runTransaction(async (tx) => {
          const cur = await tx.get(d.ref);
          if (cur.data()?.status !== 'pending') return;
          let recordPath: string;
          if (g.purpose === 'charity') {
            recordPath = `charity/ps_${d.id}`;
            tx.create(db.doc(recordPath), { type: 'support', date, donor: who, form: 'cash', amount, items: '', notes: `Online via Paystack ${d.id}${fee}`, name: '', phone: g.phone ?? '', need: '', category: '', status: 'helped', beneficiaryId: '', place: '', peopleReached: 0, createdAt: now });
          } else {
            recordPath = `giving/ps_${d.id}`;
            tx.create(db.doc(recordPath), { branchId: g.branchId, date, amount, type: PAYSTACK_TYPE[g.purpose] ?? 'other', method, memberId: member?.id ?? null, memberName: who,
              reference: `Paystack ${d.id}`, note: `Online via Paystack${fee}`, projectId: g.purpose === 'project' ? (g.projectId || null) : null,
              forMonths: g.purpose === 'welfare' ? [date.slice(0, 7)] : [], createdBy: 'paystack', createdAt: now });
            if (g.purpose === 'project' && g.projectId) tx.update(db.doc(`projects/${g.projectId}`), { raised: FieldValue.increment(amount), donors: FieldValue.increment(1) });
          }
          tx.update(d.ref, { status: 'success', recordId: recordPath, amountPaid: amount, channel: String(data.channel ?? ''), paidAt: date, checkedAt: now });
        });
        recorded++;
      } catch (e) { console.error('record gift', d.id, e); }
    } else if (data?.status === 'failed') {
      await d.ref.update({ status: 'failed', error: String(data.gateway_response || 'Payment failed'), checkedAt: now });
    } else if (now.getTime() - created > 3 * 3600e3) {
      await d.ref.update({ status: 'abandoned', checkedAt: now });
    }
  }
  return recorded;
}
