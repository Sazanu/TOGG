import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { collection, doc, onSnapshot, orderBy, query, where, type Query, type QueryDocumentSnapshot, type DocumentSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Branch, Cell, Department, Member } from '../lib/types';
import { can, isGlobal } from '../lib/roles';
import { isoDate } from '../lib/format';
import { useAuth } from './AuthContext';

export const ALL = 'all';

/** Accepts both TOGG members and records saved by the old 2025 attendance form. */
function normalizeMember(id: string, d: Record<string, unknown>): Member {
  const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
  const dateStr = (v: unknown) => {
    if (v && typeof v === 'object' && 'toDate' in v) return isoDate((v as { toDate(): Date }).toDate());
    const t = typeof v === 'string' ? Date.parse(v) : NaN;
    return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : Number.isNaN(t) ? '' : isoDate(new Date(t));
  };
  let firstName = str(d.firstName);
  let lastName = str(d.lastName);
  if (!firstName && d.name) {
    const parts = str(d.name).trim().split(/\s+/);
    firstName = parts[0] ?? ''; lastName = parts.slice(1).join(' ');
  }
  const status = ['active', 'inactive', 'visitor'].includes(str(d.status)) ? str(d.status) : 'active';
  const category = ['adult', 'teen', 'child'].includes(str(d.category)) ? str(d.category) : 'adult';
  return {
    ...(d as object),
    id,
    firstName: firstName || '(no name)',
    lastName,
    phone: str(d.phone), email: str(d.email), gender: (str(d.gender) as Member['gender']) || '',
    dob: dateStr(d.dob), category: category as Member['category'], status: status as Member['status'],
    branchId: str(d.branchId), departmentIds: Array.isArray(d.departmentIds) ? (d.departmentIds as string[]) : [],
    address: str(d.address ?? d.location), occupation: str(d.occupation), maritalStatus: str(d.maritalStatus),
    joinedAt: dateStr(d.joinedAt ?? d.dateAdded), notes: str(d.notes),
    membershipNo: str(d.membershipNo), cellId: (d.cellId as string | null) ?? null, source: str(d.source) || (d.name && !d.firstName ? 'old-form' : ''),
  };
}

interface DataState {
  branches: Branch[];
  departments: Department[];
  /** Main departments first, each followed by its sub-departments. */
  deptTree: { dept: Department; depth: number }[];
  cells: Cell[];
  members: Member[];
  membersLoading: boolean;
  /** 'all' (head/associate pastor only) or a branch id. */
  scope: string;
  setScope: (s: string) => void;
  /** True if the current user may switch branches. */
  canSwitchScope: boolean;
  branchName: (id: string | null | undefined) => string;
  deptName: (id: string) => string;
  cellName: (id: string | null | undefined) => string;
  /** A department id plus all of its sub-department ids. */
  deptWithChildren: (id: string) => string[];
  memberById: Map<string, Member>;
}

const DataContext = createContext<DataState | null>(null);

const SCOPE_KEY = 'togg.scope';

