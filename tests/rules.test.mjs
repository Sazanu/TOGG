import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, query, where, updateDoc, writeBatch, serverTimestamp, deleteDoc, increment, addDoc, Timestamp } from 'firebase/firestore';

const env = await initializeTestEnvironment({
  projectId: 'demo-togg',
  firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
});
let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '\n    ', e.message.split('\n')[0]); }
}
const db = (uid) => env.authenticatedContext(uid, { email: `${uid}@x.com` }).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const base = { email: 'x', displayName: 'X', phone: '', branchId: null, departmentIds: [], createdAt: serverTimestamp() };

console.log('Bootstrap');
await t('first sign-up becomes head pastor (with setup doc)', () => {
  const d = db('head'); const b = writeBatch(d);
  b.set(doc(d, 'users/head'), { ...base, role: 'head_pastor', active: true });
  b.set(doc(d, 'meta/setup'), { by: 'head', at: serverTimestamp() });
  return assertSucceeds(b.commit());
});
await t('second person cannot claim head pastor', () => {
  const d = db('evil'); const b = writeBatch(d);
  b.set(doc(d, 'users/evil'), { ...base, role: 'head_pastor', active: true });
  b.set(doc(d, 'meta/setup'), { by: 'evil', at: serverTimestamp() });
  return assertFails(b.commit());
});
await t('second person cannot self-assign a role', () => assertFails(setDoc(doc(db('evil'), 'users/evil'), { ...base, role: 'branch_pastor', active: true })));
await t('second person can sign up as pending', () => assertSucceeds(setDoc(doc(db('evil'), 'users/evil'), { ...base, role: 'pending', active: false })));
await t('pending user cannot promote themselves', () => assertFails(updateDoc(doc(db('evil'), 'users/evil'), { role: 'head_pastor', active: true })));
await t('pending user can edit own name', () => assertSucceeds(updateDoc(doc(db('evil'), 'users/evil'), { displayName: 'Ev' })));

// seed data with rules disabled
await env.withSecurityRulesDisabled(async (ctx) => {
  const d = ctx.firestore();
  await setDoc(doc(d, 'branches/A'), { name: 'Accra', isHQ: true });
  await setDoc(doc(d, 'branches/B'), { name: 'Kumasi', isHQ: false });
  const u = (id, role, branchId, extra = {}) => setDoc(doc(d, `users/${id}`), { ...base, role, branchId, active: true, ...extra });
  await u('assoc', 'associate_pastor', null);
  await u('bpA', 'branch_pastor', 'A');
  await u('secA', 'secretary', 'A');
  await u('finA', 'finance', 'A');
  await u('ushA', 'usher', 'A');
  await u('dlA', 'dept_leader', 'A');
  await u('disabled', 'branch_pastor', 'A', { active: false });
  await u('target', 'usher', 'B');
  const m = (id, branchId) => setDoc(doc(d, `members/${id}`), { firstName: 'M', lastName: id, branchId, category: 'adult', status: 'active', departmentIds: [] });
  await m('m1', 'A'); await m('m2', 'B');
  await setDoc(doc(d, 'services/sA'), { branchId: 'A', date: '2026-11-08', type: 'Sunday Service', title: '', count: 0, visitors: 0 });
  await setDoc(doc(d, 'services/sB'), { branchId: 'B', date: '2026-11-08', type: 'Sunday Service', title: '', count: 0, visitors: 0 });
  await setDoc(doc(d, 'giving/gA'), { branchId: 'A', date: '2026-11-08', amount: 10, type: 'tithe' });
  await setDoc(doc(d, 'giving/gB'), { branchId: 'B', date: '2026-11-08', amount: 10, type: 'tithe' });
});
const member = (branchId, status = 'active') => ({ firstName: 'N', lastName: 'N', branchId, category: 'adult', status, departmentIds: [] });

