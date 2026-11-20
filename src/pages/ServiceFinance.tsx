import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { ChevronLeft, ChevronRight, Download, Landmark, Plus, Printer, Settings2, Trash2 } from 'lucide-react';
import { Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Spinner, Stat, Textarea, cx, errorText, useToast } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { ALL, useData } from '../context/DataContext';
import { COLLECTION_LINES, DEFAULT_REMIT, GROUP_LABEL, summarize, weekOf, type RemitSettings, type ReportGroup } from '../lib/collections';
import { downloadExcel } from '../lib/csv';
import { db } from '../lib/firebase';
import { SERVICE_TYPES, isoDate, money, prettyDate, today } from '../lib/format';
import { can, isGlobal } from '../lib/roles';
import { useSettingsDoc } from '../lib/settings';
import type { Collection } from '../lib/types';

const shift = (iso: string, days: number) => { const [y, m, d] = iso.split('-').map(Number); return isoDate(new Date(y, m - 1, d + days)); };

export default function ServiceFinance() {
  const { profile } = useAuth();
  const { scope, branchName } = useData();
  const remit = useSettingsDoc<RemitSettings>('remittance', DEFAULT_REMIT);
  const canWrite = can(profile?.role, 'giving.write');
  const [anchor, setAnchor] = useState(today());
  const [mode, setMode] = useState<'week' | 'month'>('week');
  const [items, setItems] = useState<Collection[] | null>(null);
  const [editing, setEditing] = useState<Collection | 'new' | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const branch = profile?.branchId ?? scope;

  const range = mode === 'week' ? weekOf(anchor) : { start: `${anchor.slice(0, 7)}-01`, end: isoDate(new Date(Number(anchor.slice(0, 4)), Number(anchor.slice(5, 7)), 0)) };
  useEffect(() => {
    const base = collection(db, 'collections');
    const q = branch === ALL ? query(base, where('date', '>=', range.start), where('date', '<=', range.end)) : query(base, where('branchId', '==', branch));
    return onSnapshot(q, (s) => setItems(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Collection).filter((c) => c.date >= range.start && c.date <= range.end).sort((a, b) => a.date.localeCompare(b.date))), (e) => { console.error(e); setItems([]); });
  }, [branch, range.start, range.end]);

  const rows = useMemo(() => (items ?? []).map((c) => ({ c, s: summarize(c, remit) })), [items, remit]);
  const total = rows.reduce((t, { s }) => ({
    offering: t.offering + s.offering, seed: t.seed + s.seed, tithe: t.tithe + s.tithe, projects: t.projects + s.projects, pledges: t.pledges + s.pledges,
    income: t.income + s.income, expenses: t.expenses + s.expenses, remit: t.remit + s.remit, balance: t.balance + s.balance,
  }), { offering: 0, seed: 0, tithe: 0, projects: 0, pledges: 0, income: 0, expenses: 0, remit: 0, balance: 0 });
  const label = mode === 'week' ? `Week of ${prettyDate(range.start)} – ${prettyDate(range.end)}` : new Date(`${anchor.slice(0, 7)}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const remitLabel = `${remit.label || `${remit.rate}%`} (${remit.rate}% of ${remit.basis.map((b) => GROUP_LABEL[b].toLowerCase()).join(' + ')})`;

  function exportXlsx() {
    downloadExcel(`togg-service-finance-${range.start}.xlsx`, [{
      name: mode === 'week' ? 'Weekly report' : 'Monthly report',
      rows: [...rows.map(({ c, s }) => ({
        Date: c.date, Service: c.title || c.serviceType, Branch: branchName(c.branchId), Offering: s.offering, Seed: s.seed, Tithe: s.tithe,
        Projects: s.projects, Pledges: s.pledges, 'Total income': s.income, Expenses: s.expenses, [remitLabel]: s.remit, Balance: s.balance,
      })), { Date: '', Service: 'TOTAL', Branch: '', Offering: total.offering, Seed: total.seed, Tithe: total.tithe, Projects: total.projects, Pledges: total.pledges, 'Total income': total.income, Expenses: total.expenses, [remitLabel]: total.remit, Balance: total.balance }],
    }, {
      name: 'Details',
      rows: rows.flatMap(({ c }) => [
        ...COLLECTION_LINES.filter((l) => c.lines?.[l.key]).map((l) => ({ Date: c.date, Service: c.title || c.serviceType, Item: l.label, Type: 'Income', Amount: c.lines[l.key] })),
        ...(c.expenses ?? []).map((e) => ({ Date: c.date, Service: c.title || c.serviceType, Item: e.item, Type: 'Expense', Amount: e.amount })),
      ]),
    }]);
  }

  return (
    <div>
      <PageHeader title="Service finance" subtitle={`Money counted at each church service (collections) · ${branch === ALL ? 'all branches' : branchName(branch)}`}
        actions={<>
          {isGlobal(profile?.role) && <Button variant="outline" onClick={() => setSettingsOpen(true)}><Settings2 className="h-4 w-4" /> {remit.rate}% settings</Button>}
          <Button variant="outline" onClick={exportXlsx}><Download className="h-4 w-4" /> Excel</Button>
          <Button variant="outline" onClick={() => window.print()} className="print:hidden"><Printer className="h-4 w-4" /> Print</Button>
          {canWrite && <Button variant="gold" onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> Record service collection</Button>}
        </>} />
      <Card className="mb-6 flex flex-wrap items-center gap-2 p-3 print:hidden">
        <div className="flex rounded-xl border border-stone-200 p-1">
          {(['week', 'month'] as const).map((m) => <button key={m} onClick={() => setMode(m)} className={cx('rounded-lg px-4 py-1.5 text-sm', mode === m ? 'bg-royal-800 text-white' : 'text-stone-600')}>{m === 'week' ? 'Weekly' : 'Monthly'}</button>)}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setAnchor(mode === 'week' ? shift(anchor, -7) : isoDate(new Date(Number(anchor.slice(0, 4)), Number(anchor.slice(5, 7)) - 2, 1)))} aria-label="Previous"><ChevronLeft className="h-4 w-4" /></Button>
        <Input type="date" value={anchor} onChange={(e) => e.target.value && setAnchor(e.target.value)} className="!w-44 !py-2" />
        <Button variant="ghost" size="sm" onClick={() => setAnchor(mode === 'week' ? shift(anchor, 7) : isoDate(new Date(Number(anchor.slice(0, 4)), Number(anchor.slice(5, 7)), 1)))} aria-label="Next"><ChevronRight className="h-4 w-4" /></Button>
        <span className="ml-2 text-sm font-medium text-stone-700">{label}</span>
      </Card>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total income" value={money(total.income)} icon={<Landmark className="h-4 w-4" />} sub={`${rows.length} service(s)`} />
        <Stat label="Expenses" value={money(total.expenses)} />
        <Stat label={remitLabel} value={money(total.remit)} />
        <Stat label="Balance" value={money(total.balance)} sub="Income − expenses − remittance" />
      </div>
      <Card>
        <div className="border-b border-stone-100 px-5 py-3"><h2 className="font-semibold text-stone-900">{mode === 'week' ? 'Weekly' : 'Monthly'} financial report — {label}</h2></div>
        {!items ? <Spinner /> : rows.length === 0 ? <Empty icon={<Landmark />} title="No collections recorded for this period">{canWrite && 'After each service, use “Record service collection” to enter what was counted.'}</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-stone-100 text-left text-xs uppercase tracking-wide text-stone-500">
                {['Service', 'Offering', 'Seed', 'Tithe', 'Projects', 'Pledges', 'Total', 'Expenses', remit.label || `${remit.rate}%`, 'Balance'].map((h, i) => <th key={h} className={cx('px-3 py-3 font-medium', i ? 'text-right' : '')}>{h}</th>)}
              </tr></thead>
              <tbody>
                {rows.map(({ c, s }) => (
                  <tr key={c.id} className="cursor-pointer border-b border-stone-50 hover:bg-stone-50/70" onClick={() => canWrite && setEditing(c)}>
                    <td className="px-3 py-3"><div className="font-medium text-stone-900">{c.title || c.serviceType}</div><div className="text-xs text-stone-500">{prettyDate(c.date)}{branch === ALL && ` · ${branchName(c.branchId)}`}</div></td>
                    {[s.offering, s.seed, s.tithe, s.projects, s.pledges, s.income, s.expenses, s.remit, s.balance].map((v, i) => <td key={i} className={cx('px-3 py-3 text-right tabular-nums', i === 5 && 'font-semibold', i === 6 && 'text-red-600', i === 8 && 'font-semibold text-emerald-700')}>{v ? v.toLocaleString('en-GH', { minimumFractionDigits: 2 }) : '—'}</td>)}
                  </tr>
                ))}
                <tr className="bg-royal-950 text-white">
                  <td className="px-3 py-3 font-semibold">TOTAL</td>
                  {[total.offering, total.seed, total.tithe, total.projects, total.pledges, total.income, total.expenses, total.remit, total.balance].map((v, i) => <td key={i} className="px-3 py-3 text-right font-semibold tabular-nums">{v.toLocaleString('en-GH', { minimumFractionDigits: 2 })}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="mt-3 text-xs text-stone-500">This page is for collections counted at services. Individual tithes and gifts are recorded under Tithes and Giving &amp; offerings.</p>
      {editing && <CollectionForm item={editing === 'new' ? null : editing} remit={remit} onClose={() => setEditing(null)} />}
      {settingsOpen && <RemitForm s={remit} onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

function CollectionForm({ item, remit, onClose }: { item: Collection | null; remit: RemitSettings; onClose: () => void }) {
  const { profile } = useAuth();
  const { branches, scope } = useData();
  const toast = useToast();
  const [d, setD] = useState<Omit<Collection, 'id'>>(() => item ?? {
    branchId: profile?.branchId ?? (scope !== ALL ? scope : branches[0]?.id ?? ''), date: today(), serviceType: SERVICE_TYPES[0], title: '',
    lines: {}, expenses: [], countedBy: '', notes: '',
  });
  const [busy, setBusy] = useState(false);
  const s = summarize(d, remit);
  const sunday = d.serviceType === 'Sunday Service';
  const lines = COLLECTION_LINES.filter((l) => sunday || !l.sunday || d.lines[l.key]);
  const setLine = (k: string, v: string) => setD({ ...d, lines: { ...d.lines, [k]: Number(v) || 0 } });

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!d.branchId) { toast('err', 'Choose the branch.'); return; }
    setBusy(true);
    try {
      const data = { ...d, expenses: d.expenses.filter((x) => x.item.trim() || x.amount).map((x) => ({ item: x.item.trim(), amount: Number(x.amount) || 0 })), recordedBy: profile?.uid ?? '', updatedAt: serverTimestamp() };
      if (item) await updateDoc(doc(db, 'collections', item.id), data); else await addDoc(collection(db, 'collections'), { ...data, createdAt: serverTimestamp() });
      toast('ok', 'Service collection saved.'); onClose();
    } catch (err) { toast('err', errorText(err)); setBusy(false); }
  }
  async function remove() {
    if (!item || !confirm('Delete this service collection?')) return;
    try { await deleteDoc(doc(db, 'collections', item.id)); onClose(); } catch (err) { toast('err', errorText(err)); }
  }
  return (
    <Modal open onClose={onClose} title={item ? 'Edit service collection' : 'Record service collection'} wide>
      <form onSubmit={save} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Date"><Input type="date" required value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} /></Field>
          <Field label="Service"><Select value={d.serviceType} onChange={(e) => setD({ ...d, serviceType: e.target.value })}>{SERVICE_TYPES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
          <Field label="Branch"><Select required value={d.branchId} disabled={!!profile?.branchId} onChange={(e) => setD({ ...d, branchId: e.target.value })}><option value="">Choose…</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
        </div>
        <Field label="Title (optional)"><Input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="e.g. Thanksgiving Sunday" /></Field>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-stone-800">Collections (GH₵)</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {lines.map((l) => <Field key={l.key} label={l.label}><Input type="number" min={0} step="0.01" inputMode="decimal" value={d.lines[l.key] || ''} onChange={(e) => setLine(l.key, e.target.value)} /></Field>)}
          </div>
          {!sunday && <p className="mt-1 text-xs text-stone-500">Love / kingdom offering, special seed, projects offering, tithe and pledges appear for Sunday Service.</p>}
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-stone-800">Expenses paid from this collection</h3>
          <div className="space-y-2">
            {d.expenses.map((x, i) => (
              <div key={i} className="grid grid-cols-[1fr_9rem_2rem] gap-2">
                <Input value={x.item} onChange={(e) => setD({ ...d, expenses: d.expenses.map((y, j) => (j === i ? { ...y, item: e.target.value } : y)) })} placeholder="e.g. Fuel for generator" />
                <Input type="number" min={0} step="0.01" value={x.amount || ''} onChange={(e) => setD({ ...d, expenses: d.expenses.map((y, j) => (j === i ? { ...y, amount: Number(e.target.value) } : y)) })} />
                <button type="button" onClick={() => setD({ ...d, expenses: d.expenses.filter((_, j) => j !== i) })} className="text-stone-400 hover:text-red-600" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => setD({ ...d, expenses: [...d.expenses, { item: '', amount: 0 }] })}><Plus className="h-4 w-4" /> Add expense</Button>
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-stone-50 p-4 text-sm sm:grid-cols-4">
          <div>Total income<br /><b>{money(s.income)}</b></div><div>Expenses<br /><b className="text-red-600">{money(s.expenses)}</b></div>
          <div>{remit.label || `${remit.rate}%`}<br /><b>{money(s.remit)}</b></div><div>Balance<br /><b className="text-emerald-700">{money(s.balance)}</b></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Counted by"><Input value={d.countedBy} onChange={(e) => setD({ ...d, countedBy: e.target.value })} placeholder="Names of the counters" /></Field>
          <Field label="Notes"><Textarea rows={1} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} /></Field>
        </div>
        <div className="flex items-center justify-between border-t border-stone-100 pt-4">
          {item ? <Button type="button" variant="ghost" className="text-red-600" onClick={remove}><Trash2 className="h-4 w-4" /> Delete</Button> : <span />}
          <div className="flex gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy}>Save</Button></div>
        </div>
      </form>
    </Modal>
  );
}

function RemitForm({ s, onClose }: { s: RemitSettings; onClose: () => void }) {
  const toast = useToast();
  const [d, setD] = useState(s);
  async function save(e: FormEvent) {
    e.preventDefault();
    try { await setDoc(doc(db, 'settings', 'remittance'), { ...d, rate: Number(d.rate) || 0 }); toast('ok', 'Saved.'); onClose(); } catch (err) { toast('err', errorText(err)); }
  }
  return (
    <Modal open onClose={onClose} title="Remittance (30%) settings">
      <form onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Percentage"><Input type="number" min={0} max={100} step="0.5" value={d.rate} onChange={(e) => setD({ ...d, rate: Number(e.target.value) })} /></Field>
          <Field label="Column name"><Input value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} placeholder="30%" /></Field>
        </div>
        <div>
          <span className="mb-2 block text-sm font-medium text-stone-700">Worked out on</span>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(GROUP_LABEL) as ReportGroup[]).map((g) => {
              const on = d.basis.includes(g);
              return <button type="button" key={g} onClick={() => setD({ ...d, basis: on ? d.basis.filter((x) => x !== g) : [...d.basis, g] })} className={cx('rounded-full border px-3 py-1.5 text-sm', on ? 'border-royal-600 bg-royal-600 text-white' : 'border-stone-300 text-stone-600')}>{GROUP_LABEL[g]}</button>;
            })}
          </div>
        </div>
        <p className="text-xs text-stone-500">Balance = total income − expenses − this amount.</p>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit">Save</Button></div>
      </form>
    </Modal>
  );
}