export function DataProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [cells, setCells] = useState<Cell[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const global = isGlobal(profile?.role);
  const [scopeState, setScopeState] = useState<string>(() => {
    try { return localStorage.getItem(SCOPE_KEY) || ALL; } catch { return ALL; }
  });

  // Scoped users are always locked to their own branch.
  const scope = global ? scopeState : profile?.branchId ?? '__none__';

  function setScope(s: string) {
    setScopeState(s);
    try { localStorage.setItem(SCOPE_KEY, s); } catch { /* ignore */ }
  }

  useEffect(() => {
    if (!profile?.active) return;
    const unsubB = onSnapshot(query(collection(db, 'branches'), orderBy('name')), (s) =>
      setBranches(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Branch)),
    );
    const unsubD = onSnapshot(query(collection(db, 'departments'), orderBy('name')), (s) =>
      setDepartments(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Department)),
    );
    return () => { unsubB(); unsubD(); };
  }, [profile?.active]);

  // If a stored scope points at a deleted branch, fall back to all.
  useEffect(() => {
    if (global && scopeState !== ALL && branches.length && !branches.some((b) => b.id === scopeState)) {
      setScope(ALL);
    }
  }, [branches, global, scopeState]);

  useEffect(() => {
    if (!profile?.active || !can(profile.role, 'cells.view')) { setCells([]); return; }
    const sorted = (l: Cell[]) => [...l].sort((a, b) => a.name.localeCompare(b.name));
    if (profile.role === 'cell_leader') {
      // Cell leaders only ever load their own cells.
      const found = new Map<string, Cell>();
      const unsubs = (profile.cellIds ?? []).map((id) => onSnapshot(doc(db, 'cells', id), (d: DocumentSnapshot) => {
        if (d.exists()) found.set(d.id, { id: d.id, ...d.data() } as Cell); else found.delete(d.id);
        setCells(sorted([...found.values()]));
      }, (e) => console.error('cell listener', e)));
      if (!unsubs.length) setCells([]);
      return () => unsubs.forEach((u) => u());
    }
    const base = collection(db, 'cells');
    const q: Query = scope === ALL ? base : query(base, where('branchId', '==', scope));
    return onSnapshot(q, (s) => setCells(sorted(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Cell))), (e) => console.error('cells listener', e));
  }, [profile?.active, profile?.role, profile?.cellIds, scope]);

  useEffect(() => {
    if (!profile?.active || !can(profile.role, 'members.read')) {
      setMembers([]);
      setMembersLoading(false);
      return;
    }
    setMembersLoading(true);
    const base = collection(db, 'members');
    // Each role only loads what it may see (the database rules enforce the same).
    let queries: Query[];
    if (profile.role === 'dept_leader') {
      const d = profile.departmentIds ?? [];
      queries = [];
      for (let i = 0; i < d.length; i += 30) queries.push(query(base, where('branchId', '==', scope), where('departmentIds', 'array-contains-any', d.slice(i, i + 30))));
    } else if (profile.role === 'cell_leader') {
      queries = (profile.cellIds ?? []).map((c) => query(base, where('branchId', '==', scope), where('cellId', '==', c)));
    } else {
      queries = [scope === ALL ? base : query(base, where('branchId', '==', scope))];
    }
    if (!queries.length) { setMembers([]); setMembersLoading(false); return; }
    const parts = new Map<number, QueryDocumentSnapshot[]>();
    const publish = () => {
      const byId = new Map<string, Member>();
      parts.forEach((docs) => docs.forEach((d) => byId.set(d.id, normalizeMember(d.id, d.data()))));
      const list = [...byId.values()];
      list.sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
      setMembers(list);
      if (parts.size === queries.length) setMembersLoading(false);
    };
    const unsubs = queries.map((q, i) => onSnapshot(q, (s) => { parts.set(i, s.docs); publish(); }, (err) => {
      console.error('members listener', err); parts.set(i, []); publish();
    }));
    return () => unsubs.forEach((u) => u());
  }, [profile?.active, profile?.role, profile?.departmentIds, profile?.cellIds, scope]);

  const value = useMemo<DataState>(() => {
    const bMap = new Map(branches.map((b) => [b.id, b.name]));
    const dMap = new Map(departments.map((d) => [d.id, d]));
    const cMap = new Map(cells.map((c) => [c.id, c.name]));
    const kids = new Map<string, Department[]>();
    departments.forEach((d) => { if (d.parentId) kids.set(d.parentId, [...(kids.get(d.parentId) ?? []), d]); });
    const deptTree: { dept: Department; depth: number }[] = [];
    const walk = (d: Department, depth: number, seen: Set<string>) => {
      if (seen.has(d.id)) return;
      seen.add(d.id);
      deptTree.push({ dept: d, depth });
      (kids.get(d.id) ?? []).forEach((k) => walk(k, depth + 1, seen));
    };
    const seen = new Set<string>();
    departments.filter((d) => !d.parentId || !dMap.has(d.parentId)).forEach((d) => walk(d, 0, seen));
    const withChildren = (id: string): string[] => {
      const out: string[] = [];
      const go = (x: string) => { if (out.includes(x)) return; out.push(x); (kids.get(x) ?? []).forEach((k) => go(k.id)); };
      go(id);
      return out;
    };
    return {
      branches,
      departments,
      deptTree,
      cells,
      members,
      membersLoading,
      scope,
      setScope,
      canSwitchScope: global,
      branchName: (id) => (id ? bMap.get(id) ?? 'Unknown branch' : 'All branches'),
      deptName: (id) => dMap.get(id)?.name ?? '—',
      cellName: (id) => (id ? cMap.get(id) ?? '—' : '—'),
      deptWithChildren: withChildren,
      memberById: new Map(members.map((m) => [m.id, m])),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branches, departments, cells, members, membersLoading, scope, global]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataState {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
}
