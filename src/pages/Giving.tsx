import { useProjects } from './Projects';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { collection, doc, increment, onSnapshot, query, serverTimestamp, where, writeBatch } from 'firebase/firestore';
import { ChevronLeft, ChevronRight, Download, HandCoins, Plus, Smartphone, Trash2, Wallet } from 'lucide-react';
import { Avatar, Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Spinner, Stat, Textarea, errorText, useToast } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { ALL, useData } from '../context/DataContext';
import { downloadCsv } from '../lib/csv';
import { db } from '../lib/firebase';
import { GIVING_TYPES, MONTHS, PAYMENT_METHODS, labelOf, money, monthRange, prettyDate, shortDate, today } from '../lib/format';
import { can } from '../lib/roles';
import type { Gift, GivingType, OnlineGift, PaymentMethod } from '../lib/types';

export function useGifts(scope: string, start: string, end: string) {
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    const base = collection(db, 'giving');
    const q = scope === ALL ? query(base, where('date', '>=', start), where('date', '<=', end)) : query(base, where('branchId', '==', scope));
    return onSnapshot(q, (s) => {
      const list = s.docs.map((d) => ({ id: d.id, ...d.data() }) as Gift).filter((g) => g.date >= start && g.date <= end);
      list.sort((a, b) => b.date.localeCompare(a.date));
      setGifts(list);
      setLoading(false);
    }, (e) => { console.error('giving', e); setLoading(false); });
  }, [scope, start, end]);
  return { gifts, loading };
}

const BAR_COLORS = ['bg-royal-600', 'bg-gold-400', 'bg-emerald-500', 'bg-sky-500', 'bg-rose-400', 'bg-violet-400', 'bg-amber-600', 'bg-teal-500', 'bg-stone-400'];

