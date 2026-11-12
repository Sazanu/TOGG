import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { processMessage, runTick } from './core';

initializeApp();
const db = getFirestore();

// europe-west1 (Belgium) is the closest Google region to Ghana.
setGlobalOptions({ region: 'europe-west1', maxInstances: 5 });

const SENDERS = ['head_pastor', 'associate_pastor', 'branch_pastor', 'secretary'];

/** Called by the app right after it saves a message, so "Send now" is instant. */
export const sendSmsNow = onCall({ timeoutSeconds: 300 }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const id = String(req.data?.id ?? '');
  if (!id) throw new HttpsError('invalid-argument', 'Missing message id.');
  const [user, msg] = await Promise.all([db.doc(`users/${req.auth.uid}`).get(), db.doc(`smsMessages/${id}`).get()]);
  const u = user.data();
  if (!u?.active || !SENDERS.includes(u.role)) throw new HttpsError('permission-denied', 'You cannot send SMS.');
  if (!msg.exists) throw new HttpsError('not-found', 'Message not found.');
  const global = u.role === 'head_pastor' || u.role === 'associate_pastor';
  if (!global && msg.data()!.branchId !== u.branchId) throw new HttpsError('permission-denied', 'That message is for another branch.');
  return processMessage(db, id);
});

/** Every 5 minutes (Ghana time): reminders, missed-service texts, birthdays and scheduled messages. */
export const smsTick = onSchedule({ schedule: 'every 5 minutes', timeZone: 'Africa/Accra', timeoutSeconds: 540 }, async () => {
  const res = await runTick(db);
  console.log('smsTick', res);
});