console.log('Members & branch isolation');
await t('pending user cannot read members', () => assertFails(getDocs(query(collection(db('evil'), 'members'), where('branchId', '==', 'A')))));
await t('disabled user cannot read members', () => assertFails(getDocs(query(collection(db('disabled'), 'members'), where('branchId', '==', 'A')))));
await t('head pastor lists all members', () => assertSucceeds(getDocs(collection(db('head'), 'members'))));
await t('associate pastor lists all members', () => assertSucceeds(getDocs(collection(db('assoc'), 'members'))));
await t('branch pastor A lists branch A members', () => assertSucceeds(getDocs(query(collection(db('bpA'), 'members'), where('branchId', '==', 'A')))));
await t('branch pastor A cannot list all members', () => assertFails(getDocs(collection(db('bpA'), 'members'))));
await t('branch pastor A cannot read branch B member', () => assertFails(getDoc(doc(db('bpA'), 'members/m2'))));
await t('branch pastor A adds member to A', () => assertSucceeds(addDoc(collection(db('bpA'), 'members'), member('A'))));
await t('branch pastor A cannot add member to B', () => assertFails(addDoc(collection(db('bpA'), 'members'), member('B'))));
await t('branch pastor A cannot move member to B', () => assertFails(updateDoc(doc(db('bpA'), 'members/m1'), { branchId: 'B' })));
await t('secretary A edits member', () => assertSucceeds(updateDoc(doc(db('secA'), 'members/m1'), { lastName: 'Edited' })));
await t('dept leader cannot list the whole branch', () => assertFails(getDocs(query(collection(db('dlA'), 'members'), where('branchId', '==', 'A')))));
await t('dept leader cannot edit members', () => assertFails(updateDoc(doc(db('dlA'), 'members/m1'), { lastName: 'X' })));
await t('usher can add a first-time visitor', () => assertSucceeds(addDoc(collection(db('ushA'), 'members'), member('A', 'visitor'))));
await t('usher cannot add an active member', () => assertFails(addDoc(collection(db('ushA'), 'members'), member('A', 'active'))));
await t('finance cannot delete members', () => assertFails(deleteDoc(doc(db('finA'), 'members/m1'))));

console.log('Attendance');
await t('usher reads A services', () => assertSucceeds(getDocs(query(collection(db('ushA'), 'services'), where('branchId', '==', 'A')))));
await t('usher cannot read B services', () => assertFails(getDoc(doc(db('ushA'), 'services/sB'))));
await t('usher checks member in (batch)', () => {
  const d = db('ushA'); const b = writeBatch(d);
  b.set(doc(d, 'services/sA/checkins/m1'), { memberId: 'm1', name: 'M', category: 'adult', at: serverTimestamp() });
  b.update(doc(d, 'services/sA'), { count: increment(1) });
  return assertSucceeds(b.commit());
});
await t('usher cannot check in to B', () => assertFails(setDoc(doc(db('ushA'), 'services/sB/checkins/m2'), { memberId: 'm2' })));
await t('usher cannot move a service to another branch', () => assertFails(updateDoc(doc(db('ushA'), 'services/sA'), { branchId: 'B' })));
await t('usher cannot delete a service', () => assertFails(deleteDoc(doc(db('ushA'), 'services/sA'))));
await t('finance cannot read services', () => assertFails(getDoc(doc(db('finA'), 'services/sA'))));
await t('checkin id must match memberId', () => assertFails(setDoc(doc(db('ushA'), 'services/sA/checkins/zzz'), { memberId: 'm1' })));

console.log('Giving');
await t('finance A reads A giving', () => assertSucceeds(getDocs(query(collection(db('finA'), 'giving'), where('branchId', '==', 'A')))));
await t('finance A cannot read B giving', () => assertFails(getDoc(doc(db('finA'), 'giving/gB'))));
await t('finance A records a tithe', () => assertSucceeds(addDoc(collection(db('finA'), 'giving'), { branchId: 'A', date: '2026-11-08', amount: 50, type: 'tithe' })));
await t('negative amount rejected', () => assertFails(addDoc(collection(db('finA'), 'giving'), { branchId: 'A', date: '2026-11-08', amount: -5, type: 'tithe' })));
await t('secretary cannot see giving', () => assertFails(getDoc(doc(db('secA'), 'giving/gA'))));
await t('usher cannot see giving', () => assertFails(getDocs(query(collection(db('ushA'), 'giving'), where('branchId', '==', 'A')))));
await t('head pastor reads all giving', () => assertSucceeds(getDocs(collection(db('head'), 'giving'))));

