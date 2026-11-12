import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, updateDoc, where, type Unsubscribe } from 'firebase/firestore';
import { AlertTriangle, ChevronRight, Home, Plus, Sprout, TrendingUp, UserPlus, Users } from 'lucide-react';
import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Stat, Trash, errorText, useToast } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { ALL, useData } from '../context/DataContext';
import { db } from '../lib/firebase';
import { DAYS, MONTHS, isoDate, monthKey, monthLabel, shortDate, shiftMonth } from '../lib/format';
import { can } from '../lib/roles';
import type { Cell, CellReport } from '../lib/types';

/** Cell reports between two dates. Cell leaders only read their own cells' reports. */
export function useCellReports(branch: string, start: string, end: string, cellIds: string[] | null) {
  const [reports, setReports] = useState<CellReport[]>([]);
  const key = cellIds?.join(',') ?? '';
  useEffect(() => {
    const base = collection(db, 'cellReports');
    const map = (docs: { id: string; data(): unknown }[]) => docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as CellReport);
    if (cellIds) {
      const per = new Map<string, CellReport[]>();
      const unsubs: Unsubscribe[] = cellIds.map((c) => onSnapshot(query(base, where('cellId', '==', c), where('branchId', '==', branch)), (s) => {
        per.set(c, map(s.docs).filter((r) => r.date >= start && r.date <= end));
        setReports([...per.values()].flat());
      }, (e) => console.error('cellReports', e)));
      if (!cellIds.length) setReports([]);
      return () => unsubs.forEach((u) => u());
    }
    const q = branch === ALL
      ? query(base, where('date', '>=', start), where('date', '<=', end))
      : query(base, where('branchId', '==', branch), where('date', '>=', start), where('date', '<=', end));
    return onSnapshot(q, (s) => setReports(map(s.docs)), (e) => console.error('cellReports', e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch, start, end, key]);
  return reports;
}

export function useMyCells(): { cells: Cell[]; ids: string[] | null } {
  const { profile } = useAuth();
  const { cells, deptWithChildren } = useData();
  if (profile?.role === 'cell_leader') {
    const mine = cells.filter((c) => profile.cellIds?.includes(c.id));
    return { cells: mine, ids: profile.cellIds ?? [] };
  }
  if (profile?.role === 'dept_leader') {
    const depts = profile.departmentIds.flatMap(deptWithChildren);
    return { cells: cells.filter((c) => depts.includes(c.departmentId)), ids: null };
  }
  return { cells, ids: null };
}

export default function Cells() {
  const { profile } = useAuth();
  const { members, scope, branchName, deptName, departments } = useData();
  const { cells, ids } = useMyCells();
  const manage = can(profile?.role, 'cells.manage');
  const [month, setMonth] = useState(monthKey());
  const [editing, setEditing] = useState<Cell | null>(null);
  const [creating, setCreating] = useState(false);
  const branch = profile?.branchId ?? scope;

  const sixStart = `${shiftMonth(month, -5)}-01`;
  const [y, m] = month.split('-').map(Number);
  const monthEnd = isoDate(new Date(y, m, 0));
  const all = useCellReports(branch, sixStart, monthEnd, ids);
  const visibleCellIds = new Set(cells.map((c) => c.id));
  const reports = all.filter((r) => visibleCellIds.has(r.cellId));
  const thisMonth = reports.filter((r) => r.date.startsWith(month));
  const cellMembers = members.filter((mm) => mm.cellId && visibleCellIds.has(mm.cellId));
  const joinedViaCells = (mk: string) => members.filter((mm) => mm.source === 'cell' && mm.joinedAt.startsWith(mk) && (!mm.cellId || visibleCellIds.has(mm.cellId))).length;
  const sum = (rs: CellReport[], k: 'firstTimers' | 'newConverts' | 'membersPresent') => rs.reduce((t, r) => t + (Number(r[k]) || 0), 0);

  const trend = Array.from({ length: 6 }, (_, i) => {
    const mk = shiftMonth(month, i - 5);
    const rs = reports.filter((r) => r.date.startsWith(mk));
    return { mk, firstTimers: sum(rs, 'firstTimers'), converts: sum(rs, 'newConverts'), joined: joinedViaCells(mk) };
  });
  const maxTrend = Math.max(1, ...trend.flatMap((t) => [t.firstTimers, t.converts, t.joined]));

  const lastReport = useMemo(() => {
    const mp = new Map<string, string>();
    reports.forEach((r) => { if ((mp.get(r.cellId) ?? '') < r.date) mp.set(r.cellId, r.date); });
    return mp;
  }, [reports]);
  const twoWeeksAgo = isoDate(new Date(Date.now() - 14 * 86400000));
  const quiet = cells.filter((c) => c.active && (lastReport.get(c.id) ?? '') < twoWeeksAgo);

  const grouped = useMemo(() => {
    const g = new Map<string, Cell[]>();
    cells.forEach((c) => g.set(c.departmentId, [...(g.get(c.departmentId) ?? []), c]));
    return [...g.entries()];
  }, [cells]);

  return (
    <div>
      <PageHeader
        title="Cells"
        subtitle={`Cell meetings and church growth · ${branch === ALL ? 'all branches' : branchName(branch)}`}
        actions={
          <>
            <Select value={month} onChange={(e) => setMonth(e.target.value)} className="!w-44 !py-2">
              {Array.from({ length: 12 }, (_, i) => shiftMonth(monthKey(), -i)).map((mk) => <option key={mk} value={mk}>{monthLabel(mk)}</option>)}
            </Select>
            {manage && <Button onClick={() => setCreating(true)} disabled={!departments.length}><Plus className="h-4 w-4" /> New cell</Button>}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Cells" value={cells.filter((c) => c.active).length} icon={<Home className="h-4 w-4" />} sub={`${cellMembers.length} people in cells`} />
        <Stat label={`Meetings in ${MONTHS[m - 1]}`} value={thisMonth.length} sub={thisMonth.length ? `Avg. attendance ${Math.round(sum(thisMonth, 'membersPresent') / thisMonth.length)}` : 'No reports yet'} />
        <Stat label="First-timers" value={sum(thisMonth, 'firstTimers')} icon={<UserPlus className="h-4 w-4" />} sub={`${sum(thisMonth, 'newConverts')} new converts`} />
        <Stat label="Joined church via cells" value={joinedViaCells(month)} icon={<Sprout className="h-4 w-4" />} sub="Added from cell contacts" />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-royal-600" /><h2 className="font-semibold text-stone-900">Growth — last 6 months</h2></div>
          <div className="flex h-44 items-end gap-3">
            {trend.map((t) => (
              <div key={t.mk} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-36 w-full items-end justify-center gap-1">
                  {([['firstTimers', 'bg-gold-400'], ['converts', 'bg-royal-600'], ['joined', 'bg-emerald-500']] as const).map(([k, c]) => (
                    <div key={k} className={`w-1/4 max-w-[18px] rounded-t ${c}`} style={{ height: `${Math.max(2, (t[k] / maxTrend) * 140)}px` }} title={`${k}: ${t[k]}`} />
                  ))}
                </div>
                <span className="text-[11px] text-stone-500">{MONTHS[Number(t.mk.slice(5)) - 1].slice(0, 3)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-stone-500">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-gold-400" /> First-timers</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-royal-600" /> New converts</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Joined the church</span>
          </div>
        </Card>
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /><h2 className="font-semibold text-stone-900">Needs follow-up</h2></div>
          <p className="mb-3 text-xs text-stone-500">Active cells with no report in the last 2 weeks.</p>
          {quiet.length === 0 ? <p className="text-sm text-emerald-600">All cells are reporting. 🎉</p> : (
            <ul className="space-y-2 text-sm">
              {quiet.slice(0, 8).map((c) => (
                <li key={c.id}><Link to={`/cells/${c.id}`} className="flex justify-between rounded-lg px-2 py-1 hover:bg-stone-50"><span>{c.name}</span><span className="text-xs text-stone-400">{lastReport.get(c.id) ? shortDate(lastReport.get(c.id)!) : 'never'}</span></Link></li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {cells.length === 0 ? (
        <Card><Empty icon={<Home />} title="No cells yet">{manage ? 'Create a cell under a department (for example Organising or Evangelism), give it a leader and start collecting meeting reports.' : 'No cells have been assigned to you yet.'}</Empty></Card>
      ) : (
        <div className="space-y-6">
          {grouped.map(([deptId, list]) => (
            <Card key={deptId}>
              <div className="border-b border-stone-100 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-stone-500">Under {deptName(deptId)}</div>
              <ul className="divide-y divide-stone-100">
                {list.map((c) => {
                  const rs = thisMonth.filter((r) => r.cellId === c.id);
                  return (
                    <li key={c.id}>
                      <Link to={`/cells/${c.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-stone-50/70">
                        <div className="rounded-xl bg-gold-50 p-2.5 text-gold-600"><Home className="h-4 w-4" /></div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-stone-900">{c.name} {!c.active && <Badge color="gray">inactive</Badge>}</div>
                          <div className="truncate text-xs text-stone-500">{c.leaderName || 'No leader'} · {c.meetingDay} {c.meetingTime}{c.location && ` · ${c.location}`}{branch === ALL && ` · ${branchName(c.branchId)}`}</div>
                        </div>
                        <div className="hidden text-right text-xs text-stone-500 sm:block">
                          <div><b className="text-stone-800">{members.filter((mm) => mm.cellId === c.id).length}</b> members</div>
                          <div>{rs.length} meetings · {sum(rs, 'firstTimers')} first-timers</div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-stone-300" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>
      )}
      {(creating || editing) && <CellForm cell={editing} onClose={() => { setCreating(false); setEditing(null); }} />}
    </div>
  );
}

export function CellForm({ cell, onClose }: { cell: Cell | null; onClose: () => void }) {
  const { profile } = useAuth();
  const { branches, deptTree, scope, deptWithChildren } = useData();
  const toast = useToast();
  const allowedDepts = profile?.role === 'dept_leader' ? profile.departmentIds.flatMap(deptWithChildren) : null;
  const [d, setD] = useState({
    name: cell?.name ?? '', branchId: cell?.branchId ?? profile?.branchId ?? (scope !== ALL ? scope : branches[0]?.id ?? ''),
    departmentId: cell?.departmentId ?? allowedDepts?.[0] ?? '', leaderName: cell?.leaderName ?? '', leaderPhone: cell?.leaderPhone ?? '',
    location: cell?.location ?? '', meetingDay: cell?.meetingDay ?? 'Wednesday', meetingTime: cell?.meetingTime ?? '18:30', active: cell?.active ?? true,
  });
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const data = { ...d, name: d.name.trim(), updatedAt: serverTimestamp() };
      if (cell) await updateDoc(doc(db, 'cells', cell.id), data);
      else await addDoc(collection(db, 'cells'), { ...data, createdAt: serverTimestamp() });
      toast('ok', 'Cell saved.');
      onClose();
    } catch (err) { toast('err', errorText(err)); setBusy(false); }
  }

  async function remove() {
    if (!cell || !confirm(`Delete ${cell.name}? Its reports are kept.`)) return;
    try { await deleteDoc(doc(db, 'cells', cell.id)); toast('ok', 'Cell deleted.'); onClose(); }
    catch (err) { toast('err', errorText(err)); }
  }

  return (
    <Modal open onClose={onClose} title={cell ? 'Edit cell' : 'New cell'}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Cell name"><Input required value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="e.g. Asokwa Cell, Grace Cell" /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Under department">
            <Select required value={d.departmentId} onChange={(e) => setD({ ...d, departmentId: e.target.value })}>
              <option value="">Choose…</option>
              {deptTree.filter(({ dept }) => !allowedDepts || allowedDepts.includes(dept.id)).map(({ dept, depth }) => <option key={dept.id} value={dept.id}>{depth ? '↳ ' : ''}{dept.name}</option>)}
            </Select>
          </Field>
          <Field label="Branch">
            <Select required value={d.branchId} disabled={!!profile?.branchId} onChange={(e) => setD({ ...d, branchId: e.target.value })}>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
          <Field label="Cell leader"><Input value={d.leaderName} onChange={(e) => setD({ ...d, leaderName: e.target.value })} /></Field>
          <Field label="Leader's phone"><Input value={d.leaderPhone} onChange={(e) => setD({ ...d, leaderPhone: e.target.value })} /></Field>
          <Field label="Meeting day">
            <Select value={d.meetingDay} onChange={(e) => setD({ ...d, meetingDay: e.target.value })}>{DAYS.map((x) => <option key={x}>{x}</option>)}</Select>
          </Field>
          <Field label="Time"><Input type="time" value={d.meetingTime} onChange={(e) => setD({ ...d, meetingTime: e.target.value })} /></Field>
        </div>
        <Field label="Meeting place"><Input value={d.location} onChange={(e) => setD({ ...d, location: e.target.value })} placeholder="House / area" /></Field>
        <label className="flex items-center gap-2 text-sm text-stone-700"><input type="checkbox" checked={d.active} onChange={(e) => setD({ ...d, active: e.target.checked })} className="rounded border-stone-300" /> Active</label>
        <div className="flex items-center justify-between pt-2">
          {cell ? <Button type="button" variant="ghost" className="text-red-600" onClick={remove}><Trash /> Delete</Button> : <span />}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={busy}>Save</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export const CellIcon = Users;
