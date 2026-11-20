import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, serverTimestamp, writeBatch } from 'firebase/firestore';
import { Plus, Printer, Save, Trash2 } from 'lucide-react';
import { Button, Card, Input, Select, cx, errorText, useToast } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { db } from '../lib/firebase';
import { money, monthKey, monthLabel, shiftMonth, today } from '../lib/format';
import type { Cell, CellLog, CellLogRow, CellPersonStatus } from '../lib/types';
import { emptyMember } from './Members';

const WEEKS = [0, 1, 2, 3, 4];
const blank = () => [false, false, false, false, false];
export const STATUS_HELP: Record<CellPersonStatus, string> = { CM: 'Church member', UCV: 'Unestablished convert', ECV: 'Established convert' };
export const logId = (cellId: string, month: string) => `${cellId}_${month}`;
/** Week of the month (1–5) for a date. */
export const weekOfMonth = (iso: string) => Math.min(5, Math.ceil(Number(iso.slice(8, 10)) / 7));

export function logTotals(log: Pick<CellLog, 'meetings' | 'rows'>) {
  const held = log.meetings.filter((w) => w.date || w.attendance || w.offering);
  const attendance = held.reduce((t, w) => t + (Number(w.attendance) || 0), 0);
  return {
    meetings: held.length, attendanceTotal: attendance, attendanceAvg: held.length ? Math.round(attendance / held.length) : 0,
    offering: log.meetings.reduce((t, w) => t + (Number(w.offering) || 0), 0),
    CM: log.rows.filter((r) => r.status === 'CM').length, UCV: log.rows.filter((r) => r.status === 'UCV').length, ECV: log.rows.filter((r) => r.status === 'ECV').length,
  };
}

