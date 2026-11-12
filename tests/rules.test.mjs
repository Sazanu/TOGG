import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, query, where, updateDoc, writeBatch, serverTimestamp, deleteDoc, increment, addDoc } from 'firebase/firestore';

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
await t('dept leader reads branch A members', () => assertSucceeds(getDocs(query(collection(db('dlA'), 'members'), where('branchId', '==', 'A')))));
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

console.log(`\n${pass} passed, ${fail} failed`);
await env.cleanup();
process.exit(fail ? 1 : 0);
