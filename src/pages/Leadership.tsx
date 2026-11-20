import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { arrayRemove, arrayUnion, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { Crown, KeyRound, Network, Home, Plus, Search, Trash2, UserCog, X } from 'lucide-react';
import { Avatar, Badge, Button, Card, Empty, Input, Modal, PageHeader, cx, errorText, useToast } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { db } from '../lib/firebase';
import { initials } from '../lib/format';
import { can, isGlobal } from '../lib/roles';
import { useSettingsDoc } from '../lib/settings';
import { syncOfficeAccess } from '../lib/offices';
import type { Member } from '../lib/types';

export const DEFAULT_POSITIONS = [
  'Head Pastor', 'Associate Pastor', 'Pastor', "Pastor's Wife", 'Minister', 'Elder', 'Deacon', 'Deaconess',
  'Church Secretary', 'Treasurer', 'Financial Secretary', 'Youth Leader', "Women's Leader", "Men's Leader", 'Choir Master', 'Head Usher',
];
export function usePositions(): string[] {
  const s = useSettingsDoc<{ list: string[] }>('positions', { list: DEFAULT_POSITIONS });
  return s.list?.length ? s.list : DEFAULT_POSITIONS;
}

const label = (m: Member) => `${m.title ? `${m.title} ` : ''}${m.firstName} ${m.lastName}`.trim();

function MemberPicker({ title, onPick, onClose, exclude = [] }: { title: string; onPick: (m: Member) => void; onClose: () => void; exclude?: string[] }) {
  const { members, branchName, scope } = useData();
  const [q, setQ] = useState('');
  const list = useMemo(() => members.filter((m) => m.status !== 'inactive' && !exclude.includes(m.id) && (!q || `${m.title} ${m.firstName} ${m.lastName} ${m.phone}`.toLowerCase().includes(q.toLowerCase()))).slice(0, 40), [members, q, exclude]);
  return (
    <Modal open onClose={onClose} title={title}>
      <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
        <Input autoFocus className="pl-9" placeholder="Search members…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <ul className="mt-3 max-h-96 divide-y divide-stone-100 overflow-y-auto">
        {list.map((m) => (
          <li key={m.id}><button onClick={() => onPick(m)} className="flex w-full items-center gap-3 px-1 py-2.5 text-left hover:bg-royal-50/60">
            <Avatar text={initials(m.firstName, m.lastName)} />
            <div className="min-w-0"><div className="truncate text-sm font-medium">{label(m)}</div><div className="truncate text-xs text-stone-500">{m.phone || 'No phone'}{scope === 'all' && ` · ${branchName(m.branchId)}`}</div></div>
          </button></li>
        ))}
        {list.length === 0 && <li className="py-6 text-center text-sm text-stone-400">No one found.</li>}
      </ul>
    </Modal>
  );
}

export default function Leadership() {
  const { profile } = useAuth();
  const { members, deptTree, cells, branchName, memberById, deptWithChildren } = useData();
  const toast = useToast();
  const nav = useNavigate();
  const positions = usePositions();
  const editPositions = isGlobal(profile?.role) || can(profile?.role, 'members.write');
  const editDepts = can(profile?.role, 'departments.manage');
  const editCells = can(profile?.role, 'cells.manage');
  const [picking, setPicking] = useState<{ title: string; exclude?: string[]; onPick: (m: Member) => Promise<void> } | null>(null);
  const [newPos, setNewPos] = useState('');
  const [tab, setTab] = useState<'positions' | 'departments' | 'cells' | 'people'>('positions');

  const holders = (p: string) => members.filter((m) => m.positions?.includes(p));
  const run = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast('ok', ok); } catch (e) { toast('err', errorText(e)); } };

  async function savePositions(list: string[]) { await setDoc(doc(db, 'settings', 'positions'), { list, updatedAt: serverTimestamp() }); }
  function assignPosition(p: string) {
    setPicking({ title: `Assign: ${p}`, exclude: holders(p).map((m) => m.id), onPick: async (m) => {
      await run(() => updateDoc(doc(db, 'members', m.id), { positions: arrayUnion(p), updatedAt: serverTimestamp() }), `${label(m)} is now ${p}.`);
      setPicking(null);
    } });
  }
  // Access follows office: the person who gets the office gets the access; the one who leaves it loses it.
  async function followOffice(before: string | undefined, after: string | undefined, removed: { departmentIds: string[]; cellIds: string[] }) {
    if (!isGlobal(profile?.role)) return;
    try {
      const n = await syncOfficeAccess([before, after], removed);
      if (n) toast('ok', `Login access updated for ${n} account(s).`);
    } catch (e) { toast('err', `Office saved, but login access could not be updated: ${errorText(e)}`); }
  }
  async function setDeptPerson(deptId: string, which: 'head' | 'assistant', m: Member | null) {
    const dept = deptTree.find(({ dept: d }) => d.id === deptId)?.dept;
    const before = which === 'head' ? dept?.headMemberId : dept?.assistantMemberId;
    const data = which === 'head'
      ? { headMemberId: m?.id ?? '', headName: m ? label(m) : '', headPhone: m?.phone ?? '' }
      : { assistantMemberId: m?.id ?? '', assistantName: m ? label(m) : '' };
    await run(() => updateDoc(doc(db, 'departments', deptId), data), m ? `${label(m)} set as ${which}.` : 'Removed.');
    await followOffice(before, m?.id, { departmentIds: deptWithChildren(deptId), cellIds: [] });
  }
  async function setCellLeader(cellId: string, m: Member | null) {
    const before = cells.find((c) => c.id === cellId)?.leaderMemberId;
    await run(() => updateDoc(doc(db, 'cells', cellId), { leaderMemberId: m?.id ?? '', leaderName: m ? label(m) : '', leaderPhone: m?.phone ?? '' }), m ? `${label(m)} now leads the cell.` : 'Removed.');
    await followOffice(before, m?.id, { departmentIds: [], cellIds: [cellId] });
  }

  // Everyone who leads something, with all their roles together.
  const leaders = useMemo(() => {
    const map = new Map<string, { m: Member; roles: string[] }>();
    const add = (id: string | undefined, r: string) => { const m = id ? memberById.get(id) : undefined; if (!m) return; const e = map.get(m.id) ?? { m, roles: [] }; e.roles.push(r); map.set(m.id, e); };
    members.forEach((m) => (m.positions ?? []).forEach((p) => add(m.id, p)));
    deptTree.forEach(({ dept }) => { add(dept.headMemberId, `Head of ${dept.name}`); add(dept.assistantMemberId, `Assistant, ${dept.name}`); });
    cells.forEach((c) => add(c.leaderMemberId, `Cell leader: ${c.name}`));
    return [...map.values()].sort((a, b) => b.roles.length - a.roles.length);
  }, [members, deptTree, cells, memberById]);

  const tabs = [['positions', 'Church positions', <Crown key="a" className="h-4 w-4" />], ['departments', 'Department heads', <Network key="b" className="h-4 w-4" />], ['cells', 'Cell leaders', <Home key="c" className="h-4 w-4" />], ['people', `All leaders (${leaders.length})`, <UserCog key="d" className="h-4 w-4" />]] as const;

  return (
    <div>
      <PageHeader title="Leadership" subtitle="Who serves where. One person can hold several roles — e.g. Pastor, cell leader and department head at the same time." />
      <div className="mb-6 flex gap-1 overflow-x-auto rounded-2xl border border-stone-200 bg-white p-1">
        {tabs.map(([k, l, i]) => <button key={k} onClick={() => setTab(k)} className={cx('flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium', tab === k ? 'bg-royal-800 text-white' : 'text-stone-600 hover:bg-stone-100')}>{i}{l}</button>)}
      </div>

      {tab === 'positions' && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {positions.map((p) => (
            <Card key={p} className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold text-royal-950">{p}</h3>
                <div className="flex items-center gap-1">
                  {editPositions && <Button size="sm" variant="outline" onClick={() => assignPosition(p)}><Plus className="h-3.5 w-3.5" /> Assign</Button>}
                  {isGlobal(profile?.role) && !DEFAULT_POSITIONS.includes(p) && holders(p).length === 0 && (
                    <button onClick={() => run(() => savePositions(positions.filter((x) => x !== p)), 'Role removed.')} className="rounded-lg p-1.5 text-stone-300 hover:text-red-600" aria-label="Delete role"><Trash2 className="h-4 w-4" /></button>
                  )}
                </div>
              </div>
              {holders(p).length === 0 ? <p className="text-sm text-stone-400">Nobody yet.</p> : (
                <ul className="space-y-1.5">
                  {holders(p).map((m) => (
                    <li key={m.id} className="flex items-center gap-2 text-sm">
                      <Link to={`/members/${m.id}`} className="flex-1 truncate text-stone-800 hover:text-royal-700">{label(m)} <span className="text-xs text-stone-400">{branchName(m.branchId)}</span></Link>
                      {editPositions && <button onClick={() => run(() => updateDoc(doc(db, 'members', m.id), { positions: arrayRemove(p) }), 'Removed.')} className="text-stone-300 hover:text-red-600" aria-label="Remove"><X className="h-4 w-4" /></button>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
          {isGlobal(profile?.role) && (
            <Card className="flex flex-col justify-center gap-2 border-dashed p-4">
              <span className="text-sm font-medium text-stone-700">Create a new role</span>
              <div className="flex gap-2">
                <Input value={newPos} onChange={(e) => setNewPos(e.target.value)} placeholder="e.g. Prayer Coordinator" />
                <Button disabled={!newPos.trim() || positions.includes(newPos.trim())} onClick={() => run(() => savePositions([...positions, newPos.trim()]).then(() => setNewPos('')), 'Role created.')}><Plus className="h-4 w-4" /></Button>
              </div>
            </Card>
          )}
        </div>
      )}

      {tab === 'departments' && (
        <Card>
          {deptTree.length === 0 ? <Empty title="No departments yet" /> : (
            <ul className="divide-y divide-stone-100">
              {deptTree.map(({ dept, depth }) => {
                const head = dept.headMemberId ? memberById.get(dept.headMemberId) : undefined;
                const asst = dept.assistantMemberId ? memberById.get(dept.assistantMemberId) : undefined;
                return (
                  <li key={dept.id} className="flex flex-col gap-2 px-5 py-3 md:flex-row md:items-center" style={{ paddingLeft: depth * 24 + 20 }}>
                    <Link to={`/departments/${dept.id}`} className="w-56 font-medium text-stone-900 hover:text-royal-700">{depth > 0 && '↳ '}{dept.name}</Link>
                    {(['head', 'assistant'] as const).map((w) => {
                      const cur = w === 'head' ? head : asst;
                      const name = w === 'head' ? dept.headName : dept.assistantName;
                      return (
                        <div key={w} className="flex flex-1 items-center gap-2 text-sm">
                          <span className="w-16 text-xs uppercase text-stone-400">{w}</span>
                          <span className="flex-1 truncate">{cur ? label(cur) : name ? <span className="text-stone-500">{name} <span className="text-xs">(not linked)</span></span> : <span className="text-stone-300">—</span>}</span>
                          {editDepts && <Button size="sm" variant="ghost" onClick={() => setPicking({ title: `${w === 'head' ? 'Head' : 'Assistant'} of ${dept.name}`, onPick: async (m) => { await setDeptPerson(dept.id, w, m); setPicking(null); } })}>{cur || name ? 'Change' : 'Choose'}</Button>}
                          {editDepts && (cur || name) && <button onClick={() => setDeptPerson(dept.id, w, null)} className="text-stone-300 hover:text-red-600" aria-label="Clear"><X className="h-4 w-4" /></button>}
                        </div>
                      );
                    })}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {tab === 'cells' && (
        <Card>
          {cells.length === 0 ? <Empty title="No cells yet"><Link to="/cells" className="text-royal-700 underline">Create cells</Link></Empty> : (
            <ul className="divide-y divide-stone-100">
              {cells.map((c) => {
                const cur = c.leaderMemberId ? memberById.get(c.leaderMemberId) : undefined;
                return (
                  <li key={c.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <Link to={`/cells/${c.id}`} className="w-56 font-medium text-stone-900 hover:text-royal-700">{c.name}<div className="text-xs font-normal text-stone-500">{branchName(c.branchId)}</div></Link>
                    <span className="flex-1">{cur ? label(cur) : c.leaderName ? <span className="text-stone-500">{c.leaderName} <span className="text-xs">(not linked)</span></span> : <span className="text-stone-300">No leader</span>}</span>
                    {editCells && <Button size="sm" variant="ghost" onClick={() => setPicking({ title: `Leader of ${c.name}`, onPick: async (m) => { await setCellLeader(c.id, m); setPicking(null); } })}>{cur || c.leaderName ? 'Change' : 'Choose'}</Button>}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {tab === 'people' && (
        <Card>
          {leaders.length === 0 ? <Empty icon={<UserCog />} title="No leaders assigned yet">Start with “Church positions”: assign the Head Pastor, Associate Pastor and others.</Empty> : (
            <ul className="divide-y divide-stone-100">
              {leaders.map(({ m, roles }) => (
                <li key={m.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar text={initials(m.firstName, m.lastName)} />
                    <div className="min-w-0">
                      <Link to={`/members/${m.id}`} className="font-medium text-stone-900 hover:text-royal-700">{label(m)}</Link>
                      <div className="mt-1 flex flex-wrap gap-1">{roles.map((r) => <Badge key={r} color={/Pastor/.test(r) ? 'gold' : /Cell/.test(r) ? 'blue' : 'royal'}>{r}</Badge>)}</div>
                    </div>
                  </div>
                  {can(profile?.role, 'users.manage') && <Button size="sm" variant="outline" onClick={() => nav(`/users?member=${m.id}`)}><KeyRound className="h-3.5 w-3.5" /> Login access</Button>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      {picking && <MemberPicker title={picking.title} exclude={picking.exclude} onPick={(m) => { picking.onPick(m); }} onClose={() => setPicking(null)} />}
    </div>
  );
}

/** Roles a member holds, for their profile page. */
export function MemberRoles({ m }: { m: Member }) {
  const { deptTree, cells } = useData();
  const roles = [
    ...(m.positions ?? []),
    ...deptTree.filter(({ dept }) => dept.headMemberId === m.id).map(({ dept }) => `Head of ${dept.name}`),
    ...deptTree.filter(({ dept }) => dept.assistantMemberId === m.id).map(({ dept }) => `Assistant, ${dept.name}`),
    ...cells.filter((c) => c.leaderMemberId === m.id).map((c) => `Cell leader: ${c.name}`),
  ];
  if (!roles.length) return null;
  return <div className="flex flex-wrap gap-1">{roles.map((r) => <Badge key={r} color={/Pastor/.test(r) ? 'gold' : /Cell/.test(r) ? 'blue' : 'royal'}>{r}</Badge>)}</div>;
}
