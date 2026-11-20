import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { Download, Plus, Receipt } from 'lucide-react';
import { ExpenseEditor, LineBalanceTable, expenseProblems } from '../components/Finance';
import { Button, Card, Empty, Field, Modal, PageHeader, Select, Spinner, Stat, cx, errorText, useToast } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { ALL, useData } from '../context/DataContext';
import { COLLECTION_LINES, DEFAULT_REMIT, lineBalances, lineLabel, summarize, type RemitSettings } from '../lib/collections';
import { downloadExcel } from '../lib/csv';
import { db } from '../lib/firebase';
import { monthKey, monthLabel, money, prettyDate, shiftMonth } from '../lib/format';
import { can } from '../lib/roles';
import { useSettingsDoc } from '../lib/settings';
import type { Collection, Expense } from '../lib/types';
import { cleanExpenses } from './ServiceFinance';

/** All expenses and offerings of the month, and where every expense was taken from. */
export default function Expenses() {
  const { profile } = useAuth();
  const { scope, branchName } = useData();
  const remit = useSettingsDoc<RemitSettings>('remittance', DEFAULT_REMIT);
  const canWrite = can(profile?.role, 'giving.write');
  const branch = profile?.branchId ?? scope;
  const [month, setMonth] = useState(monthKey());
  const [items, setItems] = useState<Collection[] | null>(null);
  const [source, setSource] = useState('');
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    const base = collection(db, 'collections');
    const q = branch === ALL ? query(base, where('date', '>=', `${month}-01`), where('date', '<=', `${month}-31`)) : query(base, where('branchId', '==', branch));
    return onSnapshot(q, (s) => setItems(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Collection).filter((c) => c.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date))), () => setItems([]));
  }, [branch, month]);

  const expenses = useMemo(() => (items ?? []).flatMap((c) => (c.expenses ?? []).map((e) => ({ c, e }))).filter((x) => !source || (x.e.source ?? '') === source), [items, source]);
  // Every offering across the month: collected, 30%, expenses, left.
  const offerings = useMemo(() => {
    const m = new Map<string, { label: string; collected: number; remit: number; expenses: number; left: number }>();
    (items ?? []).forEach((c) => lineBalances(c, remit).forEach((r) => {
      const t = m.get(r.key) ?? { label: r.label, collected: 0, remit: 0, expenses: 0, left: 0 };
      t.collected += r.collected; t.remit += r.remit; t.expenses += r.expenses; t.left += r.left; m.set(r.key, t);
    }));
    return [...m.entries()];
  }, [items, remit]);
  const totals = (items ?? []).reduce((t, c) => { const s = summarize(c, remit); return { income: t.income + s.income, remit: t.remit + s.remit, expenses: t.expenses + s.expenses, balance: t.balance + s.balance }; }, { income: 0, remit: 0, expenses: 0, balance: 0 });

  function exportXlsx() {
    downloadExcel(`togg-expenses-${month}.xlsx`, [
      { name: 'Expenses', rows: expenses.map(({ c, e }) => ({ Date: e.date || c.date, Service: c.title || c.serviceType, 'Service date': c.date, Branch: branchName(c.branchId), Expense: e.item, 'Taken from': lineLabel(e.source), Amount: e.amount, Details: e.details ?? '', 'Paid to': e.paidTo ?? '', 'Approved by': e.approvedBy ?? '' })) },
      { name: 'Offerings', rows: offerings.map(([, o]) => ({ Offering: o.label, Collected: o.collected, [remit.label || `${remit.rate}%`]: o.remit, Expenses: o.expenses, Left: o.left })) },
    ]);
  }

  return (
    <div>
      <PageHeader title="Expenses & offerings" subtitle={`${monthLabel(month)} · ${branch === ALL ? 'all branches' : branchName(branch)}`}
        actions={<>
          <Button variant="outline" onClick={exportXlsx}><Download className="h-4 w-4" /> Excel</Button>
          {canWrite && <Button variant="gold" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add expense</Button>}
        </>} />
      <Card className="mb-6 flex flex-wrap items-center gap-2 p-3">
        <Button variant="ghost" size="sm" onClick={() => setMonth(shiftMonth(month, -1))}>‹</Button>
        <span className="text-sm font-medium">{monthLabel(month)}</span>
        <Button variant="ghost" size="sm" onClick={() => setMonth(shiftMonth(month, 1))}>›</Button>
        <Select className="!w-auto" value={source} onChange={(e) => setSource(e.target.value)} aria-label="Taken from">
          <option value="">From every offering</option>
          {COLLECTION_LINES.map((l) => <option key={l.key} value={l.key}>Only from {l.label}</option>)}
        </Select>
      </Card>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Collected" value={money(totals.income)} />
        <Stat label={remit.label || `${remit.rate}%`} value={money(totals.remit)} />
        <Stat label="Expenses" value={money(totals.expenses)} icon={<Receipt className="h-4 w-4" />} sub={`${expenses.length} item(s)${source ? ` from ${lineLabel(source)}` : ''}`} />
        <Stat label="Left" value={money(totals.balance)} />
      </div>
      <Card className="mb-6">
        <div className="border-b border-stone-100 px-5 py-3"><h2 className="font-semibold text-stone-900">Expenses</h2></div>
        {!items ? <Spinner /> : expenses.length === 0 ? <Empty icon={<Receipt />} title="No expenses this month">{canWrite && 'Use “Add expense” and choose the service and offering the money came from.'}</Empty> : (
          <ul className="divide-y divide-stone-100">
            {expenses.map(({ c, e }, i) => (
              <li key={`${c.id}-${i}`}>
                <Link to={`/service-finance/${c.id}`} className="flex flex-wrap items-start gap-3 px-5 py-3 text-sm hover:bg-stone-50/70">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-stone-900">{e.item}</div>
                    <div className="text-xs text-stone-500">{prettyDate(e.date || c.date)} · from <b className="text-stone-700">{lineLabel(e.source)}</b> of {c.title || c.serviceType} ({prettyDate(c.date)}){branch === ALL && ` · ${branchName(c.branchId)}`}{e.paidTo && ` · paid to ${e.paidTo}`}</div>
                    {e.details && <div className="mt-0.5 text-xs text-stone-600">{e.details}</div>}
                  </div>
                  <span className="font-semibold text-red-600">{money(e.amount)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <div className="border-b border-stone-100 px-5 py-3"><h2 className="font-semibold text-stone-900">Offerings this month</h2><p className="text-xs text-stone-500">Collected − {remit.label || `${remit.rate}%`} − expenses taken from it = left</p></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-stone-500">{['Offering', 'Collected', remit.label || `${remit.rate}%`, 'Expenses', 'Left'].map((h, i) => <th key={h} className={cx('px-5 py-2 font-medium', i > 0 && 'text-right')}>{h}</th>)}</tr></thead>
            <tbody>
              {offerings.map(([k, o]) => (
                <tr key={k} className="cursor-pointer border-t border-stone-100 hover:bg-stone-50/70" onClick={() => setSource(k)}>
                  <td className="px-5 py-2">{o.label}</td>
                  {[o.collected, o.remit, o.expenses, o.left].map((v, i) => <td key={i} className={cx('px-5 py-2 text-right tabular-nums', i === 3 && (v < 0 ? 'font-semibold text-red-600' : 'font-semibold text-emerald-700'))}>{v.toLocaleString('en-GH', { minimumFractionDigits: 2 })}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {adding && items && <AddExpense services={items} remit={remit} onClose={() => setAdding(false)} />}
    </div>
  );
}

/** Add an expense to a service: choose the service, then the offering the money is taken from. */
function AddExpense({ services, remit, onClose }: { services: Collection[]; remit: RemitSettings; onClose: () => void }) {
  const toast = useToast();
  const { branchName, scope } = useData();
  const [serviceId, setServiceId] = useState(services[0]?.id ?? '');
  const [e, setE] = useState<Expense>({ item: '', amount: 0, source: '', details: '', paidTo: '', approvedBy: '' });
  const [busy, setBusy] = useState(false);
  const c = services.find((x) => x.id === serviceId);
  const withNew = c ? { ...c, expenses: [...(c.expenses ?? []), e] } : null;
  async function save(ev: FormEvent) {
    ev.preventDefault();
    if (!c || !withNew) return;
    const list = cleanExpenses(withNew.expenses, c.date);
    const problem = (!e.item.trim() || !(e.amount > 0)) ? 'Enter what it was for and the amount.' : expenseProblems({ ...c, expenses: list }, remit);
    if (problem) { toast('err', problem); return; }
    setBusy(true);
    try { await updateDoc(doc(db, 'collections', c.id), { expenses: list, updatedAt: serverTimestamp() }); toast('ok', 'Expense saved.'); onClose(); }
    catch (err) { toast('err', errorText(err)); setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title="Add expense" wide>
      {services.length === 0 ? <p className="text-sm text-stone-600">Record a service collection for this month first (Service finance). Every expense is taken from a service's offerings.</p> : (
        <form onSubmit={save} className="space-y-4">
          <Field label="Taken from the money of which service?">
            <Select value={serviceId} onChange={(x) => { setServiceId(x.target.value); setE({ ...e, source: '' }); }}>
              {services.map((s) => <option key={s.id} value={s.id}>{prettyDate(s.date)} · {s.title || s.serviceType}{scope === ALL ? ` · ${branchName(s.branchId)}` : ''}</option>)}
            </Select>
          </Field>
          {c && withNew && <>
            <ExpenseEditor e={e} c={withNew} remit={remit} onChange={setE} />
            <LineBalanceTable c={withNew} remit={remit} />
          </>}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy}>Save expense</Button></div>
        </form>
      )}
    </Modal>
  );
}
