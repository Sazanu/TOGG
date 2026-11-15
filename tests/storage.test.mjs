// Run: firebase emulators:exec --only firestore,storage --project demo-togg "node tests/storage.test.mjs"
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getBytes } from 'firebase/storage';

const env = await initializeTestEnvironment({
  projectId: 'demo-togg',
  firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
  storage: { rules: readFileSync(new URL('../storage.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 9199 },
});
let pass = 0, fail = 0;
const t = async (n, fn) => { try { await fn(); pass++; console.log('  ✓', n); } catch (e) { fail++; console.log('  ✗', n, e.message.split('\n')[0]); } };
await env.withSecurityRulesDisabled(async (c) => {
  await setDoc(doc(c.firestore(), 'users/staff'), { role: 'branch_pastor', branchId: 'A', active: true });
  await setDoc(doc(c.firestore(), 'users/off'), { role: 'pending', active: false });
});
const anon = env.unauthenticatedContext().storage();
const bytes = new Uint8Array([1, 2, 3, 4]);
console.log('Prayer voice notes & videos');
await t('anyone can upload a voice note', () => assertSucceeds(uploadBytes(ref(anon, 'prayer/r1/audio.webm'), bytes, { contentType: 'audio/webm' })));
await t('anyone can upload a video', () => assertSucceeds(uploadBytes(ref(anon, 'prayer/r2/video.mp4'), bytes, { contentType: 'video/mp4' })));
await t('other file types are refused', () => assertFails(uploadBytes(ref(anon, 'prayer/r3/x.html'), bytes, { contentType: 'text/html' })));
await t('cannot upload outside prayer/', () => assertFails(uploadBytes(ref(anon, 'other/x.webm'), bytes, { contentType: 'audio/webm' })));
await t('cannot overwrite an existing recording', () => assertFails(uploadBytes(ref(anon, 'prayer/r1/audio.webm'), bytes, { contentType: 'audio/webm' })));
await t('the public cannot listen', () => assertFails(getBytes(ref(anon, 'prayer/r1/audio.webm'))));
await t('a pending account cannot listen', () => assertFails(getBytes(ref(env.authenticatedContext('off').storage(), 'prayer/r1/audio.webm'))));
await t('active staff can listen', () => assertSucceeds(getBytes(ref(env.authenticatedContext('staff').storage(), 'prayer/r1/audio.webm'))));
console.log(`\n${pass} passed, ${fail} failed`);
await env.cleanup();
process.exit(fail ? 1 : 0);
