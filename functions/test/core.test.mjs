// Run with the Firestore emulator:  firebase emulators:exec --only firestore "npm --prefix functions test"
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const core = require('../lib/core.js');
const { sentLog } = require('../lib/providers.js');

initializeApp({ projectId: 'demo-togg-fn' });
const db = getFirestore();
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ✓', name); } catch (e) { fail++; console.log('  ✗', name, '\n     ', e.message); } };
const eq = (a, b, msg = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); };
const phonesSent = () => sentLog.flatMap((x) => x.to).sort();
const reset = () => { sentLog.length = 0; };

async function wipe() {
  for (const c of ['members', 'departments', 'services', 'smsMessages', 'programmes', 'settings', 'meta', 'secrets']) {
    const s = await db.collection(c).get();
    await Promise.all(s.docs.map(async (d) => { for (const sub of await d.ref.listCollections()) { for (const x of (await sub.get()).docs) await x.ref.delete(); } await d.ref.delete(); }));
  }
}
await wipe();
const M = (id, o) => db.doc(`members/${id}`).set({ firstName: id, lastName: 'X', status: 'active', category: 'adult', branchId: 'A', departmentIds: [], cellId: null, dob: '', ...o });
await M('ama', { phone: '0241111111', departmentIds: ['choir'], cellId: 'c1', dob: '1990-11-15' });
await M('kofi', { phone: '+233 24 222 2222', departmentIds: ['media'] });
await M('yaw', { phone: '0243333333', status: 'visitor' });
await M('esi', { phone: '0244444444', status: 'inactive' });
await M('kid', { phone: '0245555555', category: 'child' });
await M('nophone', { phone: '' });
await M('dup', { phone: '024 111 1111' });            // same number as ama
await M('bee', { phone: '0246666666', branchId: 'B', departmentIds: ['choir'] });
await db.doc('departments/media').set({ name: 'Media', parentId: null });
await db.doc('departments/choir').set({ name: 'Choir', parentId: 'media' }); // sub-department of Media
await db.doc('settings/sms').set({ provider: 'log', churchName: 'TOGG' });

const send = async (data, now) => {
  const ref = await db.collection('smsMessages').add({ status: 'queued', kind: 'instant', ...data });
  await core.processMessage(db, ref.id, now);
  return (await ref.get()).data();
};

console.log('Phone numbers');
await t('Ghana formats normalise to 233…', () => {
  eq(core.normalizePhone('0241234567'), '233241234567');
  eq(core.normalizePhone('+233 24 123 4567'), '233241234567');
  eq(core.normalizePhone('241234567'), '233241234567');
  eq(core.normalizePhone('233241234567'), '233241234567');
  eq(core.normalizePhone('12345'), null);
  eq(core.normalizePhone(''), null);
});

console.log('Audiences');
await t('whole branch: active only, de-duplicated, personalised', async () => {
  reset();
  const m = await send({ branchId: 'A', message: 'Hi {firstName} from {church}', audience: { type: 'branch', branchId: 'A' } });
  eq(m.status, 'sent'); eq(m.recipientsCount, 3, 'ama/dup share a number;');
  eq(phonesSent(), ['233241111111', '233242222222', '233245555555']);
  if (!sentLog.some((x) => x.text === 'Hi kofi from TOGG')) throw new Error('not personalised');
  if (phonesSent().includes('233243333333')) throw new Error('visitor included');
  if (phonesSent().includes('233244444444')) throw new Error('inactive included');
});
await t('include visitors when asked', async () => {
  reset();
  await send({ branchId: 'A', message: 'x', audience: { type: 'branch', branchId: 'A', includeVisitors: true } });
  if (!phonesSent().includes('233243333333')) throw new Error('visitor missing');
});
await t('branch lock: a branch-A message cannot reach branch B', async () => {
  reset();
  await send({ branchId: 'A', message: 'x', audience: { type: 'branch', branchId: 'B' } });
  if (phonesSent().includes('233246666666')) throw new Error('reached branch B');
});
await t('department includes its sub-departments, all branches', async () => {
  reset();
  await send({ branchId: null, message: 'x', audience: { type: 'department', departmentId: 'media' } });
  eq(phonesSent(), ['233241111111', '233242222222', '233246666666']);
});
await t('cell audience', async () => {
  reset();
  await send({ branchId: null, message: 'x', audience: { type: 'cell', cellId: 'c1' } });
  eq(phonesSent(), ['233241111111']);
});
await t('custom numbers', async () => {
  reset();
  const m = await send({ branchId: null, message: 'test', audience: { type: 'custom', phones: ['0207777777', 'junk'] } });
  eq(phonesSent(), ['233207777777']); eq(m.recipientsCount, 1);
});
await t('no valid recipients → failed with reason', async () => {
  const m = await send({ branchId: null, message: 'x', audience: { type: 'custom', phones: ['junk'] } });
  eq(m.status, 'failed'); if (!m.error) throw new Error('no error');
});
await t('absentees: active, non-child members not checked in', async () => {
  reset();
  await db.doc('services/s1').set({ branchId: 'A', date: '2026-11-15', type: 'Sunday Service', count: 1 });
  await db.doc('services/s1/checkins/kofi').set({ memberId: 'kofi' });
  await send({ branchId: 'A', message: 'Missed you {firstName}', audience: { type: 'absentees', serviceId: 's1' } });
  eq(phonesSent(), ['233241111111']);
});
await t('absentees: another branch cannot use branch A service', async () => {
  reset();
  const m = await send({ branchId: 'B', message: 'x', audience: { type: 'absentees', serviceId: 's1' } });
  eq(sentLog.length, 0); eq(m.status, 'failed');
});
await t('a message is only ever sent once', async () => {
  reset();
  const ref = await db.collection('smsMessages').add({ status: 'queued', branchId: null, message: 'once', audience: { type: 'custom', phones: ['0201111111'] } });
  await Promise.all([core.processMessage(db, ref.id), core.processMessage(db, ref.id), core.processMessage(db, ref.id)]);
  eq(sentLog.filter((x) => x.text === 'once').length, 1);
});

