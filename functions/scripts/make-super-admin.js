/**
 * Emergency tool: make an existing login the Head Pastor (Super Admin).
 *
 * 1. Firebase console → Project settings → Service accounts → "Generate new private key".
 *    Save the .json file somewhere private (never commit or share it).
 * 2. From the project folder:
 *      npm --prefix functions install
 *      node functions/scripts/make-super-admin.js path/to/key.json you@example.com
 * 3. Delete the key file afterwards (or revoke it in the console).
 */
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const fs = require('fs');

(async () => {
  const [keyPath, email] = process.argv.slice(2);
  if (!keyPath || !email) {
    console.error('Usage: node functions/scripts/make-super-admin.js <service-account.json> <email>');
    process.exit(1);
  }
  const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  initializeApp({ credential: cert(key) });
  const db = getFirestore();

  const user = await getAuth().getUserByEmail(email.trim());
  const ref = db.doc(`users/${user.uid}`);
  const existing = (await ref.get()).data() || {};
  await ref.set({
    email: (user.email || '').toLowerCase(),
    displayName: existing.displayName || user.displayName || user.email.split('@')[0],
    phone: existing.phone || user.phoneNumber || '',
    role: 'head_pastor',
    branchId: null,
    departmentIds: [],
    cellIds: [],
    active: true,
    createdAt: existing.createdAt || FieldValue.serverTimestamp(),
  }, { merge: true });

  const setup = db.doc('meta/setup');
  if (!(await setup.get()).exists) await setup.set({ by: user.uid, at: FieldValue.serverTimestamp(), via: 'make-super-admin' });

  console.log(`✔ ${user.email} is now Head Pastor (Super Admin) on project ${key.project_id}. Sign in again.`);
  process.exit(0);
})().catch((e) => { console.error('✖', e.message); process.exit(1); });