console.log('Users & roles');
await t('branch pastor cannot list users', () => assertFails(getDocs(collection(db('bpA'), 'users'))));
await t('associate assigns branch role', () => assertSucceeds(updateDoc(doc(db('assoc'), 'users/target'), { role: 'branch_pastor', branchId: 'B' })));
await t('scoped role requires a branch', () => assertFails(updateDoc(doc(db('assoc'), 'users/target'), { role: 'secretary', branchId: null })));
await t('associate cannot make a head pastor', () => assertFails(updateDoc(doc(db('assoc'), 'users/target'), { role: 'head_pastor', branchId: null })));
await t('associate cannot edit the head pastor', () => assertFails(updateDoc(doc(db('assoc'), 'users/head'), { active: false })));
await t('head pastor makes an associate pastor', () => assertSucceeds(updateDoc(doc(db('head'), 'users/target'), { role: 'associate_pastor', branchId: null })));
await t('head pastor cannot change own role', () => assertFails(updateDoc(doc(db('head'), 'users/head'), { role: 'usher' })));
await t('branches & departments: only global may write', async () => {
  await assertFails(setDoc(doc(db('bpA'), 'branches/C'), { name: 'C' }));
  await assertSucceeds(setDoc(doc(db('assoc'), 'branches/C'), { name: 'C' }));
  await assertFails(setDoc(doc(db('bpA'), 'departments/d1'), { name: 'Choir' }));
});

console.log('Public sign-up forms');
const reg = (o = {}) => ({ kind: 'visitor', firstName: 'Ama', lastName: 'K', phone: '024', email: '', gender: '', category: 'adult', branchId: 'A', invitedBy: '', prayerRequest: '', status: 'new', createdAt: serverTimestamp(), ...o });
await t('anonymous can read branch list', () => assertSucceeds(getDocs(collection(anon(), 'branches'))));
await t('anonymous can submit visitor form', () => assertSucceeds(addDoc(collection(anon(), 'registrations'), reg())));
await t('unknown branch rejected', () => assertFails(addDoc(collection(anon(), 'registrations'), reg({ branchId: 'ZZZ' }))));
await t('extra fields rejected', () => assertFails(addDoc(collection(anon(), 'registrations'), reg({ role: 'head_pastor' }))));
await t('pre-approved status rejected', () => assertFails(addDoc(collection(anon(), 'registrations'), reg({ status: 'done' }))));
await t('anonymous cannot read sign-ups', () => assertFails(getDocs(collection(anon(), 'registrations'))));
await t('secretary A reads A sign-ups', () => assertSucceeds(getDocs(query(collection(db('secA'), 'registrations'), where('branchId', '==', 'A'), where('status', '==', 'new')))));
await t('anonymous cannot read members', () => assertFails(getDoc(doc(anon(), 'members/m1'))));