console.log('Automations (runTick)');
// Sunday 15 Nov 2026
const at = (hhmm) => new Date(`2026-11-15T${hhmm}:00Z`);
await t('scheduled message waits until its time', async () => {
  reset();
  const ref = await db.collection('smsMessages').add({ status: 'scheduled', branchId: null, message: 'later', sendAt: Timestamp.fromDate(at('10:00')), audience: { type: 'custom', phones: ['0201111111'] } });
  await core.runTick(db, at('09:55'));
  eq((await ref.get()).data().status, 'scheduled');
  await core.runTick(db, at('10:01'));
  eq((await ref.get()).data().status, 'sent');
});
await t('Peak Hour Prayer reminder: sent 30 min before, once per day', async () => {
  reset();
  await db.doc('programmes/peak').set({ active: true, title: 'Peak Hour Prayer', link: 'https://meet.example/peak', time: '05:00', days: [0, 3], remindMinutesBefore: 30,
    message: 'Join {title} at {time}: {link}', branchId: null, audience: { type: 'custom', phones: ['0208888888'] } });
  await core.runTick(db, at('04:20'));
  eq(sentLog.length, 0, 'too early;');
  await core.runTick(db, at('04:31'));
  eq(sentLog.map((x) => x.text), ['Join Peak Hour Prayer at 05:00: https://meet.example/peak']);
  await core.runTick(db, at('04:36'));
  eq(sentLog.length, 1, 'sent twice;');
});
await t('reminder does not fire on other days', async () => {
  reset();
  await db.doc('programmes/peak').update({ lastSentOn: '' });
  await core.runTick(db, new Date('2026-11-16T04:35:00Z')); // Monday
  eq(sentLog.length, 0);
});
await t('missed-service SMS after the set hour, once per service', async () => {
  reset();
  await db.doc('settings/sms').set({ absenteeEnabled: true, absenteeHour: 15, absenteeTemplate: 'We missed you {firstName}' }, { merge: true });
  await core.runTick(db, at('14:50'));
  eq(sentLog.length, 0, 'before hour;');
  await core.runTick(db, at('15:05'));
  eq(sentLog.map((x) => x.text), ['We missed you ama']);
  await core.runTick(db, at('15:10'));
  eq(sentLog.length, 1, 'repeated;');
});
await t('services with no attendance taken are ignored', async () => {
  reset();
  await db.doc('services/s2').set({ branchId: 'A', date: '2026-11-15', type: 'Sunday Service', count: 0 });
  await core.runTick(db, at('15:20'));
  eq(sentLog.length, 0);
});
await t('birthday greetings once a day', async () => {
  reset();
  await db.doc('settings/sms').set({ birthdayEnabled: true, birthdayTemplate: 'Happy birthday {firstName}!' }, { merge: true });
  await core.runTick(db, at('06:30'));
  eq(sentLog.length, 0, 'before 7am;');
  await core.runTick(db, at('07:05'));
  eq(sentLog.map((x) => x.text), ['Happy birthday ama!']);
  await core.runTick(db, at('09:00'));
  eq(sentLog.length, 1);
});

