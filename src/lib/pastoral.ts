import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { today } from './format';
import type { Assessment, PastorNote } from './types';

export const ASSESS_AREAS = [
  'Church attendance', 'Tithe', 'Giving', 'Cell participation', 'Department service', 'Prayer life', 'Spiritual growth', 'Character & conduct',
];

export const ASSESS_LABEL: Record<Assessment, string> = { good: 'Good', fair: 'Fair', needs_improvement: 'Needs improvement' };
export const ASSESS_COLOR: Record<Assessment, 'green' | 'gold' | 'red'> = { good: 'green', fair: 'gold', needs_improvement: 'red' };

/** Head Pastor only: all open notes (assessments and reminders). */
export function useOpenPastorNotes(enabled: boolean) {
  const [notes, setNotes] = useState<PastorNote[]>([]);
  useEffect(() => {
    if (!enabled) { setNotes([]); return; }
    return onSnapshot(query(collection(db, 'pastorNotes'), where('done', '==', false)),
      (s) => setNotes(s.docs.map((d) => ({ id: d.id, ...d.data() }) as PastorNote)), (e) => console.error('pastorNotes', e));
  }, [enabled]);
  return notes;
}

/** What should catch the Head Pastor's eye on the dashboard. */
export function attentionItems(notes: PastorNote[]) {
  const t = today();
  return notes
    .filter((n) => n.rating === 'needs_improvement' || (n.remindOn && n.remindOn <= t))
    .sort((a, b) => (a.remindOn || '9999').localeCompare(b.remindOn || '9999'));
}
