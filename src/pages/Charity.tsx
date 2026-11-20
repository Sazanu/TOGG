import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Copy, Download, Gift as GiftIcon, HandHeart, HeartHandshake, MapPin, Plus, Trash2, Users } from 'lucide-react';
import { HowToPay } from '../components/HowToPay';
import { FullLogo } from '../components/Logo';
import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Spinner, Stat, Textarea, cx, errorText, useToast } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { downloadExcel } from '../lib/csv';
import { db } from '../lib/firebase';
import { money, monthKey, monthLabel, prettyDate, shiftMonth, today } from '../lib/format';
import { areaAllowed, isGlobal } from '../lib/roles';
import { publicBase, usePayments } from '../lib/settings';
import type { CharityEntry, CharityType } from '../lib/types';

export const NEEDS = ['Medical', 'School fees', 'Food', 'Rent / shelter', 'Funeral', 'Business support', 'Clothing', 'Other'];

/** Head / Associate Pastor, or the head of the Charity Foundation department. */
export function useCanCharity(): boolean {
  const { profile } = useAuth();
  const { departments } = useData();
  if (!profile || !areaAllowed(profile.role, 'charity')) return false;
  if (isGlobal(profile.role)) return true;
  return departments.some((d) => d.kind === 'charity' && (profile.departmentIds ?? []).includes(d.id));
}

const blank = (type: CharityType): Omit<CharityEntry, 'id'> => ({
  type, date: today(), name: '', phone: '', need: '', category: NEEDS[0], status: 'waiting', beneficiaryId: '', form: 'cash',
  amount: 0, items: '', donor: '', place: '', peopleReached: 0, notes: '',
});