export default function Giving() {
  const { profile } = useAuth();
  const { scope, branchName, branches } = useData();
  const toast = useToast();
  const canWrite = can(profile?.role, 'giving.write');
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [type, setType] = useState<'' | GivingType>('');
  const [open, setOpen] = useState(false);

  const { start, end } = monthRange(year, month);
  const prev = monthRange(month === 0 ? year - 1 : year, month === 0 ? 11 : month - 1);
  const { gifts, loading } = useGifts(scope, start, end);
  const { gifts: prevGifts } = useGifts(scope, prev.start, prev.end);

  const shown = type ? gifts.filter((g) => g.type === type) : gifts;
  const total = gifts.reduce((t, g) => t + g.amount, 0);
  const prevTotal = prevGifts.reduce((t, g) => t + g.amount, 0);
  const sumBy = (f: (g: Gift) => boolean) => gifts.filter(f).reduce((t, g) => t + g.amount, 0);
  const change = prevTotal ? Math.round(((total - prevTotal) / prevTotal) * 100) : null;

  const byType = useMemo(() => {
    const m = new Map<GivingType, number>();
    gifts.forEach((g) => m.set(g.type, (m.get(g.type) || 0) + g.amount));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [gifts]);

  const byBranch = useMemo(() => {
    const m = new Map<string, number>();
    gifts.forEach((g) => m.set(g.branchId, (m.get(g.branchId) || 0) + g.amount));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [gifts]);

  function step(d: number) {
    const dt = new Date(year, month + d, 1);
    setYear(dt.getFullYear()); setMonth(dt.getMonth());
  }

  async function remove(g: Gift) {
    if (!confirm(`Delete this ${money(g.amount)} record?`)) return;
    try {
      const b = writeBatch(db);
      b.delete(doc(db, 'giving', g.id));
      if (g.projectId) b.update(doc(db, 'projects', g.projectId), { raised: increment(-g.amount), donors: increment(-1) });
      await b.commit();
      toast('ok', 'Record deleted.');
    }
    catch (e) { toast('err', errorText(e)); }
  }

  function exportCsv() {
    downloadCsv(`togg-giving-${year}-${String(month + 1).padStart(2, '0')}.csv`, shown.map((g) => ({
      Date: g.date, Name: g.memberName || 'Anonymous / general', Type: labelOf(GIVING_TYPES, g.type),
      Method: labelOf(PAYMENT_METHODS, g.method), Amount: g.amount.toFixed(2), Branch: branchName(g.branchId),
      Reference: g.reference, Note: g.note,
    })));
  }

  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 4 + i);

  return (
    <div>
      <PageHeader
        title="Giving"
        subtitle={`${scope === ALL ? 'All branches' : branchName(scope)} · tithes, offerings and funds in GH₵`}
        actions={
          <>
            <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4" /> Export</Button>
            {canWrite && <Button variant="gold" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Record giving</Button>}
          </>
        }
      />

      <Card className="mb-6 flex flex-wrap items-center gap-2 p-3">
        <Button variant="ghost" size="sm" onClick={() => step(-1)} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></Button>
        <Select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="!w-36 !py-2">
          {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
        </Select>
        <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="!w-28 !py-2">
          {years.map((y) => <option key={y}>{y}</option>)}
        </Select>
        <Button variant="ghost" size="sm" onClick={() => step(1)} aria-label="Next month"><ChevronRight className="h-4 w-4" /></Button>
        <div className="ml-auto flex flex-wrap gap-1">
          {[{ value: '', label: 'Everything' }, ...GIVING_TYPES.slice(0, 3)].map((t) => (
            <button key={t.value} onClick={() => setType(t.value as GivingType | '')}
              className={`rounded-lg px-3 py-1.5 text-sm ${type === t.value ? 'bg-royal-800 text-white' : 'text-stone-600 hover:bg-stone-100'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </Card>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={`${MONTHS[month]} total`} value={money(total)} icon={<HandCoins className="h-4 w-4" />}
          sub={change !== null && <span className={change >= 0 ? 'text-emerald-600' : 'text-red-600'}>{change >= 0 ? '▲' : '▼'} {Math.abs(change)}% vs last month</span>} />
        <Stat label="Tithes" value={money(sumBy((g) => g.type === 'tithe'))} sub={total ? `${Math.round((sumBy((g) => g.type === 'tithe') / total) * 100)}% of giving` : undefined} />
        <Stat label="Offerings" value={money(sumBy((g) => g.type === 'offering'))} sub={total ? `${Math.round((sumBy((g) => g.type === 'offering') / total) * 100)}% of giving` : undefined} />
        <Stat label="Mobile Money" value={money(sumBy((g) => g.method === 'momo'))} icon={<Smartphone className="h-4 w-4" />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
            <div>
              <h2 className="font-semibold text-stone-900">Giving activity</h2>
              <p className="text-xs text-stone-500">{MONTHS[month]} {year} · {shown.length} records</p>
            </div>
          </div>
          {loading ? <Spinner /> : shown.length === 0 ? (
            <Empty icon={<Wallet />} title="Nothing recorded for this month">{canWrite && 'Use “Record giving” to add tithes, offerings and other funds.'}</Empty>
          ) : (
            <ul className="divide-y divide-stone-100">
              {shown.map((g) => (
                <li key={g.id} className="flex items-center gap-3 px-5 py-3">
                  <Avatar text={g.memberName ? g.memberName.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase() : '₵'} className={g.memberName ? '' : 'bg-gold-100 text-gold-700'} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-stone-900">{g.memberName || labelOf(GIVING_TYPES, g.type)}</div>
                    <div className="truncate text-xs text-stone-500">
                      {labelOf(PAYMENT_METHODS, g.method)} · {labelOf(GIVING_TYPES, g.type)}{scope === ALL && ` · ${branchName(g.branchId)}`}{g.reference && ` · ${g.reference}`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-emerald-700">{money(g.amount)}</div>
                    <div className="text-[11px] text-stone-500">{shortDate(g.date)}</div>
                  </div>
                  {canWrite && (
                    <button onClick={() => remove(g)} className="rounded-lg p-1.5 text-stone-300 hover:bg-stone-100 hover:text-red-600" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="font-semibold text-stone-900">By fund</h2>
            <p className="mb-4 text-xs text-stone-500">{MONTHS[month]} · {money(total)}</p>
            {byType.length === 0 ? <p className="text-sm text-stone-400">No data yet.</p> : (
              <>
                <div className="mb-4 flex h-3 overflow-hidden rounded-full bg-stone-100">
                  {byType.map(([t, v], i) => <div key={t} className={BAR_COLORS[i % BAR_COLORS.length]} style={{ width: `${(v / total) * 100}%` }} />)}
                </div>
                <ul className="space-y-2 text-sm">
                  {byType.map(([t, v], i) => (
                    <li key={t} className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${BAR_COLORS[i % BAR_COLORS.length]}`} />
                      <span className="flex-1 text-stone-600">{labelOf(GIVING_TYPES, t)}</span>
                      <span className="font-medium text-stone-900">{money(v)}</span>
                      <span className="w-10 text-right text-xs text-stone-400">{Math.round((v / total) * 100)}%</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
          {scope === ALL && branches.length > 1 && (
            <Card className="p-5">
              <h2 className="mb-4 font-semibold text-stone-900">By branch</h2>
              <ul className="space-y-3 text-sm">
                {byBranch.map(([b, v]) => (
                  <li key={b}>
                    <div className="mb-1 flex justify-between"><span className="text-stone-600">{branchName(b)}</span><span className="font-medium">{money(v)}</span></div>
                    <div className="h-2 rounded-full bg-stone-100"><div className="h-2 rounded-full bg-royal-600" style={{ width: `${(v / (byBranch[0]?.[1] || 1)) * 100}%` }} /></div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <OnlinePayments />
      {open && <RecordGift onClose={() => setOpen(false)} />}
    </div>
  );
}

export function RecordGift({ onClose, preset }: { onClose: () => void; preset?: { type?: GivingType; memberId?: string; memberName?: string; branchId?: string; projectId?: string; forMonths?: string[]; amount?: number } }) {
  const { profile } = useAuth();
  const { branches, members, scope, branchName } = useData();
  const toast = useToast();
  const [branchId, setBranchId] = useState(profile?.branchId ?? preset?.branchId ?? (scope !== ALL ? scope : branches[0]?.id ?? ''));
  const [date, setDate] = useState(today());
  const [type, setType] = useState<GivingType>(preset?.type ?? 'tithe');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [amount, setAmount] = useState(preset?.amount ? String(preset.amount) : '');
  const projects = useProjects();
  const [projectId, setProjectId] = useState(preset?.projectId ?? '');
  const [who, setWho] = useState(preset?.memberName ?? '');
  const [memberId, setMemberId] = useState<string | null>(preset?.memberId ?? null);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [another, setAnother] = useState(false);

  const suggestions = useMemo(() => {
    const n = who.trim().toLowerCase();
    if (!n || memberId) return [];
    // Branch-locked users only see their branch; pastors search every loaded branch.
    return members
      .filter((m) => (!profile?.branchId || m.branchId === branchId) && `${m.firstName} ${m.lastName} ${m.phone}`.toLowerCase().includes(n))
      .slice(0, 6);
  }, [who, memberId, members, branchId, profile?.branchId]);

  async function save(e: FormEvent) {
    e.preventDefault();
    const amt = Number(amount);
    if (!(amt > 0)) { toast('err', 'Enter an amount greater than zero.'); return; }
    if (type === 'project' && !projectId) { toast('err', 'Choose the project.'); return; }
    setBusy(true);
    try {
      const value = Math.round(amt * 100) / 100;
      const b = writeBatch(db);
      b.set(doc(collection(db, 'giving')), {
        branchId, date, type, method, amount: value,
        memberId, memberName: who.trim(), reference: reference.trim(), note: note.trim(),
        projectId: type === 'project' ? projectId : null, forMonths: type === 'welfare' ? preset?.forMonths ?? [date.slice(0, 7)] : [],
        createdBy: profile?.uid, createdAt: serverTimestamp(),
      });
      if (type === 'project') b.update(doc(db, 'projects', projectId), { raised: increment(value), donors: increment(1) });
      await b.commit();
      toast('ok', `${money(amt)} recorded.`);
      if (another) {
        setAmount(''); setWho(''); setMemberId(null); setReference(''); setNote('');
      } else onClose();
    } catch (err) {
      toast('err', errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={preset?.type === 'tithe' ? 'Record tithe' : 'Record giving'}>
      <form onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Type">
            <Select value={type} onChange={(e) => setType(e.target.value as GivingType)}>{GIVING_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</Select>
          </Field>
          <Field label="Amount (GH₵)"><Input required inputMode="decimal" type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></Field>
        </div>
        {type === 'project' && (
          <Field label="Project">
            <Select required value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Choose…</option>
              {(projects ?? []).filter((x) => x.status !== 'completed' || x.id === projectId).map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
            </Select>
          </Field>
        )}
        {type === 'welfare' && preset?.forMonths && <p className="-mt-2 text-xs text-stone-500">For: {preset.forMonths.join(', ')}</p>}
        <Field label="Given by" hint={type === 'offering' ? 'Leave empty for a general service offering.' : 'Start typing to pick a member, or type any name.'}>
          <div className="relative">
            <Input value={who} onChange={(e) => { setWho(e.target.value); setMemberId(null); }} placeholder="Name (optional)" />
            {memberId && <span className="absolute right-3 top-1/2 -translate-y-1/2"><Badge color="green">Member</Badge></span>}
            {suggestions.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-stone-200 bg-white shadow-lg">
                {suggestions.map((m) => (
                  <li key={m.id}>
                    <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-royal-50" onClick={() => { setWho(`${m.firstName} ${m.lastName}`); setMemberId(m.id); setBranchId(m.branchId); }}>
                      {m.firstName} {m.lastName} <span className="text-stone-400">{m.phone}{!profile?.branchId && ` · ${branchName(m.branchId)}`}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Method">
            <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>{PAYMENT_METHODS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</Select>
          </Field>
          <Field label="Date"><Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
        {method !== 'cash' && <Field label="Reference / transaction ID"><Input value={reference} onChange={(e) => setReference(e.target.value)} /></Field>}
        <Field label="Branch">
          <Select required value={branchId} disabled={!!profile?.branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">Choose…</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
        <Field label="Note"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <p className="text-xs text-stone-500">Recorded for {prettyDate(date)}.</p>
        <div className="flex items-center justify-between pt-2">
          <label className="flex items-center gap-2 text-sm text-stone-600">
            <input type="checkbox" checked={another} onChange={(e) => setAnother(e.target.checked)} className="rounded border-stone-300 text-royal-700" />
            Record another after this
          </label>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Close</Button>
            <Button type="submit" loading={busy}>Save</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

/** Paystack payments from the public Give page (finance view). */
function OnlinePayments() {
  const { scope, branchName } = useData();
  const { profile } = useAuth();
  const [items, setItems] = useState<OnlineGift[] | null>(null);
  const branch = profile?.branchId ?? scope;
  useEffect(() => {
    const base = collection(db, 'onlineGifts');
    const q = branch === ALL ? query(base) : query(base, where('branchId', '==', branch));
    return onSnapshot(q, (s) => setItems(s.docs.map((d) => ({ id: d.id, ...d.data() }) as OnlineGift).sort((a, b) => (b.createdAt?.toDate().getTime() ?? 0) - (a.createdAt?.toDate().getTime() ?? 0)).slice(0, 30)), () => setItems([]));
  }, [branch]);
  if (!items || items.length === 0) return null;
  const color = { success: 'green', pending: 'gold', failed: 'red', abandoned: 'gray' } as const;
  return (
    <Card className="mt-6">
      <div className="border-b border-stone-100 px-5 py-3"><h2 className="font-semibold text-stone-900">Online payments (Paystack)</h2><p className="text-xs text-stone-500">Confirmed payments are added to the records above automatically.</p></div>
      <ul className="divide-y divide-stone-100">
        {items.map((g) => (
          <li key={g.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
            <div className="min-w-0 flex-1"><div className="truncate font-medium text-stone-900">{g.name || 'Giver'} · {g.purpose}</div><div className="truncate text-xs text-stone-500">{g.phone} · {g.id}{branch === ALL && ` · ${branchName(g.branchId)}`}{g.error && ` · ${g.error}`}</div></div>
            <span className="font-semibold">{money(g.amount)}</span>
            <Badge color={color[g.status]}>{g.status === 'pending' ? 'confirming…' : g.status}</Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}
