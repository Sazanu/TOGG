// Runs sms-server/Code.js (Google Apps Script) in Node against the Firestore emulator.
// firebase emulators:exec --only firestore --project demo-sms "node sms-server/test/apps-script.test.cjs"
const fs = require('fs'); const vm = require('vm'); const { execFileSync } = require('child_process');
const PROJECT = 'demo-sms'; const HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const BASE = `http://${HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
const external = []; // calls to SMS providers
let providerReply = '{"status":"success"}';
const paystack = {}; // reference -> verify response
function curl(url, opt = {}) {
  const args = ['-sS', '-X', (opt.method || 'get').toUpperCase(), '-w', '\n%{http_code}', url, '-H', 'Content-Type: application/json'];
  for (const [k, v] of Object.entries(opt.headers || {})) args.push('-H', `${k}: ${v}`);
  if (opt.payload) args.push('--data-binary', opt.payload);
  const out = execFileSync('curl', args, { encoding: 'utf8', maxBuffer: 64 << 20 });
  const i = out.lastIndexOf('\n'); return { text: out.slice(0, i), code: Number(out.slice(i + 1)) };
}
const sandbox = {
  console, Date, JSON, Math, Number, String, Array, Object, Error, encodeURIComponent,
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => ({ FIRESTORE_BASE: BASE, TEST_TOKEN: 'owner' })[k] ?? null }) },
  ScriptApp: { getOAuthToken: () => 'x' },
  UrlFetchApp: { fetch: (url, opt) => {
    if (url.startsWith('https://api.paystack.co/transaction/verify/')) {
      const ref = decodeURIComponent(url.split('/').pop()); external.push({ url, opt });
      const r = paystack[ref] ?? { status: false, message: 'Transaction reference not found' };
      return { getResponseCode: () => (paystack[ref] ? 200 : 400), getContentText: () => JSON.stringify(r) };
    }
    if (!url.startsWith('http://' + HOST)) { external.push({ url, opt }); return { getResponseCode: () => 200, getContentText: () => providerReply }; }
    const r = curl(url, opt); return { getResponseCode: () => r.code, getContentText: () => r.text };
  } },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ setMimeType: () => t }) },
  Logger: { log: () => {} },
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(__dirname + '/../Code.js', 'utf8'), sandbox);
const S = sandbox;

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ✓', name); } catch (e) { fail++; console.log('  ✗', name, '\n     ', e.message); } };
const eq = (a, b, msg = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); };
const sentPhones = () => S.LOG_SENT.flatMap((x) => x.to).sort();
const reset = () => { S.LOG_SENT.length = 0; external.length = 0; };
const put = (path, data) => { const ok = curl(`${BASE}/${path}`, { method: 'patch', headers: { Authorization: 'Bearer owner' }, payload: JSON.stringify({ fields: S.toFields_(data) }) }); if (ok.code >= 300) throw new Error(ok.text); };
curl(`http://${HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'delete' });

const M = (id, o) => put(`members/${id}`, { firstName: id, lastName: 'X', status: 'active', category: 'adult', branchId: 'A', departmentIds: [], cellId: null, dob: '', ...o });
M('ama', { phone: '0241111111', departmentIds: ['choir'], cellId: 'c1', dob: '1990-11-15' });
M('kofi', { phone: '+233 24 222 2222', departmentIds: ['media'] });
M('yaw', { phone: '0243333333', status: 'visitor' });
M('esi', { phone: '0244444444', status: 'inactive' });
M('kid', { phone: '0245555555', category: 'child' });
M('dup', { phone: '024 111 1111' });
M('bee', { phone: '0246666666', branchId: 'B', departmentIds: ['choir'] });
put('departments/media', { name: 'Media', parentId: null }); put('departments/choir', { name: 'Choir', parentId: 'media' });
put('settings/sms', { provider: 'log', churchName: 'TOGG' });
let n = 0;
const send = (data, now) => { const id = `m${++n}`; put(`smsMessages/${id}`, { status: 'queued', kind: 'instant', ...data }); S.processMessage(id, now); return S.fs.get(`smsMessages/${id}`).data; };