export default function Charity() {
  const toast = useToast();
  const payments = usePayments();
  const [entries, setEntries] = useState<CharityEntry[] | null>(null);
  const [tab, setTab] = useState<'overview' | CharityType>('overview');
  const [editing, setEditing] = useState<Omit<CharityEntry, 'id'> & { id?: string } | null>(null);
  useEffect(() => onSnapshot(collection(db, 'charity'), (s) => setEntries(s.docs.map((d) => ({ ...blank('beneficiary'), id: d.id, ...d.data() }) as CharityEntry).sort((a, b) => b.date.localeCompare(a.date))), (e) => { console.error(e); setEntries([]); }), []);

  const by = (t: CharityType) => (entries ?? []).filter((e) => e.type === t);
  const beneficiaries = by('beneficiary');
  const benName = (id: string) => beneficiaries.find((b) => b.id === id)?.name ?? '—';
  const fundsIn = by('support').filter((s) => s.form === 'cash').reduce((t, s) => t + s.amount, 0);
  const cashOut = by('aid').filter((a) => a.form === 'cash').reduce((t, a) => t + a.amount, 0);
  const itemsValueIn = by('support').filter((s) => s.form === 'items').reduce((t, s) => t + s.amount, 0);
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(monthKey(), i - 5));
  const link = `${publicBase(payments)}/charity-give`;

  function exportReport() {
    downloadExcel(`charity-foundation-${today()}.xlsx`, [
      { name: 'Summary', rows: months.map((m) => ({ Month: monthLabel(m), 'Funds received': by('support').filter((s) => s.form === 'cash' && s.date.startsWith(m)).reduce((t, s) => t + s.amount, 0), 'Cash aid given': by('aid').filter((a) => a.form === 'cash' && a.date.startsWith(m)).reduce((t, a) => t + a.amount, 0), 'People helped': new Set(by('aid').filter((a) => a.date.startsWith(m)).map((a) => a.beneficiaryId)).size, Outreaches: by('outreach').filter((o) => o.date.startsWith(m)).length })) },
      { name: 'Beneficiaries', rows: beneficiaries.map((b) => ({ Name: b.name, Phone: b.phone, Need: b.category, Details: b.need, 'Amount needed': b.amount, Status: b.status, Added: b.date })) },
      { name: 'Aid given', rows: by('aid').map((a) => ({ Date: a.date, To: benName(a.beneficiaryId), Form: a.form, Amount: a.amount, Items: a.items, Notes: a.notes })) },
      { name: 'Support received', rows: by('support').map((s) => ({ Date: s.date, From: s.donor, Form: s.form, 'Amount / value': s.amount, Items: s.items, Notes: s.notes })) },
      { name: 'Outreach', rows: by('outreach').map((o) => ({ Date: o.date, Place: o.place, 'People reached': o.peopleReached, Cost: o.amount, Report: o.notes })) },
    ]);
  }

  const tabs: { id: typeof tab; label: string; icon: JSX.Element }[] = [
    { id: 'overview', label: 'Overview', icon: <HeartHandshake className="h-4 w-4" /> },
    { id: 'beneficiary', label: 'People in need', icon: <Users className="h-4 w-4" /> },
    { id: 'aid', label: 'Aid given', icon: <HandHeart className="h-4 w-4" /> },
    { id: 'support', label: 'Support received', icon: <GiftIcon className="h-4 w-4" /> },
    { id: 'outreach', label: 'Outreach', icon: <MapPin className="h-4 w-4" /> },
  ];

  return (
    <div>
      <PageHeader title="Charity Foundation" subtitle="People in need, aid and assistance, support received, outreach and the foundation's finances."
        actions={<>
          <Button variant="outline" onClick={() => { navigator.clipboard.writeText(link); toast('ok', 'Donation link copied.'); }}><Copy className="h-4 w-4" /> Donation link</Button>
          <Button variant="outline" onClick={exportReport}><Download className="h-4 w-4" /> Report (Excel)</Button>
          {tab !== 'overview' && <Button onClick={() => setEditing(blank(tab))}><Plus className="h-4 w-4" /> Add</Button>}
        </>} />
      <div className="mb-6 flex gap-1 overflow-x-auto rounded-2xl border border-stone-200 bg-white p-1">
        {tabs.map((t) => <button key={t.id} onClick={() => setTab(t.id)} className={cx('flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium', tab === t.id ? 'bg-royal-800 text-white' : 'text-stone-600 hover:bg-stone-100')}>{t.icon}{t.label}</button>)}
      </div>
      {!entries ? <Spinner /> : tab === 'overview' ? (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Funds balance" value={money(fundsIn - cashOut)} sub={`${money(fundsIn)} in · ${money(cashOut)} given`} />
            <Stat label="Items received (value)" value={money(itemsValueIn)} />
            <Stat label="People waiting for help" value={beneficiaries.filter((b) => b.status === 'waiting').length} sub={`${beneficiaries.filter((b) => b.status === 'helped').length} helped`} />
            <Stat label="Outreaches" value={by('outreach').length} sub={`${by('outreach').reduce((t, o) => t + o.peopleReached, 0)} people reached`} />
          </div>
          <Card className="p-5">
            <h2 className="mb-4 font-semibold text-stone-900">Last 6 months</h2>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase text-stone-500"><th className="py-2">Month</th><th>Funds in</th><th>Cash aid</th><th>People helped</th><th>Outreach</th></tr></thead>
              <tbody>{months.map((m) => (
                <tr key={m} className="border-t border-stone-100">
                  <td className="py-2">{monthLabel(m)}</td>
                  <td>{money(by('support').filter((s) => s.form === 'cash' && s.date.startsWith(m)).reduce((t, s) => t + s.amount, 0))}</td>
                  <td>{money(by('aid').filter((a) => a.form === 'cash' && a.date.startsWith(m)).reduce((t, a) => t + a.amount, 0))}</td>
                  <td>{new Set(by('aid').filter((a) => a.date.startsWith(m)).map((a) => a.beneficiaryId)).size}</td>
                  <td>{by('outreach').filter((o) => o.date.startsWith(m)).length}</td>
                </tr>))}
              </tbody>
            </table>
          </Card>
        </>
      ) : by(tab).length === 0 ? (
        <Card><Empty title="Nothing recorded yet">Use “Add” to record the first one.</Empty></Card>
      ) : (
        <Card>
          <ul className="divide-y divide-stone-100">
            {by(tab).map((e) => (
              <li key={e.id}><button onClick={() => setEditing(e)} className="flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-stone-50">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-stone-900">
                    {tab === 'beneficiary' && <>{e.name} <Badge color={e.status === 'waiting' ? 'gold' : e.status === 'helped' ? 'green' : 'gray'}>{e.status}</Badge></>}
                    {tab === 'aid' && <>To {benName(e.beneficiaryId)}</>}
                    {tab === 'support' && <>From {e.donor || 'anonymous'}</>}
                    {tab === 'outreach' && <>{e.place}</>}
                  </div>
                  <div className="truncate text-xs text-stone-500">
                    {prettyDate(e.date)}
                    {tab === 'beneficiary' && ` · ${e.category}${e.need ? ` — ${e.need}` : ''}${e.phone ? ` · ${e.phone}` : ''}`}
                    {(tab === 'aid' || tab === 'support') && ` · ${e.form === 'cash' ? 'Cash' : `Items: ${e.items}`}`}
                    {tab === 'outreach' && ` · ${e.peopleReached} people reached`}
                  </div>
                </div>
                {e.amount > 0 && <span className={cx('text-sm font-semibold', tab === 'support' ? 'text-emerald-700' : 'text-stone-800')}>{money(e.amount)}</span>}
              </button></li>
            ))}
          </ul>
        </Card>
      )}
      {editing && <EntryForm entry={editing} beneficiaries={beneficiaries} onClose={() => setEditing(null)} />}
    </div>
  );
}

