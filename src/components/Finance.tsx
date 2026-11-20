import { Trash2 } from 'lucide-react';
import { COLLECTION_LINES, lineBalances, remitLines, type RemitSettings } from '../lib/collections';
import { money } from '../lib/format';
import type { Collection, Expense } from '../lib/types';
import { Input, Select, cx } from './ui';

/** Collected − 30% − expenses = left, for every offering of one service. */
export function LineBalanceTable({ c, remit }: { c: Pick<Collection, 'lines' | 'expenses' | 'remitLines'>; remit: RemitSettings }) {
  const rows = lineBalances(c, remit);
  if (!rows.length) return null;
  const tot = rows.reduce((t, r) => ({ collected: t.collected + r.collected, remit: t.remit + r.remit, expenses: t.expenses + r.expenses, left: t.left + r.left }), { collected: 0, remit: 0, expenses: 0, left: 0 });
  const n = (v: number) => (v ? v.toLocaleString('en-GH', { minimumFractionDigits: 2 }) : '—');
  return (
    <div className="overflow-x-auto rounded-xl border border-stone-200">
      <table className="w-full text-sm">
        <thead><tr className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
          {['Offering', 'Collected', `${remit.label || `${remit.rate}%`} taken`, 'Expenses taken', 'Left'].map((h, i) => <th key={h} className={cx('px-3 py-2 font-medium', i > 0 && 'text-right')}>{h}</th>)}
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-stone-100">
              <td className="px-3 py-2">{r.label}</td>
              <td className="px-3 py-2 text-right tabular-nums">{n(r.collected)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-amber-700">{n(r.remit)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-red-600">{n(r.expenses)}</td>
              <td className={cx('px-3 py-2 text-right font-semibold tabular-nums', r.left < 0 ? 'text-red-600' : 'text-emerald-700')}>{r.left.toLocaleString('en-GH', { minimumFractionDigits: 2 })}</td>
            </tr>
          ))}
          <tr className="border-t border-stone-200 bg-stone-50 font-semibold">
            <td className="px-3 py-2">Total</td>
            {[tot.collected, tot.remit, tot.expenses, tot.left].map((v, i) => <td key={i} className="px-3 py-2 text-right tabular-nums">{v.toLocaleString('en-GH', { minimumFractionDigits: 2 })}</td>)}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Choose which offerings the 30% is taken from (e.g. only Kingdom offering on Sunday). */
export function RemitChooser({ c, remit, onChange }: { c: Pick<Collection, 'lines' | 'remitLines'>; remit: RemitSettings; onChange: (lines: string[]) => void }) {
  const chosen = remitLines(c, remit);
  const lines = COLLECTION_LINES.filter((l) => Number(c.lines?.[l.key]) || chosen.includes(l.key));
  if (!lines.length) return <p className="text-xs text-stone-500">Enter the collections first.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {lines.map((l) => {
        const on = chosen.includes(l.key);
        return (
          <button type="button" key={l.key} onClick={() => onChange(on ? chosen.filter((x) => x !== l.key) : [...chosen, l.key])}
            className={cx('rounded-full border px-3 py-1.5 text-sm', on ? 'border-amber-600 bg-amber-500 text-white' : 'border-stone-300 text-stone-600')}>
            {l.label}{on && Number(c.lines?.[l.key]) ? ` · ${money(Math.round(Number(c.lines[l.key]) * remit.rate) / 100)}` : ''}
          </button>
        );
      })}
    </div>
  );
}

/** One expense: what, from which offering, how much, details. Shows what is left in the chosen offering. */
export function ExpenseEditor({ e, c, remit, onChange, onRemove }: { e: Expense; c: Pick<Collection, 'lines' | 'expenses' | 'remitLines'>; remit: RemitSettings; onChange: (e: Expense) => void; onRemove?: () => void }) {
  const left = lineBalances(c, remit, e);
  const sources = COLLECTION_LINES.filter((l) => Number(c.lines?.[l.key]) || l.key === e.source);
  const avail = left.find((x) => x.key === e.source)?.left;
  const over = e.source && avail !== undefined && (Number(e.amount) || 0) > avail + 0.001;
  return (
    <div className={cx('space-y-2 rounded-xl border p-3', over ? 'border-red-300 bg-red-50/50' : 'border-stone-200')}>
      <div className="grid gap-2 sm:grid-cols-[1fr_13rem_8rem_2rem]">
        <Input value={e.item} onChange={(x) => onChange({ ...e, item: x.target.value })} placeholder="What was paid for, e.g. Fuel for generator" aria-label="Expense" />
        <Select value={e.source ?? ''} onChange={(x) => onChange({ ...e, source: x.target.value })} aria-label="Taken from" required>
          <option value="">Taken from which offering?</option>
          {sources.map((l) => { const a = left.find((x) => x.key === l.key)?.left ?? 0; return <option key={l.key} value={l.key}>{l.label} (GH₵{a.toFixed(2)} left)</option>; })}
        </Select>
        <Input type="number" min={0} step="0.01" value={e.amount || ''} onChange={(x) => onChange({ ...e, amount: Number(x.target.value) })} placeholder="Amount" aria-label="Amount" />
        {onRemove ? <button type="button" onClick={onRemove} className="text-stone-400 hover:text-red-600" aria-label="Remove expense"><Trash2 className="h-4 w-4" /></button> : <span />}
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Input value={e.details ?? ''} onChange={(x) => onChange({ ...e, details: x.target.value })} placeholder="Details (what exactly, receipt no.)" aria-label="Details" />
        <Input value={e.paidTo ?? ''} onChange={(x) => onChange({ ...e, paidTo: x.target.value })} placeholder="Paid to" aria-label="Paid to" />
        <Input value={e.approvedBy ?? ''} onChange={(x) => onChange({ ...e, approvedBy: x.target.value })} placeholder="Approved by" aria-label="Approved by" />
      </div>
      {over && <p className="text-xs text-red-700">Only GH₵{avail!.toFixed(2)} is left in {COLLECTION_LINES.find((l) => l.key === e.source)?.label} after the {remit.label || `${remit.rate}%`} and other expenses.</p>}
    </div>
  );
}

/** Problems that stop an expense from being saved. */
export function expenseProblems(c: Pick<Collection, 'lines' | 'expenses' | 'remitLines'>, remit: RemitSettings): string | null {
  for (const e of c.expenses ?? []) {
    if (!e.item.trim() && !e.amount) continue;
    if (!e.item.trim()) return 'Say what each expense was for.';
    if (!(Number(e.amount) > 0)) return `Enter the amount for “${e.item}”.`;
    if (!e.source) return `Choose which offering “${e.item}” was taken from.`;
  }
  const neg = lineBalances(c, remit).find((r) => r.key && r.left < -0.001);
  return neg ? `${neg.label} does not have enough money: it would be GH₵${neg.left.toFixed(2)}. Take the expense from another offering.` : null;
}