console.log('Department heads & cells');
await env.withSecurityRulesDisabled(async (ctx) => {
  const d = ctx.firestore();
  await setDoc(doc(d, 'users/headMedia'), { ...base, role: 'dept_leader', branchId: 'A', departmentIds: ['media', 'sound'], active: true });
  await setDoc(doc(d, 'users/cellLead'), { ...base, role: 'cell_leader', branchId: 'A', departmentIds: [], cellIds: ['c1'], active: true });
  await setDoc(doc(d, 'cells/c1'), { name: 'Asokwa', branchId: 'A', departmentId: 'media' });
  await setDoc(doc(d, 'cells/c2'), { name: 'Choir cell', branchId: 'A', departmentId: 'choir' });
  await setDoc(doc(d, 'members/inMedia'), { firstName: 'Med', lastName: 'Ia', branchId: 'A', category: 'adult', status: 'active', departmentIds: ['media', 'choir'], cellId: null });
  await setDoc(doc(d, 'members/inChoir'), { firstName: 'Cho', lastName: 'Ir', branchId: 'A', category: 'adult', status: 'active', departmentIds: ['choir'], cellId: 'c2' });
});
const dm = (o = {}) => ({ firstName: 'New', lastName: 'Member', branchId: 'A', category: 'adult', status: 'active', departmentIds: ['media'], ...o });
await t('dept head registers a member into their department', () => assertSucceeds(addDoc(collection(db('headMedia'), 'members'), dm())));
await t('dept head cannot register into another department', () => assertFails(addDoc(collection(db('headMedia'), 'members'), dm({ departmentIds: ['choir'] }))));
await t('dept head cannot register into another branch', () => assertFails(addDoc(collection(db('headMedia'), 'members'), dm({ branchId: 'B' }))));
await t('dept head edits a member of their department', () => assertSucceeds(updateDoc(doc(db('headMedia'), 'members/inMedia'), { phone: '0241', departmentIds: ['media', 'choir', 'sound'] })));
await t("dept head cannot strip another department", () => assertFails(updateDoc(doc(db('headMedia'), 'members/inMedia'), { departmentIds: ['media', 'sound'] })));
await t('dept head cannot edit members outside their departments', () => assertFails(updateDoc(doc(db('headMedia'), 'members/inChoir'), { phone: '1' })));
await t('dept head cannot delete members', () => assertFails(deleteDoc(doc(db('headMedia'), 'members/inMedia'))));
await t('dept heads no longer manage cells (cells stand alone)', () => assertFails(setDoc(doc(db('headMedia'), 'cells/c3'), { name: 'New cell', branchId: 'A' })));
await t('branch administrator creates a cell', () => assertSucceeds(setDoc(doc(db('secA'), 'cells/c3'), { name: 'New cell', branchId: 'A' })));
await t('dept head sees only their department members', () => assertSucceeds(getDocs(query(collection(db('headMedia'), 'members'), where('branchId', '==', 'A'), where('departmentIds', 'array-contains-any', ['media', 'sound'])))));
await t("dept head cannot read a member outside their departments", () => assertFails(getDoc(doc(db('headMedia'), 'members/inChoir'))));
await t('cell leader sees only their cell members', async () => {
  await assertSucceeds(getDocs(query(collection(db('cellLead'), 'members'), where('branchId', '==', 'A'), where('cellId', '==', 'c1'))));
  await assertFails(getDocs(query(collection(db('cellLead'), 'members'), where('branchId', '==', 'A'))));
  await assertFails(getDoc(doc(db('cellLead'), 'members/inChoir')));
});
await t('cell leader cannot create cells', () => assertFails(setDoc(doc(db('cellLead'), 'cells/c9'), { name: 'X', branchId: 'A', departmentId: 'media' })));
const rep = (o = {}) => ({ cellId: 'c1', branchId: 'A', departmentId: 'media', date: '2026-11-11', membersPresent: 8, firstTimers: 2, newConverts: 1, ...o });
await t('cell leader submits a report for their cell', () => assertSucceeds(setDoc(doc(db('cellLead'), 'cellReports/r1'), rep())));
await t('cell leader cannot report for another cell', () => assertFails(setDoc(doc(db('cellLead'), 'cellReports/r2'), rep({ cellId: 'c2', departmentId: 'choir' }))));
await t("report branch must match the cell's branch", () => assertFails(setDoc(doc(db('secA'), 'cellReports/r3'), rep({ branchId: 'B' }))));
await t('cell leader lists own cell reports', () => assertSucceeds(getDocs(query(collection(db('cellLead'), 'cellReports'), where('cellId', '==', 'c1'), where('branchId', '==', 'A')))));
await t("cell leader cannot list other cells' reports", () => assertFails(getDocs(query(collection(db('cellLead'), 'cellReports'), where('branchId', '==', 'A')))));
await t('dept head cannot read cell reports', () => assertFails(getDocs(query(collection(db('headMedia'), 'cellReports'), where('branchId', '==', 'A')))));
await t('cell leader adds a new contact as a visitor in their cell', () => assertSucceeds(addDoc(collection(db('cellLead'), 'members'), dm({ status: 'visitor', departmentIds: [], cellId: 'c1' }))));
await t('cell leader cannot add active members', () => assertFails(addDoc(collection(db('cellLead'), 'members'), dm({ departmentIds: [], cellId: 'c1' }))));
await t('cell leader puts an existing member into their cell', () => assertSucceeds(updateDoc(doc(db('cellLead'), 'members/m1'), { cellId: 'c1', updatedAt: serverTimestamp() })));
await t('cell leader removes them again', () => assertSucceeds(updateDoc(doc(db('cellLead'), 'members/m1'), { cellId: null, updatedAt: serverTimestamp() })));
await t('cell leader cannot move someone into another cell', () => assertFails(updateDoc(doc(db('cellLead'), 'members/m1'), { cellId: 'c2' })));
await t('cell leader cannot change other member fields', () => assertFails(updateDoc(doc(db('cellLead'), 'members/m1'), { cellId: 'c1', phone: '1' })));
await t('cell names are public (prayer form)', () => assertSucceeds(getDocs(collection(anon(), 'cells'))));