function EntryForm({ entry, beneficiaries, onClose }: { entry: Omit<CharityEntry, 'id'> & { id?: string }; beneficiaries: CharityEntry[]; onClose: () => void }) {
  const toast = useToast();
  const [d, setD] = useState(entry);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD({ ...d, [k]: v });
  const title = { beneficiary: 'Person in need', aid: 'Aid / assistance given', support: 'Support received', outreach: 'Outreach' }[d.type];
  const waiting = useMemo(() => beneficiaries.filter((b) => b.status !== 'closed' || b.id === d.beneficiaryId), [beneficiaries, d.beneficiaryId]);
  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      const { id, ...data } = d;
      const clean = { ...data, amount: Number(data.amount) || 0, peopleReached: Number(data.peopleReached) || 0, updatedAt: serverTimestamp() };
      if (id) await updateDoc(doc(db, 'charity', id), clean); else await addDoc(collection(db, 'charity'), { ...clean, createdAt: serverTimestamp() });
      if (d.type === 'aid' && d.beneficiaryId) await updateDoc(doc(db, 'charity', d.beneficiaryId), { status: 'helped' }).catch(() => {});
      toast('ok', 'Saved.'); onClose();
    } catch (err) { toast('err', errorText(err)); setBusy(false); }
  }
  async function remove() {
    if (!d.id || !confirm('Delete this record?')) return;
    try { await deleteDoc(doc(db, 'charity', d.id)); onClose(); } catch (err) { toast('err', errorText(err)); }
  }
  return (
    <Modal open onClose={onClose} title={title}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Date"><Input type="date" required value={d.date} onChange={(e) => set('date', e.target.value)} /></Field>
        {d.type === 'beneficiary' && (<>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Name"><Input required value={d.name} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label="Phone"><Input value={d.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
            <Field label="Kind of need"><Select value={d.category} onChange={(e) => set('category', e.target.value)}>{NEEDS.map((n) => <option key={n}>{n}</option>)}</Select></Field>
            <Field label="Amount needed (GH₵)"><Input type="number" min={0} value={d.amount || ''} onChange={(e) => set('amount', Number(e.target.value))} /></Field>
          </div>
          <Field label="What they need"><Textarea rows={2} value={d.need} onChange={(e) => set('need', e.target.value)} /></Field>
          <Field label="Status"><Select value={d.status} onChange={(e) => set('status', e.target.value as CharityEntry['status'])}><option value="waiting">Waiting for help</option><option value="helped">Helped</option><option value="closed">Closed</option></Select></Field>
        </>)}
        {d.type === 'aid' && (
          <Field label="Given to"><Select required value={d.beneficiaryId} onChange={(e) => set('beneficiaryId', e.target.value)}><option value="">Choose…</option>{waiting.map((b) => <option key={b.id} value={b.id}>{b.name} — {b.category}</option>)}</Select></Field>
        )}
        {d.type === 'support' && <Field label="Donor (person, company or church)"><Input value={d.donor} onChange={(e) => set('donor', e.target.value)} /></Field>}
        {(d.type === 'aid' || d.type === 'support') && (<>
          <Field label="Form"><Select value={d.form} onChange={(e) => set('form', e.target.value as CharityEntry['form'])}><option value="cash">Cash / money</option><option value="items">Items</option></Select></Field>
          {d.form === 'items' && <Field label="Items"><Input required value={d.items} onChange={(e) => set('items', e.target.value)} placeholder="e.g. 5 bags of rice, clothes" /></Field>}
          <Field label={d.form === 'cash' ? 'Amount (GH₵)' : 'Estimated value (GH₵)'}><Input type="number" min={0} step="0.01" value={d.amount || ''} onChange={(e) => set('amount', Number(e.target.value))} /></Field>
        </>)}
        {d.type === 'outreach' && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Place" className="col-span-2"><Input required value={d.place} onChange={(e) => set('place', e.target.value)} placeholder="e.g. Kumasi Children's Home" /></Field>
            <Field label="People reached"><Input type="number" min={0} value={d.peopleReached || ''} onChange={(e) => set('peopleReached', Number(e.target.value))} /></Field>
            <Field label="Cost (GH₵)"><Input type="number" min={0} value={d.amount || ''} onChange={(e) => set('amount', Number(e.target.value))} /></Field>
          </div>
        )}
        <Field label={d.type === 'outreach' ? 'Report' : 'Notes'}><Textarea rows={d.type === 'outreach' ? 4 : 2} value={d.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
        <div className="flex items-center justify-between">
          {d.id ? <Button type="button" variant="ghost" className="text-red-600" onClick={remove}><Trash2 className="h-4 w-4" /> Delete</Button> : <span />}
          <div className="flex gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy}>Save</Button></div>
        </div>
      </form>
    </Modal>
  );
}

export function PublicCharity() {
  const p = usePayments();
  return (
    <div className="min-h-screen bg-gradient-to-b from-royal-950 via-royal-900 via-[14rem] to-cream to-[26rem] px-4 py-10">
      <div className="mx-auto max-w-md">
        <div className="mb-6 text-center text-white">
          <div className="mx-auto mb-4 inline-block rounded-3xl bg-white p-3 shadow-xl"><FullLogo className="h-24" /></div>
          <h1 className="font-display text-3xl font-extrabold">TOGG Charity Foundation</h1>
          <p className="mt-2 text-sm text-royal-200">Helping the needy with food, school fees, medical bills and more. “Whoever is kind to the poor lends to the Lord.” — Proverbs 19:17</p>
        </div>
        <Card className="p-6">
          <h2 className="mb-3 font-semibold text-stone-900">Donate</h2>
          <HowToPay p={p} reference="Charity foundation" />
          <p className="mt-4 text-xs text-stone-500">Want to give items (food, clothes, books)? Please contact the church office.</p>
        </Card>
      </div>
    </div>
  );
}
