import { useEffect, useMemo, useState } from 'react';
import { collection, doc, increment, onSnapshot, orderBy, query, runTransaction, serverTimestamp, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { prettyDate, today } from './format';
import type { CheckIn, Member, Service } from './types';

export type CheckMethod = 'usher' | 'station' | 'self';

/** A self check-in sent from a phone after scanning the QR code at the door. */
export interface SelfCheckIn { id: string; serviceId: string; branchId: string; name: string; phone: string; phoneKey: string; status: 'new' | 'done' | 'dismissed'; memberId?: string }

/** Last 9 digits: the same person whether they type 024…, +233 24… or 24…. */
export const phoneKey = (p: string) => (p || '').replace(/\D/g, '').slice(-9);

/** Everything a check-in screen needs for one service (live). */
export function useServiceCheckin(serviceId: string, members: Member[], uid?: string) {
  const [service, setService] = useState<Service | null | undefined>(undefined);
  const [checkins, setCheckins] = useState<CheckIn[]>([]);
  useEffect(() => onSnapshot(doc(db, 'services', serviceId), (s) => setService(s.exists() ? ({ id: s.id, ...s.data() } as Service) : null), () => setService(null)), [serviceId]);
  useEffect(() => onSnapshot(query(collection(db, 'services', serviceId, 'checkins'), orderBy('at', 'desc')),
    (s) => setCheckins(s.docs.map((d) => ({ id: d.id, ...d.data() }) as CheckIn)), () => {}), [serviceId]);
  const present = useMemo(() => new Set(checkins.map((c) => c.memberId)), [checkins]);
  const branchMembers = useMemo(() => members.filter((m) => m.branchId === service?.branchId), [members, service]);

  function search(q: string, max = 8) {
    const n = q.trim().toLowerCase();
    if (!n) return [];
    const digits = n.replace(/\D/g, '');
    return branchMembers.filter((m) => `${m.title ?? ''} ${m.firstName} ${m.lastName}`.toLowerCase().includes(n) || (digits.length >= 4 && (m.phone || '').replace(/\D/g, '').includes(digits))).slice(0, max);
  }

  /** Returns false if they were already in. Safe if two ushers tap at the same time. */
  async function checkIn(m: Member, method: CheckMethod = 'usher'): Promise<boolean> {
    let added = false;
    await runTransaction(db, async (tx) => {
      const ref = doc(db, 'services', serviceId, 'checkins', m.id);
      if ((await tx.get(ref)).exists()) return;
      tx.set(ref, { memberId: m.id, name: `${m.firstName} ${m.lastName}`.trim(), category: m.category, at: serverTimestamp(), by: uid ?? '', method });
      tx.update(doc(db, 'services', serviceId), { count: increment(1) });
      added = true;
    });
    return added;
  }

  async function undo(c: CheckIn) {
    await runTransaction(db, async (tx) => {
      const ref = doc(db, 'services', serviceId, 'checkins', c.id);
      if (!(await tx.get(ref)).exists()) return;
      tx.delete(ref);
      tx.update(doc(db, 'services', serviceId), { count: increment(-1) });
    });
  }

  /** New person at the door: saved as a visitor and checked in. */
  async function addVisitor(name: string, phone = '', method: CheckMethod = 'usher'): Promise<string> {
    if (!service) throw new Error('Service not loaded');
    const parts = name.trim().split(/\s+/);
    const ref = doc(collection(db, 'members'));
    const m = {
      firstName: parts[0], lastName: parts.slice(1).join(' '), phone: phone.trim(), email: '', gender: '', dob: '', category: 'adult', status: 'visitor',
      branchId: service.branchId, departmentIds: [], address: '', occupation: '', maritalStatus: '', joinedAt: today(), cellId: null, source: 'checkin', membershipNo: '',
      notes: `First visit: ${service.title || service.type}, ${prettyDate(service.date)}`,
    };
    const b = writeBatch(db);
    b.set(ref, { ...m, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    b.set(doc(db, 'services', serviceId, 'checkins', ref.id), { memberId: ref.id, name: `${m.firstName} ${m.lastName}`.trim(), category: 'adult', at: serverTimestamp(), by: uid ?? '', method });
    b.update(doc(db, 'services', serviceId), { count: increment(1) });
    await b.commit();
    return ref.id;
  }

  async function bumpVisitors(delta: number) {
    if (!service || (service.visitors || 0) + delta < 0) return;
    await updateDoc(doc(db, 'services', serviceId), { visitors: increment(delta) });
  }

  return { service, checkins, present, branchMembers, search, checkIn, undo, addVisitor, bumpVisitors };
}

/** Self check-ins waiting for this service (staff screen). */
export function useSelfCheckins(serviceId: string, branchId: string | undefined) {
  const [list, setList] = useState<SelfCheckIn[]>([]);
  useEffect(() => {
    if (!branchId) return;
    return onSnapshot(query(collection(db, 'selfCheckins'), where('serviceId', '==', serviceId), where('branchId', '==', branchId), where('status', '==', 'new')),
      (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() }) as SelfCheckIn)), (e) => console.error('selfCheckins', e));
  }, [serviceId, branchId]);
  return list;
}