console.log('Department reports');
const rid = (dept, branch, type, month = '2026-11') => `${dept}_${branch}_${month}_${type}`;
const dr = (dept, branch, type, o = {}) => ({ departmentId: dept, branchId: branch, month: '2026-11', type, status: 'draft', summary: 'x', lines: [], activities: [], ...o });
await t('dept head reads a report that does not exist yet', () => assertSucceeds(getDoc(doc(db('headMedia'), 'deptReports', rid('media', 'A', 'budget')))));
await t('dept head saves a draft budget', () => assertSucceeds(setDoc(doc(db('headMedia'), 'deptReports', rid('media', 'A', 'budget')), dr('media', 'A', 'budget'))));
await t('dept head submits it', () => assertSucceeds(setDoc(doc(db('headMedia'), 'deptReports', rid('media', 'A', 'budget')), dr('media', 'A', 'budget', { status: 'submitted' }))));
await t('dept head cannot approve their own', () => assertFails(setDoc(doc(db('headMedia'), 'deptReports', rid('media', 'A', 'budget')), dr('media', 'A', 'budget', { status: 'approved' }))));
await t("dept head cannot write another department's report", () => assertFails(setDoc(doc(db('headMedia'), 'deptReports', rid('choir', 'A', 'report')), dr('choir', 'A', 'report'))));
await t('report data must match its id', () => assertFails(setDoc(doc(db('headMedia'), 'deptReports', rid('media', 'A', 'plan')), dr('media', 'B', 'plan'))));
await t('secretary cannot read reports', () => assertFails(getDoc(doc(db('secA'), 'deptReports', rid('media', 'A', 'budget')))));
await t('branch pastor lists branch reports for the month', () => assertSucceeds(getDocs(query(collection(db('bpA'), 'deptReports'), where('branchId', '==', 'A'), where('month', '==', '2026-11')))));
await t('branch pastor returns it with a comment', () => assertSucceeds(updateDoc(doc(db('bpA'), 'deptReports', rid('media', 'A', 'budget')), { status: 'returned', reviewComment: 'Too high', reviewedByName: 'P' })));
await t('reviewer cannot change the content', () => assertFails(updateDoc(doc(db('bpA'), 'deptReports', rid('media', 'A', 'budget')), { summary: 'changed' })));
await t('head pastor approves', () => assertSucceeds(updateDoc(doc(db('head'), 'deptReports', rid('media', 'A', 'budget')), { status: 'approved' })));
await t('dept head cannot edit once approved', () => assertFails(setDoc(doc(db('headMedia'), 'deptReports', rid('media', 'A', 'budget')), dr('media', 'A', 'budget', { status: 'submitted' }))));

