import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { collection, onSnapshot, orderBy, query, where, type Query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Branch, Cell, Department, Member } from '../lib/types';
import { can, isGlobal } from '../lib/roles';
import { useAuth } from './AuthContext';

export const ALL = 'all';

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
    const base = collection(db, 'cells');
    const q: Query = scope === ALL ? base : query(base, where('branchId', '==', scope));
    return onSnapshot(q, (s) => {
      const list = s.docs.map((d) => ({ id: d.id, ...d.data() }) as Cell);
      list.sort((a, b) => a.name.localeCompare(b.name));
      setCells(list);
    }, (e) => console.error('cells listener', e));
  }, [profile?.active, profile?.role, scope]);

  useEffect(() => {
    if (!profile?.active || !can(profile.role, 'members.read')) {
      setMembers([]);
      setMembersLoading(false);
      return;
    }
    setMembersLoading(true);
    const base = collection(db, 'members');
    let q: Query = base;
    if (scope !== ALL) q = query(base, where('branchId', '==', scope));
    return onSnapshot(
      q,
      (s) => {
        const list = s.docs.map((d) => ({ id: d.id, ...d.data() }) as Member);
        list.sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
        setMembers(list);
        setMembersLoading(false);
      },
      (err) => {
        console.error('members listener', err);
        setMembersLoading(false);
      },
    );
  }, [profile?.active, profile?.role, scope]);

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