export default function CellLogBook({ cell, canEdit }: { cell: Cell; canEdit: boolean }) {
  const { profile } = useAuth();
  const { members, branchName } = useData();
  const toast = useToast();
  const [month, setMonth] = useState(monthKey());
  const [log, setLog] = useState<Omit<CellLog, 'id'> | null>(null);
  const [saved, setSaved] = useState(true);
  const [busy, setBusy] = useState(false);
  const thisWeek = month === monthKey() ? weekOfMonth(today()) - 1 : -1;
  const cellMembers = useMemo(() => members.filter((m) => m.cellId === cell.id && m.status !== 'inactive'), [members, cell.id]);

  useEffect(() => {
    setLog(null);
    return onSnapshot(doc(db, 'cellLogs', logId(cell.id, month)), (s) => {
      if (s.exists()) { setLog({ ...(s.data() as CellLog) }); setSaved(true); return; }
      // New month: start from the cell's members.
      setLog({
        cellId: cell.id, branchId: cell.branchId, month, leaderName: cell.leaderName,
        rows: cellMembers.map((m) => ({ memberId: m.id, name: `${m.firstName} ${m.lastName}`.trim(), phone: m.phone, status: m.status === 'visitor' ? 'UCV' : 'CM', cell: blank(), sunday: blank(), weekday: blank() })),
        meetings: WEEKS.map(() => ({ date: '', attendance: 0, offering: 0 })),
      });
      setSaved(true);
    }, (e) => toast('err', errorText(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cell.id, month]);

  if (!log) return <Card className="p-6 text-sm text-stone-500">Loading log book…</Card>;
  const t = logTotals(log);
  const change = (next: Omit<CellLog, 'id'>) => { setLog(next); setSaved(false); };
  const setRow = (i: number, r: Partial<CellLogRow>) => change({ ...log, rows: log.rows.map((x, j) => (j === i ? { ...x, ...r } : x)) });
  const tick = (i: number, k: 'cell' | 'sunday' | 'weekday', w: number) => {
    const rows = log.rows.map((x, j) => (j === i ? { ...x, [k]: x[k].map((v, n) => (n === w ? !v : v)) } : x));
    // Cell-meeting attendance for the week follows the ticks.
    const meetings = k === 'cell' ? log.meetings.map((m, n) => (n === w ? { ...m, attendance: rows.filter((r) => r.cell[w]).length } : m)) : log.meetings;
    change({ ...log, rows, meetings });
  };
  const missing = cellMembers.filter((m) => !log.rows.some((r) => r.memberId === m.id));

  async function save() {
    if (!log) return;
    setBusy(true);
    try {
      const batch = writeBatch(db);
      // New names typed into the book become visitors in this cell, so they can be followed up.
      const rows = log.rows.map((r) => {
        if (r.memberId || !r.name.trim()) return r;
        const ref = doc(collection(db, 'members'));
        const parts = r.name.trim().split(/\s+/);
        batch.set(ref, { ...emptyMember(cell.branchId), firstName: parts[0], lastName: parts.slice(1).join(' '), phone: r.phone.trim(), status: 'visitor', cellId: cell.id, source: 'cell', joinedAt: today(), notes: `Added from ${cell.name} cell log book (${monthLabel(month)}) as ${STATUS_HELP[r.status]}.`, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        return { ...r, memberId: ref.id };
      }).filter((r) => r.name.trim());
      batch.set(doc(db, 'cellLogs', logId(cell.id, month)), { ...log, rows, cellId: cell.id, branchId: cell.branchId, month, updatedByName: profile?.displayName ?? '', updatedAt: serverTimestamp() });
      await batch.commit();
      toast('ok', 'Log book saved.'); setSaved(true);
    } catch (e) { toast('err', errorText(e)); } finally { setBusy(false); }
  }

  const head = 'border border-stone-300 px-1 py-1 text-center text-[11px] font-semibold';
  const cellCls = 'border border-stone-300';
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-100 px-5 py-3 print:hidden">
        <h2 className="font-semibold text-stone-900">Cell leaders log book</h2>
        <Select value={month} onChange={(e) => setMonth(e.target.value)} className="!w-44 !py-1.5">
          {Array.from({ length: 12 }, (_, i) => shiftMonth(monthKey(), -i)).map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </Select>
        {thisWeek >= 0 && <span className="rounded-full bg-gold-100 px-2 py-0.5 text-xs text-gold-800">This is week {thisWeek + 1}</span>}
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button>
          {canEdit && <Button size="sm" loading={busy} disabled={saved} onClick={save}><Save className="h-4 w-4" /> {saved ? 'Saved' : 'Save'}</Button>}
        </div>
      </div>
      <div className="p-4 sm:p-5">
        <div className="mb-3 grid gap-1 text-sm font-semibold text-stone-800 sm:grid-cols-2">
          <div>TOGG: {branchName(cell.branchId).replace(/^TOGG\s*/i, '').toUpperCase()}</div><div className="sm:text-right">DATE: {new Date().toLocaleDateString('en-GB')}</div>
          <div>CELL LEADERS LOG BOOK — MONTHLY &amp; WEEKLY CELL ACTIVITIES REPORT</div><div className="sm:text-right">MONTH: {monthLabel(month).toUpperCase()}</div>
          <div>CELL LEADER: {log.leaderName || cell.leaderName || '—'}</div><div className="sm:text-right">CELL NAME/LOCATION: {cell.name}{cell.location ? ` — ${cell.location}` : ''}</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] border-collapse text-sm">
            <thead>
              <tr><th rowSpan={2} className={head}>NO.</th><th rowSpan={2} className={cx(head, 'text-left')}>NAME</th><th rowSpan={2} className={cx(head, 'text-left')}>TELEPHONE NO.</th>
                <th colSpan={5} className={head}>CELL MEETINGS</th><th colSpan={5} className={head}>SUNDAY SERVICES</th><th colSpan={5} className={head}>WEEKDAY SERVICES</th><th rowSpan={2} className={head}>STATUS</th>{canEdit && <th rowSpan={2} className={cx(head, 'print:hidden')} />}</tr>
              <tr>{[0, 1, 2].flatMap((g) => WEEKS.map((w) => <th key={`${g}${w}`} className={cx(head, 'w-8 font-normal', w === thisWeek && 'bg-gold-100')}>{w + 1}</th>))}</tr>
            </thead>
            <tbody>
              {log.rows.map((r, i) => (
                <tr key={i}>
                  <td className={cx(cellCls, 'px-1 text-center text-xs')}>{i + 1}</td>
                  <td className={cellCls}>{canEdit && !r.memberId ? <input className="w-full px-1 py-1 outline-none" value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} placeholder="New person's name" /> : <span className="px-1">{r.name}</span>}</td>
                  <td className={cellCls}>{canEdit && !r.memberId ? <input className="w-full px-1 py-1 outline-none" value={r.phone} onChange={(e) => setRow(i, { phone: e.target.value })} placeholder="Phone" /> : <span className="px-1 text-xs">{r.phone}</span>}</td>
                  {(['cell', 'sunday', 'weekday'] as const).flatMap((k) => WEEKS.map((w) => (
                    <td key={`${k}${w}`} className={cx(cellCls, 'text-center', w === thisWeek && 'bg-gold-50')}>
                      <input type="checkbox" aria-label={`${r.name} ${k} week ${w + 1}`} disabled={!canEdit} checked={!!r[k][w]} onChange={() => tick(i, k, w)} className="h-4 w-4 rounded border-stone-300 accent-royal-700" />
                    </td>
                  )))}
                  <td className={cellCls}>
                    <select disabled={!canEdit} value={r.status} onChange={(e) => setRow(i, { status: e.target.value as CellPersonStatus })} className="w-full bg-transparent px-1 py-1 text-xs" title={STATUS_HELP[r.status]}>
                      <option value="CM">CM</option><option value="UCV">UCV</option><option value="ECV">ECV</option>
                    </select>
                  </td>
                  {canEdit && <td className={cx(cellCls, 'text-center print:hidden')}><button onClick={() => change({ ...log, rows: log.rows.filter((_, j) => j !== i) })} className="text-stone-300 hover:text-red-600" aria-label="Remove row"><Trash2 className="mx-auto h-3.5 w-3.5" /></button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-[11px] font-semibold text-stone-500">NB: INDICATE UNDER STATUS: 1. CM (CHURCH MEMBER) 2. UCV (UNESTABLISHED CONVERT) 3. ECV (ESTABLISHED CONVERT)</p>
        {canEdit && (
          <div className="mt-3 flex flex-wrap gap-2 print:hidden">
            <Button size="sm" variant="outline" onClick={() => change({ ...log, rows: [...log.rows, { memberId: '', name: '', phone: '', status: 'UCV', cell: blank(), sunday: blank(), weekday: blank() }] })}><Plus className="h-4 w-4" /> Add new person</Button>
            {missing.length > 0 && <Button size="sm" variant="ghost" onClick={() => change({ ...log, rows: [...log.rows, ...missing.map((m) => ({ memberId: m.id, name: `${m.firstName} ${m.lastName}`.trim(), phone: m.phone, status: (m.status === 'visitor' ? 'UCV' : 'CM') as CellPersonStatus, cell: blank(), sunday: blank(), weekday: blank() }))] })}>Add {missing.length} cell member(s) not in the book</Button>}
          </div>
        )}

        <table className="mt-6 w-full max-w-2xl border-collapse text-sm">
          <thead>
            <tr><th colSpan={4} className={cx(head, 'bg-stone-100 text-left')}>CELL MEETING</th></tr>
            <tr><th className={cx(head, 'text-left')}>WEEK</th><th className={head}>DATE</th><th className={head}>ATTENDANCE</th><th className={head}>OFFERING (GH₵)</th></tr>
          </thead>
          <tbody>
            {log.meetings.map((m, w) => (
              <tr key={w} className={w === thisWeek ? 'bg-gold-50' : ''}>
                <td className={cx(cellCls, 'px-2 py-1 font-semibold')}>WK{w + 1}</td>
                <td className={cellCls}><Input type="date" disabled={!canEdit} value={m.date} onChange={(e) => change({ ...log, meetings: log.meetings.map((x, j) => (j === w ? { ...x, date: e.target.value } : x)) })} className="!rounded-none !border-0 !py-1" /></td>
                <td className={cellCls}><Input type="number" min={0} disabled={!canEdit} value={m.attendance || ''} onChange={(e) => change({ ...log, meetings: log.meetings.map((x, j) => (j === w ? { ...x, attendance: Number(e.target.value) || 0 } : x)) })} className="!rounded-none !border-0 !py-1 text-center" /></td>
                <td className={cellCls}><Input type="number" min={0} step="0.01" disabled={!canEdit} value={m.offering || ''} onChange={(e) => change({ ...log, meetings: log.meetings.map((x, j) => (j === w ? { ...x, offering: Number(e.target.value) || 0 } : x)) })} className="!rounded-none !border-0 !py-1 text-center" /></td>
              </tr>
            ))}
            <tr className="bg-stone-100 font-semibold">
              <td className={cx(cellCls, 'px-2 py-1')}>AVGE / TOTAL</td>
              <td className={cx(cellCls, 'px-2 text-center text-xs')}>{t.meetings} meeting(s)</td>
              <td className={cx(cellCls, 'px-2 text-center')}>avg {t.attendanceAvg} · total {t.attendanceTotal}</td>
              <td className={cx(cellCls, 'px-2 text-center')}>{money(t.offering)}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-3 text-xs text-stone-500 print:hidden">
          Tick the column for this week each week, then Save. Attendance for a cell meeting fills in from the ticks (you can change it).
          New people you add are saved as visitors in this cell so they can be followed up. This month: {t.CM} CM · {t.UCV} UCV · {t.ECV} ECV.
        </p>
      </div>
    </Card>
  );
}

