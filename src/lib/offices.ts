/**
 * Access follows office. A login account can be linked to a member record (users.memberId).
 * The departments a member heads (or assists) and the cells they lead give that account access
 * automatically; when the office passes to someone else, the access is taken away again.
 * Access the Super Admin gave by hand stays.
 */
import { collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db } from './firebase';
import type { AppUser, Cell, Department } from './types';

export interface Offices { departmentIds: string[]; cellIds: string[] }

/** Departments (with their sub-departments) and cells this member holds an office in. */
export function officesOf(memberId: string, departments: Pick<Department, 'id' | 'parentId' | 'headMemberId' | 'assistantMemberId'>[], cells: Pick<Cell, 'id' | 'leaderMemberId'>[]): Offices {
  const out = new Set<string>();
  const go = (id: string) => { if (out.has(id)) return; out.add(id); departments.filter((d) => d.parentId === id).forEach((d) => go(d.id)); };
  departments.filter((d) => d.headMemberId === memberId || d.assistantMemberId === memberId).forEach((d) => go(d.id));
  return { departmentIds: [...out], cellIds: cells.filter((c) => c.leaderMemberId === memberId).map((c) => c.id) };
}

/** New access for an account: (what it had − what came from old offices) + what comes from current offices. */
export function mergeOffices(u: Pick<AppUser, 'departmentIds' | 'cellIds' | 'officeDepartmentIds' | 'officeCellIds'>, now: Offices, alsoRemove: Offices = { departmentIds: [], cellIds: [] }) {
  const oldD = new Set([...(u.officeDepartmentIds ?? []), ...alsoRemove.departmentIds]);
  const oldC = new Set([...(u.officeCellIds ?? []), ...alsoRemove.cellIds]);
  return {
    departmentIds: [...new Set([...(u.departmentIds ?? []).filter((x) => !oldD.has(x) || now.departmentIds.includes(x)), ...now.departmentIds])],
    cellIds: [...new Set([...(u.cellIds ?? []).filter((x) => !oldC.has(x) || now.cellIds.includes(x)), ...now.cellIds])],
    officeDepartmentIds: now.departmentIds,
    officeCellIds: now.cellIds,
  };
}

/**
 * Brings the login of these members in line with the offices they hold now.
 * `removed` lists what one of them just lost, for accounts made before offices were tracked.
 * Returns how many accounts changed. Needs Super Admin rights (users can only be edited by them).
 */
export async function syncOfficeAccess(memberIds: (string | undefined | null)[], removed: Offices = { departmentIds: [], cellIds: [] }): Promise<number> {
  const ids = [...new Set(memberIds.filter((x): x is string => !!x))];
  if (!ids.length) return 0;
  const [depts, cells] = await Promise.all([getDocs(collection(db, 'departments')), getDocs(collection(db, 'cells'))]);
  const D = depts.docs.map((d) => ({ id: d.id, ...d.data() }) as Department);
  const C = cells.docs.map((d) => ({ id: d.id, ...d.data() }) as Cell);
  let changed = 0;
  for (const memberId of ids) {
    const users = await getDocs(query(collection(db, 'users'), where('memberId', '==', memberId)));
    for (const u of users.docs) {
      const data = u.data() as AppUser;
      if (data.role === 'head_pastor' || data.role === 'associate_pastor') continue; // they see everything anyway
      const next: Record<string, unknown> & ReturnType<typeof mergeOffices> = mergeOffices(data, officesOf(memberId, D, C), removed);
      // A department head with no department left (but still a cell) becomes a cell leader, and the other way round.
      if (data.role === 'dept_leader' && !next.departmentIds.length && next.cellIds.length) next.role = 'cell_leader';
      if (data.role === 'cell_leader' && !next.cellIds.length && next.departmentIds.length) next.role = 'dept_leader';
      const same = JSON.stringify([...next.departmentIds].sort()) === JSON.stringify([...(data.departmentIds ?? [])].sort())
        && JSON.stringify([...next.cellIds].sort()) === JSON.stringify([...(data.cellIds ?? [])].sort());
      await updateDoc(doc(db, 'users', u.id), next);
      if (!same) changed++;
    }
  }
  return changed;
}