console.log('Welfare dues reminders');
await db.doc('settings/welfare').set({ amount: 20, startMonth: '2026-09', remindEnabled: true, remindDay: 15, template: 'Hi {firstName}, welfare for {months} (GH₵{amount}) is due. Pay: {link}' });
await db.doc('settings/payments').set({ publicSiteUrl: 'https://togg.example' });
await M('wpaid', { phone: '0261000001', joinedAt: '2025-01-01' });
await M('wowes', { phone: '0261000002', joinedAt: '2025-01-01' });
await M('wnew', { phone: '0261000003', joinedAt: '2026-11-02' });
await M('wexempt', { phone: '0261000004', welfareExempt: true });
await M('wkid', { phone: '0261000005', category: 'child' });
await db.collection('giving').add({ type: 'welfare', memberId: 'wpaid', date: '2026-09-10', forMonths: ['2026-09', '2026-10'], amount: 40 });
await db.collection('giving').add({ type: 'welfare', memberId: 'wpaid', date: '2026-11-03', amount: 20 }); // old-style record without forMonths
await db.collection('giving').add({ type: 'welfare', memberId: 'wnew', date: '2026-11-05', forMonths: ['2026-11'], amount: 20 });
const nov = new Date('2026-11-15T10:00:00Z');
await t('works out who owes and how much', async () => {
  const list = await core.welfareDefaulters(db, 'A', nov);
  const by = Object.fromEntries(list.map((r) => [r.firstName, r.vars]));
  if (by.wpaid) throw new Error('fully paid member listed');
  if (by.wnew) throw new Error('new member listed for months before they joined');
  if (by.wexempt || by.wkid) throw new Error('exempt member or child listed');
  eq(by.wowes, { months: 'Sep 2026, Oct 2026, Nov 2026', amount: '60.00', link: 'https://togg.example/pay?for=welfare' });
});
await t('personalised reminder text', async () => {
  reset();
  await send({ branchId: 'A', message: 'Hi {firstName}, welfare for {months} (GH₵{amount}) is due. Pay: {link}', audience: { type: 'welfare_defaulters' } }, nov);
  const t1 = sentLog.find((x) => x.to.includes('233261000002'));
  eq(t1?.text, 'Hi wowes, welfare for Sep 2026, Oct 2026, Nov 2026 (GH₵60.00) is due. Pay: https://togg.example/pay?for=welfare');
  if (sentLog.some((x) => x.to.includes('233261000001'))) throw new Error('texted someone who paid');
});
await t('automatic monthly reminder, once on the set day', async () => {
  reset();
  await core.runTick(db, new Date('2026-11-15T08:30:00Z'));
  eq(sentLog.filter((x) => x.text.includes('welfare')).length, 0, 'before 9am;');
  await core.runTick(db, new Date('2026-11-15T09:05:00Z'));
  if (!sentLog.some((x) => x.to.includes('233261000002'))) throw new Error('not sent');
  const n = sentLog.length;
  await core.runTick(db, new Date('2026-11-15T09:30:00Z'));
  eq(sentLog.filter((x) => x.text.includes('welfare')).length, sentLog.slice(0, n).filter((x) => x.text.includes('welfare')).length, 'sent twice;');
});

console.log('Paystack (Cloud Functions version)');
await t('confirms a paid MoMo tithe once; ignores unknown references', async () => {
  await db.doc('secrets/paystack').set({ secretKey: 'sk_test_x' });
  await M('payer', { phone: '0277000111' });
  await db.doc('onlineGifts/TOGG-FN1').set({ purpose: 'tithe', projectId: '', branchId: 'A', name: 'P', phone: '0277000111', phoneKey: '277000111', email: '', amount: 50, currency: 'GHS', status: 'pending', createdAt: new Date() });
  await db.doc('onlineGifts/TOGG-FN2').set({ purpose: 'tithe', projectId: '', branchId: 'A', name: 'Fake', phone: '', phoneKey: '', email: '', amount: 9999, currency: 'GHS', status: 'pending', createdAt: new Date() });
  const fake = async (url) => url.endsWith('TOGG-FN1')
    ? { status: 200, json: async () => ({ status: true, data: { status: 'success', reference: 'TOGG-FN1', amount: 5000, currency: 'GHS', channel: 'mobile_money', paid_at: '2026-11-22T10:00:00Z' } }) }
    : { status: 400, json: async () => ({ status: false, message: 'not found' }) };
  eq(await core.verifyOnlineGifts(db, new Date(), fake), 1);
  eq(await core.verifyOnlineGifts(db, new Date(), fake), 0);
  const g = (await db.doc('giving/ps_TOGG-FN1').get()).data();
  eq([g.amount, g.method, g.memberId, g.type], [50, 'momo', 'payer', 'tithe']);
  eq((await db.doc('onlineGifts/TOGG-FN2').get()).data().status, 'pending');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