console.log('SMS & settings');
const sms = (o = {}) => ({ branchId: 'A', message: 'Hello', audience: { type: 'all', branchId: 'A' }, kind: 'instant', status: 'queued', label: 'x', ...o });
await t('branch pastor sends SMS to their branch', () => assertSucceeds(addDoc(collection(db('bpA'), 'smsMessages'), sms())));
await t('secretary schedules SMS', () => assertSucceeds(addDoc(collection(db('secA'), 'smsMessages'), sms({ status: 'scheduled', kind: 'scheduled', sendAt: Timestamp.now() }))));
await t('branch user cannot text all branches', () => assertFails(addDoc(collection(db('bpA'), 'smsMessages'), sms({ branchId: null, audience: { type: 'all', branchId: null } }))));
await t('branch user cannot aim audience at another branch', () => assertFails(addDoc(collection(db('bpA'), 'smsMessages'), sms({ audience: { type: 'branch', branchId: 'B' } }))));
await t('cannot fake a sent status', () => assertFails(addDoc(collection(db('bpA'), 'smsMessages'), sms({ status: 'sent' }))));
await t('usher / finance / dept head cannot send SMS', async () => {
  await assertFails(addDoc(collection(db('ushA'), 'smsMessages'), sms()));
  await assertFails(addDoc(collection(db('finA'), 'smsMessages'), sms()));
  await assertFails(addDoc(collection(db('headMedia'), 'smsMessages'), sms()));
});
await t('head pastor texts every branch', () => assertSucceeds(addDoc(collection(db('head'), 'smsMessages'), sms({ branchId: null, audience: { type: 'all' } }))));
await t('branch pastor sees own branch history', () => assertSucceeds(getDocs(query(collection(db('bpA'), 'smsMessages'), where('branchId', '==', 'A')))));
await t('branch pastor creates a Peak Hour reminder', () => assertSucceeds(addDoc(collection(db('bpA'), 'programmes'), { branchId: 'A', title: 'Peak Hour Prayer', days: [1, 2], time: '05:00', audience: { type: 'all', branchId: 'A' }, active: true })));
await t('only admins change SMS settings', async () => {
  await assertFails(setDoc(doc(db('bpA'), 'settings/sms'), { provider: 'log' }));
  await assertSucceeds(setDoc(doc(db('head'), 'settings/sms'), { provider: 'arkesel' }));
});
await t('SMS API key: admin can save it…', () => assertSucceeds(setDoc(doc(db('head'), 'secrets/sms'), { apiKey: 'secret' })));
await t('…but nobody can read it back', async () => {
  await assertFails(getDoc(doc(db('head'), 'secrets/sms')));
  await assertFails(getDoc(doc(db('bpA'), 'secrets/sms')));
});

console.log('Accounts & counters');
await t('super admin creates a staff account', () => assertSucceeds(setDoc(doc(db('head'), 'users/newstaff'), { ...base, role: 'secretary', branchId: 'A', active: true })));
await t('associate cannot create a super admin', () => assertFails(setDoc(doc(db('assoc'), 'users/x1'), { ...base, role: 'head_pastor', branchId: null, active: true })));
await t('branch pastor cannot create accounts', () => assertFails(setDoc(doc(db('bpA'), 'users/x2'), { ...base, role: 'usher', branchId: 'A', active: true })));
await t('membership counter can only go up', async () => {
  await assertSucceeds(setDoc(doc(db('secA'), 'meta/counters'), { memberSeq: 5 }));
  await assertSucceeds(updateDoc(doc(db('headMedia'), 'meta/counters'), { memberSeq: 6 }));
  await assertFails(updateDoc(doc(db('secA'), 'meta/counters'), { memberSeq: 2 }));
  await assertFails(updateDoc(doc(db('ushA'), 'meta/counters'), { memberSeq: 7 }));
});

console.log('Access areas switched off by the Super Admin');
await env.withSecurityRulesDisabled(async (ctx) => {
  const d = ctx.firestore();
  await setDoc(doc(d, 'users/bpNoMoney'), { ...base, role: 'branch_pastor', branchId: 'A', active: true, revoked: ['finance', 'sms'] });
  await setDoc(doc(d, 'users/assocNoPrayer'), { ...base, role: 'associate_pastor', branchId: null, active: true, revoked: ['prayer'] });
});
await t('branch pastor with money switched off cannot see giving', () => assertFails(getDocs(query(collection(db('bpNoMoney'), 'giving'), where('branchId', '==', 'A')))));
await t('…or send SMS', () => assertFails(addDoc(collection(db('bpNoMoney'), 'smsMessages'), sms())));
await t('…but still manages members', () => assertSucceeds(getDocs(query(collection(db('bpNoMoney'), 'members'), where('branchId', '==', 'A')))));
await t('Super Admin switches an area off', () => assertSucceeds(updateDoc(doc(db('head'), 'users/bpA'), { revoked: ['attendance'] })));
await t('…and it takes effect', () => assertFails(getDocs(query(collection(db('bpA'), 'services'), where('branchId', '==', 'A')))));
await t('…and back on', async () => { await assertSucceeds(updateDoc(doc(db('head'), 'users/bpA'), { revoked: [] })); await assertSucceeds(getDocs(query(collection(db('bpA'), 'services'), where('branchId', '==', 'A')))); });
await t('a user cannot switch their own areas back on', () => assertFails(updateDoc(doc(db('bpNoMoney'), 'users/bpNoMoney'), { revoked: [] })));

