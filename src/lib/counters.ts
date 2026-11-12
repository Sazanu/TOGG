import { doc, runTransaction } from 'firebase/firestore';
import { db } from './firebase';

export const MEMBER_PREFIX = 'TOGG-';

/** Reserves `n` sequential membership / tithe-card numbers, e.g. TOGG-0042. */
export async function reserveMembershipNos(n: number): Promise<string[]> {
  if (n <= 0) return [];
  const ref = doc(db, 'meta', 'counters');
  const start = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const cur = (snap.exists() ? (snap.data().memberSeq as number) : 0) || 0;
    if (snap.exists()) tx.update(ref, { memberSeq: cur + n });
    else tx.set(ref, { memberSeq: cur + n });
    return cur + 1;
  });
  return Array.from({ length: n }, (_, i) => `${MEMBER_PREFIX}${String(start + i).padStart(4, '0')}`);
}
