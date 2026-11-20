import { useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { collection, deleteDoc, doc, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { ClipboardPlus, Home, MessageSquare, Send, Pencil, Plus, Search, Trash2, UserMinus, UserPlus } from 'lucide-react';
import { Avatar, Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Stat, Textarea, errorText, useToast } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { db } from '../lib/firebase';
import { queueSms } from '../lib/sms';
import { initials, money, prettyDate, today } from '../lib/format';
import { can } from '../lib/roles';
import type { Cell, CellReport, NewContact } from '../lib/types';
import { CellForm, useCellReports } from './Cells';
import { emptyMember } from './Members';
import CellLogBook, { logTotals } from './CellLogBook';
import { useCellLogs } from './Cells';
import { monthKey, monthLabel } from '../lib/format';

export default function CellDetail() {
  const { id = '' } = useParams();
  const { profile } = useAuth();
  const { cells, members, branchName } = useData();
  const toast = useToast();
  const cell = cells.find((c) => c.id === id);
  const role = profile?.role;
  const isCellLeader = !!profile?.cellIds?.includes(id);
  const canManage = can(role, 'cells.manage');
  const canReport = canManage || isCellLeader;
  const canEditCell = canManage;
  const [reporting, setReporting] = useState<CellReport | null | 'new'>(null);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [texting, setTexting] = useState(false);

  const reports = useCellReports(cell?.branchId ?? '', '2000-01-01', '2999-12-31', cell ? [id] : []);
  const sorted = [...reports].sort((a, b) => b.date.localeCompare(a.date));
  const inCell = members.filter((m) => m.cellId === id);

  if (!cell) return <Empty icon={<Home />} title="Cell not found"><Link className="text-royal-700 underline" to="/cells">Back to cells</Link></Empty>;

  async function removeFromCell(mid: string) {
    try { await updateDoc(doc(db, 'members', mid), { cellId: null, updatedAt: serverTimestamp() }); }
    catch (e) { toast('err', errorText(e)); }
  }

  return (
    <div>
      <PageHeader
        title={cell.name}
        subtitle={`${branchName(cell.branchId)} · ${cell.meetingDay}s ${cell.meetingTime}${cell.location ? ` · ${cell.location}` : ''}`}
        actions={
          <>
            {canEditCell && <Button variant="outline" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Edit</Button>}
            {canReport && <Button variant="outline" onClick={() => setTexting(true)}><MessageSquare className="h-4 w-4" /> Text my cell</Button>}
            {canReport && <Button variant="gold" onClick={() => setReporting('new')}><ClipboardPlus className="h-4 w-4" /> Write meeting report</Button>}
          </>
        }
      />
      <p className="-mt-3 mb-6 text-sm text-stone-500">Leader: {cell.leaderName || '—'}{cell.leaderPhone && ` · ${cell.leaderPhone}`}</p>

      <CellMonthStats cell={cell} members={inCell.length} />

      <div className="mb-6"><CellLogBook cell={cell} canEdit={canReport} /></div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <div className="border-b border-stone-100 px-5 py-4"><h2 className="font-semibold text-stone-900">Meeting reports</h2></div>
          {sorted.length === 0 ? <Empty icon={<ClipboardPlus />} title="No reports yet">Tick attendance in the log book above, and use “Write meeting report” for the topic, testimonies, offering and new contacts.</Empty> : (
            <ul className="divide-y divide-stone-100">
              {sorted.map((r) => (
                <li key={r.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-stone-900">{prettyDate(r.date)}{r.topic && <span className="font-normal text-stone-500"> · {r.topic}</span>}</div>
                      <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                        <Badge color="royal">{r.membersPresent} present</Badge>
                        {r.firstTimers > 0 && <Badge color="gold">{r.firstTimers} first-timers</Badge>}
                        {r.newConverts > 0 && <Badge color="green">{r.newConverts} converts</Badge>}
                        {r.offering > 0 && <Badge color="gray">{money(r.offering)}</Badge>}
                      </div>
                    </div>
                    {canReport && <button onClick={() => setReporting(r)} className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-royal-700" aria-label="Edit report"><Pencil className="h-4 w-4" /></button>}
                  </div>
                  {r.testimonies && <p className="mt-2 text-sm text-stone-600">🙌 {r.testimonies}</p>}
                  {r.newContacts?.length > 0 && <p className="mt-1 text-xs text-stone-500">New contacts: {r.newContacts.map((c) => c.name).join(', ')}</p>}
                  <p className="mt-1 text-[11px] text-stone-400">by {r.submittedByName}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
            <h2 className="font-semibold text-stone-900">Members <span className="text-stone-400">({inCell.length})</span></h2>
            {canManage && <Button size="sm" variant="outline" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add</Button>}
          </div>
          {inCell.length === 0 ? <Empty title="No one in this cell yet" /> : (
            <ul className="max-h-[30rem] divide-y divide-stone-100 overflow-y-auto">
              {inCell.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-5 py-3">
                  <Avatar text={initials(m.firstName, m.lastName)} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-stone-900">{m.firstName} {m.lastName}</div>
                    <div className="truncate text-xs text-stone-500">{m.phone || 'No phone'} {m.status === 'visitor' && '· visitor'}</div>
                  </div>
                  {canReport && <button onClick={() => removeFromCell(m.id)} className="rounded-lg p-1.5 text-stone-300 hover:bg-stone-100 hover:text-red-600" title="Remove from cell" aria-label="Remove from cell"><UserMinus className="h-4 w-4" /></button>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {texting && <TextCell cell={cell} count={inCell.filter((m) => m.phone).length} onClose={() => setTexting(false)} />}
      {reporting && <CellReportForm cell={cell} report={reporting === 'new' ? null : reporting} canDelete={canManage} onClose={() => setReporting(null)} />}
      {editing && <CellForm cell={cell} onClose={() => setEditing(false)} />}
      {adding && <AddToCell cell={cell} onClose={() => setAdding(false)} />}
    </div>
  );
}

function AddToCell({ cell, onClose }: { cell: Cell; onClose: () => void }) {
  const { members, cellName } = useData();
  const toast = useToast();
  const [q, setQ] = useState('');
  const results = useMemo(() => {
    const n = q.trim().toLowerCase();
    return members.filter((m) => m.branchId === cell.branchId && m.cellId !== cell.id && (!n || `${m.firstName} ${m.lastName} ${m.phone}`.toLowerCase().includes(n))).slice(0, 12);
  }, [q, members, cell]);
  async function add(mid: string, name: string) {
    try { await updateDoc(doc(db, 'members', mid), { cellId: cell.id, updatedAt: serverTimestamp() }); toast('ok', `${name} added to ${cell.name}.`); }
    catch (e) { toast('err', errorText(e)); }
  }
  return (
    <Modal open onClose={onClose} title={`Add to ${cell.name}`}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
        <Input autoFocus className="pl-9" placeholder="Search members…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ul className="mt-3 divide-y divide-stone-100">
        {results.map((m) => (
          <li key={m.id} className="flex items-center gap-3 py-2.5">
            <Avatar text={initials(m.firstName, m.lastName)} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{m.firstName} {m.lastName}</div>
              <div className="truncate text-xs text-stone-500">{m.cellId ? `Now in ${cellName(m.cellId)}` : 'Not in a cell'}</div>
            </div>
            <Button size="sm" variant="outline" onClick={() => add(m.id, m.firstName)}>Add</Button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

function CellReportForm({ cell, report, canDelete, onClose }: { cell: Cell; report: CellReport | null; canDelete: boolean; onClose: () => void }) {
  const { profile } = useAuth();
  const toast = useToast();
  const [d, setD] = useState({
    date: report?.date ?? today(), topic: report?.topic ?? '', membersPresent: report?.membersPresent ?? 0, firstTimers: report?.firstTimers ?? 0,
    newConverts: report?.newConverts ?? 0, offering: report?.offering ?? 0, testimonies: report?.testimonies ?? '', challenges: report?.challenges ?? '',
  });
  const [contacts, setContacts] = useState<(NewContact & { register: boolean })[]>(
    report?.newContacts?.map((c) => ({ ...c, register: false })) ?? [],
  );
  const [busy, setBusy] = useState(false);
  const num = (v: string) => Math.max(0, Number(v) || 0);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const batch = writeBatch(db);
      const clean = contacts.filter((c) => c.name.trim());
      const ref = report ? doc(db, 'cellReports', report.id) : doc(collection(db, 'cellReports'));
      batch.set(ref, {
        ...d, cellId: cell.id, branchId: cell.branchId,
        firstTimers: Math.max(d.firstTimers, clean.length),
        newContacts: clean.map((c) => ({ name: c.name.trim(), phone: c.phone.trim(), addedAsMember: !!c.addedAsMember || c.register })),
        submittedByName: report?.submittedByName ?? profile?.displayName ?? '', submittedBy: profile?.uid ?? '',
        ...(report ? {} : { createdAt: serverTimestamp() }), updatedAt: serverTimestamp(),
      });
      let added = 0;
      clean.filter((c) => c.register && !c.addedAsMember).forEach((c) => {
        const parts = c.name.trim().split(/\s+/);
        batch.set(doc(collection(db, 'members')), {
          ...emptyMember(cell.branchId), firstName: parts[0], lastName: parts.slice(1).join(' '), phone: c.phone.trim(),
          status: 'visitor', cellId: cell.id, source: 'cell', joinedAt: d.date,
          notes: `First-timer at ${cell.name} cell on ${prettyDate(d.date)}`, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
        added++;
      });
      await batch.commit();
      toast('ok', `Report saved${added ? ` · ${added} new contact${added > 1 ? 's' : ''} added as visitors` : ''}.`);
      onClose();
    } catch (err) { toast('err', errorText(err)); setBusy(false); }
  }

  async function remove() {
    if (!report || !confirm('Delete this report?')) return;
    try { await deleteDoc(doc(db, 'cellReports', report.id)); onClose(); } catch (err) { toast('err', errorText(err)); }
  }

  return (
    <Modal open onClose={onClose} title={`${cell.name} — meeting report`} wide>
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Meeting date"><Input type="date" required value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} /></Field>
          <Field label="Topic / message"><Input value={d.topic} onChange={(e) => setD({ ...d, topic: e.target.value })} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Members present"><Input type="number" min={0} value={d.membersPresent || ''} onChange={(e) => setD({ ...d, membersPresent: num(e.target.value) })} /></Field>
          <Field label="First-timers"><Input type="number" min={0} value={d.firstTimers || ''} onChange={(e) => setD({ ...d, firstTimers: num(e.target.value) })} /></Field>
          <Field label="New converts"><Input type="number" min={0} value={d.newConverts || ''} onChange={(e) => setD({ ...d, newConverts: num(e.target.value) })} /></Field>
          <Field label="Offering (GH₵)"><Input type="number" min={0} step="0.01" value={d.offering || ''} onChange={(e) => setD({ ...d, offering: Number(e.target.value) || 0 })} /></Field>
        </div>

        <div className="rounded-xl border border-gold-200 bg-gold-50/50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-stone-800">New contacts / first-timers</h3>
              <p className="text-xs text-stone-500">Tick “Add to church” to put them in the church list as visitors in this cell, so they can be followed up and texted.</p>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => setContacts([...contacts, { name: '', phone: '', register: true }])}><UserPlus className="h-4 w-4" /> Add</Button>
          </div>
          <div className="space-y-2">
            {contacts.map((c, i) => (
              <div key={i} className="grid grid-cols-[1fr_9rem_auto_2rem] items-center gap-2">
                <Input value={c.name} placeholder="Full name" onChange={(e) => setContacts(contacts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <Input value={c.phone} placeholder="Phone" onChange={(e) => setContacts(contacts.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))} />
                {c.addedAsMember ? <Badge color="green">In church list</Badge> : (
                  <label className="flex items-center gap-1 whitespace-nowrap text-xs text-stone-600">
                    <input type="checkbox" checked={c.register} onChange={(e) => setContacts(contacts.map((x, j) => (j === i ? { ...x, register: e.target.checked } : x)))} className="rounded border-stone-300" /> Add to church
                  </label>
                )}
                <button type="button" onClick={() => setContacts(contacts.filter((_, j) => j !== i))} className="text-stone-400 hover:text-red-600" aria-label="Remove contact"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        </div>

        <Field label="Testimonies"><Textarea value={d.testimonies} onChange={(e) => setD({ ...d, testimonies: e.target.value })} /></Field>
        <Field label="Challenges / prayer needs"><Textarea value={d.challenges} onChange={(e) => setD({ ...d, challenges: e.target.value })} /></Field>
        <div className="flex items-center justify-between border-t border-stone-100 pt-4">
          {report && canDelete ? <Button type="button" variant="ghost" className="text-red-600" onClick={remove}><Trash2 className="h-4 w-4" /> Delete</Button> : <span />}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={busy}>Save report</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

/** This month at a glance, from the cell leaders' log book. */
function CellMonthStats({ cell, members }: { cell: Cell; members: number }) {
  const month = monthKey();
  const log = useCellLogs(cell.branchId, month, [cell.id])[0];
  const t = log ? logTotals(log) : null;
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="Members" value={members} />
      <Stat label={`Meetings · ${monthLabel(month)}`} value={t?.meetings ?? 0} sub={t ? `Average attendance ${t.attendanceAvg}` : 'Log book not started'} />
      <Stat label="Offering this month" value={money(t?.offering ?? 0)} />
      <Stat label="Converts this month" value={(t?.UCV ?? 0) + (t?.ECV ?? 0)} sub={t ? `${t.UCV} UCV · ${t.ECV} ECV · ${t.CM} CM` : undefined} />
    </div>
  );
}

/** Cell leader texts the members of their cell (SMS via Gonlinesites). */
function TextCell({ cell, count, onClose }: { cell: Cell; count: number; onClose: () => void }) {
  const { profile } = useAuth();
  const toast = useToast();
  const [text, setText] = useState(`Hello {firstName}, reminder: our ${cell.name} meeting is on ${cell.meetingDay} at ${cell.meetingTime}${cell.location ? ` at ${cell.location}` : ''}. See you there! - {church}`);
  const [busy, setBusy] = useState(false);
  async function send(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await queueSms({ branchId: cell.branchId, message: text.trim(), audience: { type: 'cell', cellId: cell.id, branchId: cell.branchId, includeVisitors: true }, label: `${cell.name} — cell message`, createdBy: profile?.uid, createdByName: profile?.displayName, estimate: count });
      toast(r.delivered ? 'ok' : 'err', r.delivered ? 'Message sent to your cell members.' : `Not sent: ${r.error ?? ''}`);
      if (r.delivered) onClose();
    } catch (err) { toast('err', errorText(err)); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={`Text ${cell.name}`}>
      <form onSubmit={send} className="space-y-4">
        <p className="text-sm text-stone-600">Goes to the {count} member(s) of this cell with a phone number. {'{firstName}'} becomes each person's name.</p>
        <Textarea rows={5} required maxLength={900} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy} disabled={!count}><Send className="h-4 w-4" /> Send SMS</Button></div>
      </form>
    </Modal>
  );
}