console.log('Prayer requests');
const pr = (o = {}) => ({ kind: 'prayer', name: 'Ama', phone: '0241', phoneKey: '241', branchId: 'A', toLevel: 'branch_pastor', departmentId: '', cellId: '', text: 'Pray for me', mediaPath: '', mediaType: '', confidential: false, status: 'new', answerNote: '', memberId: '', createdAt: serverTimestamp(), ...o });
await t('anyone can send a prayer request', () => assertSucceeds(setDoc(doc(anon(), 'prayerRequests/p1'), pr())));
await t('…with a voice note path for that request only', async () => {
  await assertSucceeds(setDoc(doc(anon(), 'prayerRequests/p2'), pr({ mediaPath: 'prayer/p2/audio.webm', mediaType: 'audio' })));
  await assertFails(setDoc(doc(anon(), 'prayerRequests/p3'), pr({ mediaPath: 'prayer/other/x.webm', mediaType: 'audio' })));
});
await t('private request to the Head Pastor', () => assertSucceeds(setDoc(doc(anon(), 'prayerRequests/hp'), pr({ toLevel: 'head_pastor', confidential: true }))));
await t('cannot pre-mark answered', () => assertFails(setDoc(doc(anon(), 'prayerRequests/p4'), pr({ status: 'answered' }))));
await t('public cannot read prayer requests', () => assertFails(getDoc(doc(anon(), 'prayerRequests/p1'))));
await t('branch pastor sees requests addressed to them', () => assertSucceeds(getDocs(query(collection(db('bpA'), 'prayerRequests'), where('toLevel', '==', 'branch_pastor'), where('branchId', '==', 'A')))));
await t('Head Pastor-only request is hidden from the Associate', () => assertFails(getDoc(doc(db('assoc'), 'prayerRequests/hp'))));
await t('…and visible to the Head Pastor', () => assertSucceeds(getDoc(doc(db('head'), 'prayerRequests/hp'))));
await t('associate sees branch requests (higher in the hierarchy)', () => assertSucceeds(getDoc(doc(db('assoc'), 'prayerRequests/p1'))));
await t('associate with prayer switched off cannot', () => assertFails(getDoc(doc(db('assocNoPrayer'), 'prayerRequests/p1'))));
await t('dept head cannot see a request sent to the branch pastor', () => assertFails(getDoc(doc(db('headMedia'), 'prayerRequests/p1'))));
await t('dept head sees requests to their department', async () => {
  await assertSucceeds(setDoc(doc(anon(), 'prayerRequests/d1'), pr({ toLevel: 'dept_leader', departmentId: 'media' })));
  await assertSucceeds(getDocs(query(collection(db('headMedia'), 'prayerRequests'), where('toLevel', '==', 'dept_leader'), where('branchId', '==', 'A'), where('departmentId', '==', 'media'))));
});
await t('cell leader sees requests to their cell', async () => {
  await assertSucceeds(setDoc(doc(anon(), 'prayerRequests/c1r'), pr({ toLevel: 'cell_leader', cellId: 'c1' })));
  await assertSucceeds(getDoc(doc(db('cellLead'), 'prayerRequests/c1r')));
  await assertFails(getDoc(doc(db('cellLead'), 'prayerRequests/d1')));
});
await t('branch pastor marks it answered and links the member', () => assertSucceeds(updateDoc(doc(db('bpA'), 'prayerRequests/p1'), { status: 'answered', answerNote: 'Got the job', memberId: 'm1' })));
await t('…but cannot rewrite what was asked', () => assertFails(updateDoc(doc(db('bpA'), 'prayerRequests/p1'), { text: 'changed' })));