console.log('Apps Script SMS server');
t('phone formats', () => { eq(S.normalizePhone('0241234567'), '233241234567'); eq(S.normalizePhone('+233 24 123 4567'), '233241234567'); eq(S.normalizePhone('+231 775192729'), '231775192729'); eq(S.normalizePhone('12'), null); });
t('branch audience: active only, de-duplicated, personalised', () => {
  reset(); const m = send({ branchId: 'A', message: 'Hi {firstName} from {church}', audience: { type: 'branch', branchId: 'A' } });
  eq(m.status, 'sent'); eq(m.recipientsCount, 3); eq(sentPhones(), ['233241111111', '233242222222', '233245555555']);
  if (!S.LOG_SENT.some((x) => x.text === 'Hi kofi from TOGG')) throw new Error('not personalised');
});
t('branch lock', () => { reset(); send({ branchId: 'A', message: 'x', audience: { type: 'branch', branchId: 'B' } }); if (sentPhones().includes('233246666666')) throw new Error('reached B'); });
t('department with sub-departments', () => { reset(); send({ branchId: null, message: 'x', audience: { type: 'department', departmentId: 'media' } }); eq(sentPhones(), ['233241111111', '233242222222', '233246666666']); });
t('cell', () => { reset(); send({ branchId: null, message: 'x', audience: { type: 'cell', cellId: 'c1' } }); eq(sentPhones(), ['233241111111']); });
t('no recipients → failed with reason', () => { const m = send({ branchId: null, message: 'x', audience: { type: 'custom', phones: ['junk'] } }); eq(m.status, 'failed'); if (!m.error) throw new Error('no error'); });
t('absentees', () => {
  reset(); put('services/s1', { branchId: 'A', date: '2026-11-15', type: 'Sunday Service', count: 1 }); put('services/s1/checkins/kofi', { memberId: 'kofi' });
  send({ branchId: 'A', message: 'Missed you', audience: { type: 'absentees', serviceId: 's1' } }); eq(sentPhones(), ['233241111111']);
});
t('sent only once even if processed twice', () => {
  reset(); put('smsMessages/once', { status: 'queued', branchId: null, message: 'once', audience: { type: 'custom', phones: ['0201111111'] } });
  S.processMessage('once'); S.processMessage('once'); eq(S.LOG_SENT.filter((x) => x.text === 'once').length, 1);
});
t('stuck queued messages are picked up by the web-app ping', () => {
  reset(); put('smsMessages/stuck1', { status: 'queued', branchId: null, message: 'stuck', audience: { type: 'custom', phones: ['0207000001'] } });
  const out = JSON.parse(S.doGet({ parameter: {} })); eq(out.ok, true); eq(S.fs.get('smsMessages/stuck1').data.status, 'sent');
  if (!S.fs.get('meta/heartbeat')) throw new Error('no heartbeat');
});
const at = (hhmm) => new Date(`2026-11-15T${hhmm}:00Z`);
t('scheduled waits for its time', () => {
  reset(); put('smsMessages/later', { status: 'scheduled', branchId: null, message: 'later', sendAt: at('10:00'), audience: { type: 'custom', phones: ['0201111111'] } });
  S.runTick(at('09:55')); eq(S.fs.get('smsMessages/later').data.status, 'scheduled'); S.runTick(at('10:01')); eq(S.fs.get('smsMessages/later').data.status, 'sent');
});
t('Peak Hour Prayer reminder once, 30 min before', () => {
  reset(); put('programmes/peak', { active: true, title: 'Peak Hour Prayer', link: 'https://meet/x', time: '05:00', days: [0, 3], remindMinutesBefore: 30, message: 'Join {title} at {time}: {link}', branchId: null, audience: { type: 'custom', phones: ['0208888888'] } });
  S.runTick(at('04:20')); eq(S.LOG_SENT.length, 0); S.runTick(at('04:31')); eq(S.LOG_SENT.map((x) => x.text), ['Join Peak Hour Prayer at 05:00: https://meet/x']); S.runTick(at('04:36')); eq(S.LOG_SENT.length, 1);
});
t('missed-service SMS after the hour, once', () => {
  reset(); put('settings/sms', { provider: 'log', churchName: 'TOGG', absenteeEnabled: true, absenteeHour: 15, absenteeTemplate: 'We missed you {firstName}', absenteeServiceTypes: ['Sunday Service'] });
  S.runTick(at('14:50')); eq(S.LOG_SENT.length, 0); S.runTick(at('15:05')); eq(S.LOG_SENT.map((x) => x.text), ['We missed you ama']); S.runTick(at('15:10')); eq(S.LOG_SENT.length, 1);
});
t('birthdays once a day', () => {
  reset(); put('settings/sms', { provider: 'log', churchName: 'TOGG', birthdayEnabled: true, birthdayTemplate: 'Happy birthday {firstName}!' });
  S.runTick(at('06:30')); eq(S.LOG_SENT.length, 0); S.runTick(at('07:05')); eq(S.LOG_SENT.map((x) => x.text), ['Happy birthday ama!']); S.runTick(at('09:00')); eq(S.LOG_SENT.length, 1);
});
t('welfare defaulters: months, amount, link', () => {
  reset(); put('settings/welfare', { amount: 20, startMonth: '2026-09', remindEnabled: true, remindDay: 15, template: 'Hi {firstName}, {months} (GH₵{amount}): {link}' });
  put('settings/payments', { publicSiteUrl: 'https://togg.example' });
  M('wowes', { phone: '0261000002', joinedAt: '2025-01-01' }); M('wpaid', { phone: '0261000001', joinedAt: '2025-01-01' });
  put('giving/w1', { type: 'welfare', memberId: 'wpaid', date: '2026-09-10', forMonths: ['2026-09', '2026-10', '2026-11'], amount: 60 });
  const list = S.welfareDefaulters_('A', new Date('2026-11-15T10:00:00Z'));
  const by = Object.fromEntries(list.map((r) => [r.firstName, r.vars]));
  eq(by.wowes, { months: 'Sep 2026, Oct 2026, Nov 2026', amount: '60.00', link: 'https://togg.example/pay?for=welfare' });
  if (by.wpaid) throw new Error('paid member listed');
});
t('real provider call: Arkesel request shape', () => {
  reset(); put('settings/sms', { provider: 'arkesel', senderId: 'TOGGCHURCH12', churchName: 'TOGG' }); put('secrets/sms', { apiKey: 'KEY123' });
  send({ branchId: null, message: 'Hello', audience: { type: 'custom', phones: ['0241234567'] } });
  const c = external[0]; eq(c.url, 'https://sms.arkesel.com/api/v2/sms/send'); eq(c.opt.headers['api-key'], 'KEY123');
  eq(JSON.parse(c.opt.payload), { sender: 'TOGGCHURCH1', message: 'Hello', recipients: ['233241234567'] });
});
t('Gonlinesites: request exactly as in their API link', () => {
  reset(); put('settings/sms', { provider: 'gonlinesites', senderId: 'TOGG', churchName: 'TOGG' }); put('secrets/sms', { apiKey: 'TESTKEY==' });
  providerReply = 'OK: 2 messages queued';
  const m = send({ branchId: null, message: 'Hello church & friends', audience: { type: 'custom', phones: ['0241234567', '0201112222'] } });
  const u = new URL(external[0].url);
  eq(u.origin + u.pathname, 'https://sms.gonlinesites.com/app/sms/api');
  eq(Object.fromEntries(u.searchParams), { action: 'send-sms', api_key: 'TESTKEY==', to: '233241234567,233201112222', from: 'TOGG', sms: 'Hello church & friends' });
  eq(m.status, 'sent'); eq(m.sentCount, 2); eq(m.providerResponse, 'OK: 2 messages queued');
});
t('Gonlinesites: an error reply is recorded as failed, with the reason', () => {
  reset(); providerReply = 'Error: Invalid API Key';
  const m = send({ branchId: null, message: 'x', audience: { type: 'custom', phones: ['0241234567'] } });
  eq(m.status, 'failed'); if (!/Invalid API Key/.test(m.error)) throw new Error('reason missing: ' + m.error);
  providerReply = 'Insufficient balance';
  const m2 = send({ branchId: null, message: 'y', audience: { type: 'custom', phones: ['0241234567'] } });
  eq(m2.status, 'failed');
  providerReply = '{"status":"success"}';
});
t('Gonlinesites JSON replies: "ok" is sent, numbered codes are failures with the reason', () => {
  reset(); put('settings/sms', { provider: 'gonlinesites', senderId: 'TOGG', churchName: 'TOGG' }); put('secrets/sms', { apiKey: 'TESTKEY==' });
  providerReply = '{"code":"ok","message":"Successfully Send","balance":569}';
  eq(send({ branchId: null, message: 'a', audience: { type: 'custom', phones: ['0241234567'] } }).status, 'sent');
  providerReply = '{"code":"106","message":"Invalid Sender id"}';
  const m = send({ branchId: null, message: 'b', audience: { type: 'custom', phones: ['0241234567'] } });
  eq(m.status, 'failed'); if (!/Invalid Sender id/.test(m.error)) throw new Error('reason missing: ' + m.error);
  providerReply = '{"code":"112","message":"Destination number contain in blacklist number"}';
  eq(send({ branchId: null, message: 'c', audience: { type: 'custom', phones: ['0241234567'] } }).status, 'failed');
  providerReply = '{"status":"success"}';
});
console.log('Paystack online giving');
const ok = (ref, pesewas, extra = {}) => ({ status: true, message: 'Verification successful', data: { status: 'success', reference: ref, amount: pesewas, currency: 'GHS', channel: 'mobile_money', paid_at: '2026-11-22T09:15:00.000Z', fees: 195, ...extra } });
const gift = (id, o) => put(`onlineGifts/${id}`, { purpose: 'tithe', projectId: '', branchId: 'A', name: 'Ama', phone: '024 111 1111', phoneKey: '241111111', email: '', amount: 100, currency: 'GHS', status: 'pending', createdAt: new Date(), ...o });
const docOf = (p) => S.fs.get(p)?.data;
t('no secret key → nothing is verified', () => { gift('TOGG-A1', {}); eq(S.verifyOnlineGifts(new Date()), 0); eq(docOf('onlineGifts/TOGG-A1').status, 'pending'); });
t('a real MoMo tithe is confirmed and recorded once, matched to the member', () => {
  put('secrets/paystack', { secretKey: 'sk_test_x' });
  paystack['TOGG-A1'] = ok('TOGG-A1', 10000);
  eq(S.verifyOnlineGifts(new Date()), 1);
  const g = docOf('giving/ps_TOGG-A1');
  eq([g.amount, g.type, g.method, g.memberId, g.branchId, g.date], [100, 'tithe', 'momo', 'ama', 'A', '2026-11-22']);
  if (!/fee GH₵1.95/.test(g.note)) throw new Error('fee missing');
  eq(docOf('onlineGifts/TOGG-A1').status, 'success');
  eq(S.verifyOnlineGifts(new Date()), 0);
  eq(external.filter((x) => x.url.includes('TOGG-A1')).every((x) => x.opt.headers.Authorization === 'Bearer sk_test_x'), true);
});
t('the amount recorded is what Paystack says was paid, not what the page said', () => {
  gift('TOGG-A2', { amount: 5000 }); paystack['TOGG-A2'] = ok('TOGG-A2', 500);
  S.verifyOnlineGifts(new Date()); eq(docOf('giving/ps_TOGG-A2').amount, 5);
});
t('a payment Paystack does not know stays pending (cannot be faked)', () => {
  gift('TOGG-FAKE', {}); S.verifyOnlineGifts(new Date());
  eq(docOf('onlineGifts/TOGG-FAKE').status, 'pending'); if (docOf('giving/ps_TOGG-FAKE')) throw new Error('recorded a fake payment');
});
t('failed payments are marked failed with the reason', () => {
  gift('TOGG-F', {}); paystack['TOGG-F'] = { status: true, data: { status: 'failed', reference: 'TOGG-F', gateway_response: 'Insufficient funds', amount: 10000, currency: 'GHS' } };
  S.verifyOnlineGifts(new Date()); eq(docOf('onlineGifts/TOGG-F').status, 'failed'); eq(docOf('onlineGifts/TOGG-F').error, 'Insufficient funds');
});
t('wrong currency is refused', () => {
  gift('TOGG-USD', {}); paystack['TOGG-USD'] = ok('TOGG-USD', 10000, { currency: 'USD' });
  S.verifyOnlineGifts(new Date()); eq(docOf('onlineGifts/TOGG-USD').status, 'failed'); if (docOf('giving/ps_TOGG-USD')) throw new Error('recorded');
});
t('abandoned checkouts are closed after 3 hours', () => {
  gift('TOGG-OLD', { createdAt: new Date(Date.now() - 4 * 3600e3) }); paystack['TOGG-OLD'] = { status: true, data: { status: 'abandoned', reference: 'TOGG-OLD' } };
  S.verifyOnlineGifts(new Date()); eq(docOf('onlineGifts/TOGG-OLD').status, 'abandoned');
});
t('project gifts raise the project total', () => {
  put('projects/roof', { title: 'Roof', goal: 1000, raised: 100, donors: 1, public: true });
  gift('TOGG-P', { purpose: 'project', projectId: 'roof', phoneKey: '', name: 'Visitor' }); paystack['TOGG-P'] = ok('TOGG-P', 25050, { channel: 'card' });
  S.verifyOnlineGifts(new Date());
  const pr = docOf('projects/roof'); eq([pr.raised, pr.donors], [350.5, 2]);
  const g = docOf('giving/ps_TOGG-P'); eq([g.type, g.method, g.projectId, g.memberId, g.memberName], ['project', 'card', 'roof', null, 'Visitor']);
});
t('charity gifts go to the Charity Foundation, not church giving', () => {
  gift('TOGG-C', { purpose: 'charity', name: 'Kofi Donor' }); paystack['TOGG-C'] = ok('TOGG-C', 20000);
  S.verifyOnlineGifts(new Date());
  const c = docOf('charity/ps_TOGG-C'); eq([c.type, c.amount, c.donor, c.form], ['support', 200, 'ama X', 'cash']);
  if (docOf('giving/ps_TOGG-C')) throw new Error('also put in giving');
});
t('welfare gifts count for the month paid', () => {
  gift('TOGG-W', { purpose: 'welfare' }); paystack['TOGG-W'] = ok('TOGG-W', 2000);
  S.verifyOnlineGifts(new Date()); eq(docOf('giving/ps_TOGG-W').forMonths, ['2026-11']);
});
t('the web-app ping also confirms payments', () => {
  gift('TOGG-H', {}); paystack['TOGG-H'] = ok('TOGG-H', 3000);
  const out = JSON.parse(S.doGet({ parameter: {} })); eq(out.payments, 1); eq(docOf('onlineGifts/TOGG-H').status, 'success');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