console.log("Head Pastor's private notes");
await t('Head Pastor writes an assessment', () => assertSucceeds(setDoc(doc(db('head'), 'pastorNotes/m1_Tithe'), { memberId: 'm1', area: 'Tithe', rating: 'needs_improvement', done: false })));
await t('Associate Pastor cannot read it', () => assertFails(getDoc(doc(db('assoc'), 'pastorNotes/m1_Tithe'))));
await t('branch pastor cannot read it', () => assertFails(getDocs(query(collection(db('bpA'), 'pastorNotes'), where('done', '==', false)))));

console.log('Projects, payments & charity');
await t('Super Admin creates a public project', () => assertSucceeds(setDoc(doc(db('head'), 'projects/roof'), { title: 'Roofing', goal: 250000, raised: 0, donors: 0, public: true })));
await t('anyone can view a public project page', () => assertSucceeds(getDoc(doc(anon(), 'projects/roof'))));
await t('finance updates the amount raised', () => assertSucceeds(updateDoc(doc(db('finA'), 'projects/roof'), { raised: 500, donors: 1 })));
await t('finance cannot change the goal', () => assertFails(updateDoc(doc(db('finA'), 'projects/roof'), { goal: 1 })));
await t('secretary cannot touch project money', () => assertFails(updateDoc(doc(db('secA'), 'projects/roof'), { raised: 9 })));
await t('payment details are public, only admins edit them', async () => {
  await assertSucceeds(setDoc(doc(db('head'), 'settings/payments'), { momoNumber: '0240000000' }));
  await assertSucceeds(getDoc(doc(anon(), 'settings/payments')));
  await assertFails(setDoc(doc(db('bpA'), 'settings/payments'), { momoNumber: 'x' }));
  await assertFails(getDoc(doc(anon(), 'settings/sms')));
});
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), 'settings/charity'), { departmentId: 'charityDept' });
  await setDoc(doc(ctx.firestore(), 'users/charityHead'), { ...base, role: 'dept_leader', branchId: 'A', departmentIds: ['charityDept'], active: true });
});
await t('charity head records a beneficiary', () => assertSucceeds(setDoc(doc(db('charityHead'), 'charity/b1'), { type: 'beneficiary', name: 'Kofi', amount: 300 })));
await t('other department heads cannot see charity records', () => assertFails(getDoc(doc(db('headMedia'), 'charity/b1'))));
await t('finance cannot see charity records', () => assertFails(getDoc(doc(db('finA'), 'charity/b1'))));
await t('Head Pastor sees charity records', () => assertSucceeds(getDoc(doc(db('head'), 'charity/b1'))));

console.log('First-admin recovery & old data');
await env.withSecurityRulesDisabled(async (ctx) => {
  const d = ctx.firestore();
  await deleteDoc(doc(d, 'meta/setup'));               // as if the first sign-up never finished
  await setDoc(doc(d, 'users/late'), { ...base, role: 'pending', active: false });
  await setDoc(doc(d, 'users/later'), { ...base, role: 'pending', active: false });
  await setDoc(doc(d, 'attendance/old1'), { name: 'Solomon', date: '2025-02-16' });
});
const claim = (uid) => {
  const d = db(uid); const b = writeBatch(d);
  b.set(doc(d, `users/${uid}`), { ...base, role: 'head_pastor', active: true });
  b.set(doc(d, 'meta/setup'), { by: uid, at: serverTimestamp() });
  return b.commit();
};
await t('pending user cannot self-promote without finishing setup', () => assertFails(setDoc(doc(db('late'), 'users/late'), { ...base, role: 'head_pastor', active: true })));
await t('pending user finishes setup as Head Pastor while setup is open', () => assertSucceeds(claim('late')));
await t('nobody else can claim it afterwards', () => assertFails(claim('later')));
await t('old attendance data: readable by Super Admin', () => assertSucceeds(getDoc(doc(db('head'), 'attendance/old1'))));
await t('old attendance data: hidden from others and the public', async () => {
  await assertFails(getDoc(doc(db('bpA'), 'attendance/old1')));
  await assertFails(getDoc(doc(anon(), 'attendance/old1')));
  await assertFails(setDoc(doc(anon(), 'attendance/x'), { name: 'spam' }));
});

console.log(`\n${pass} passed, ${fail} failed`);
await env.cleanup();
process.exit(fail ? 1 : 0);
