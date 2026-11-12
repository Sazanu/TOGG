import { useMemo, useState } from 'react';
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { ChevronLeft, ChevronRight, Download, Plus, Printer, Search, Upload, Wallet } from 'lucide-react';
import { ImportWizard, type ImportField } from '../components/ImportWizard';
import { Avatar, Badge, Button, Card, Empty, Input, Modal, PageHeader, Select, Spinner, Stat } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { ALL, useData } from '../context/DataContext';
import { downloadExcel, normalizePhone, parseAmount, parseDateLoose } from '../lib/csv';
import { db } from '../lib/firebase';
import { MONTHS, PAYMENT_METHODS, initials, labelOf, money, prettyDate, today } from '../lib/format';
import { can } from '../lib/roles';
import type { Gift, Member, PaymentMethod } from '../lib/types';
import { RecordGift, useGifts } from './Giving';

type Filter = 'all' | 'paid' | 'unpaid';

export default function Tithes() {
  const { profile } = useAuth();
  const { members, membersLoading, scope, branchName } = useData();
  const canWrite = can(profile?.role, 'giving.write');
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [record, setRecord] = useState<{ member?: Member } | null>(null);
  const [card, setCard] = useState<Member | null>(null);
  const [importing, setImporting] = useState(false);

  const { gifts: yearGifts, loading } = useGifts(scope, `${year}-01-01`, `${year}-12-31`);
  const tithes = useMemo(() => yearGifts.filter((g) => g.type === 'tithe'), [yearGifts]);
  const mm = String(month + 1).padStart(2, '0');
  const monthTithes = useMemo(() => tithes.filter((g) => g.date.slice(5, 7) === mm), [tithes, mm]);

  const byMember = useMemo(() => {
    const m = new Map<string, { month: number; year: number; last: string }>();
    tithes.forEach((g) => {
      if (!g.memberId) return;
      const cur = m.get(g.memberId) ?? { month: 0, year: 0, last: '' };
      cur.year += g.amount;
      if (g.date.slice(5, 7) === mm) cur.month += g.amount;
      if (g.date > cur.last) cur.last = g.date;
      m.set(g.memberId, cur);
    });
    return m;
  }, [tithes, mm]);

  // Tithers = active adults (and anyone who has paid, e.g. working teens)
  const register = useMemo(() => {
    const base = members.filter((m) => m.status !== 'visitor' && (m.category === 'adult' || byMember.has(m.id)));
    const needle = q.trim().toLowerCase();
    return base.filter((m) => {
      const paid = (byMember.get(m.id)?.month ?? 0) > 0;
      if (filter === 'paid' && !paid) return false;
      if (filter === 'unpaid' && paid) return false;
      if (needle && !`${m.firstName} ${m.lastName} ${m.phone} ${m.membershipNo ?? ''}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [members, byMember, q, filter]);

  const eligible = members.filter((m) => m.status !== 'visitor' && m.category === 'adult').length;
  const monthTotal = monthTithes.reduce((t, g) => t + g.amount, 0);
  const tithers = new Set(monthTithes.filter((g) => g.memberId).map((g) => g.memberId)).size;
  const ytd = tithes.reduce((t, g) => t + g.amount, 0);
  const unnamed = monthTithes.filter((g) => !g.memberId).reduce((t, g) => t + g.amount, 0);

  function step(d: number) {
    const dt = new Date(year, month + d, 1);
    setYear(dt.getFullYear()); setMonth(dt.getMonth());
  }

  function exportXlsx() {
    downloadExcel(`togg-tithes-${year}-${mm}.xlsx`, [
      {
        name: `${MONTHS[month]} register`,
        rows: register.map((m) => ({
          'Membership no.': m.membershipNo ?? '', Name: `${m.firstName} ${m.lastName}`, Phone: m.phone, Branch: branchName(m.branchId),
          [`${MONTHS[month]} tithe`]: byMember.get(m.id)?.month ?? 0, [`${year} to date`]: byMember.get(m.id)?.year ?? 0,
          'Last tithe': byMember.get(m.id)?.last ?? '',
        })),
      },
      {
        name: `${year} records`,
        rows: tithes.map((g) => ({ Date: g.date, Name: g.memberName, Amount: g.amount, Method: labelOf(PAYMENT_METHODS, g.method), Reference: g.reference, Branch: branchName(g.branchId) })),
      },
    ]);
  }

  return (
    <div>
      <PageHeader
        title="Tithes"
        subtitle={`${scope === ALL ? 'All branches' : branchName(scope)} · monthly tithe register and tithe cards`}
        actions={
          <>
            <Button variant="outline" onClick={exportXlsx}><Download className="h-4 w-4" /> Excel</Button>
            {canWrite && <Button variant="outline" onClick={() => setImporting(true)}><Upload className="h-4 w-4" /> Import old records</Button>}
            {canWrite && <Button variant="gold" onClick={() => setRecord({})}><Plus className="h-4 w-4" /> Record tithe</Button>}
          </>
        }
      />

      <Card className="mb-6 flex flex-wrap items-center gap-2 p-3">
        <Button variant="ghost" size="sm" onClick={() => step(-1)} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></Button>
        <Select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="!w-36 !py-2">
          {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
        </Select>
        <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="!w-28 !py-2">
          {Array.from({ length: 8 }, (_, i) => now.getFullYear() - 6 + i).map((y) => <option key={y}>{y}</option>)}
        </Select>
        <Button variant="ghost" size="sm" onClick={() => step(1)} aria-label="Next month"><ChevronRight className="h-4 w-4" /></Button>
      </Card>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={`${MONTHS[month]} tithes`} value={money(monthTotal)} icon={<Wallet className="h-4 w-4" />} sub={unnamed ? `${money(unnamed)} not linked to a member` : `${monthTithes.length} payments`} />
        <Stat label="Members who tithed" value={tithers} sub={eligible ? `${Math.round((tithers / eligible) * 100)}% of ${eligible} adult members` : undefined} />
        <Stat label="Average tithe" value={money(tithers ? (monthTotal - unnamed) / tithers : 0)} />
        <Stat label={`${year} to date`} value={money(ytd)} />
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-stone-100 p-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <Input className="pl-9" placeholder="Search name, phone or card no…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="flex gap-1">
            {(['all', 'paid', 'unpaid'] as Filter[]).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`rounded-lg px-3 py-2 text-sm capitalize ${filter === f ? 'bg-royal-800 text-white' : 'text-stone-600 hover:bg-stone-100'}`}>
                {f === 'unpaid' ? 'Not yet' : f}
              </button>
            ))}
          </div>
        </div>
        {loading || membersLoading ? <Spinner /> : register.length === 0 ? (
          <Empty icon={<Wallet />} title="No one to show">Adult members appear here so you can see who has paid tithe this month.</Empty>
        ) : (
          <ul className="divide-y divide-stone-100">
            {register.map((m) => {
              const s = byMember.get(m.id);
              const paid = (s?.month ?? 0) > 0;
              return (
                <li key={m.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <Avatar text={initials(m.firstName, m.lastName)} />
                  <button className="min-w-0 flex-1 text-left" onClick={() => setCard(m)}>
                    <div className="truncate font-medium text-stone-900 hover:text-royal-700">{m.firstName} {m.lastName}</div>
                    <div className="truncate text-xs text-stone-500">
                      {m.membershipNo && <span className="font-mono text-royal-600">{m.membershipNo} · </span>}
                      {s?.last ? `Last: ${prettyDate(s.last)}` : 'No tithe this year'}{scope === ALL && ` · ${branchName(m.branchId)}`}
                    </div>
                  </button>
                  <div className="hidden text-right text-xs text-stone-500 sm:block">{year}: <b className="text-stone-800">{money(s?.year ?? 0)}</b></div>
                  <div className="w-28 text-right">{paid ? <span className="font-semibold text-emerald-700">{money(s!.month)}</span> : <Badge color="gray">Not yet</Badge>}</div>
                  {canWrite && <Button size="sm" variant="outline" onClick={() => setRecord({ member: m })} aria-label="Record tithe"><Plus className="h-3.5 w-3.5" /></Button>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {record && (
        <RecordGift
          onClose={() => setRecord(null)}
          preset={{ type: 'tithe', memberId: record.member?.id, memberName: record.member ? `${record.member.firstName} ${record.member.lastName}` : undefined, branchId: record.member?.branchId }}
        />
      )}
      {card && <TitheCard member={card} year={year} gifts={tithes.filter((g) => g.memberId === card.id)} onClose={() => setCard(null)} />}
      {importing && <TitheImport onClose={() => setImporting(false)} />}
    </div>
  );
}

function TitheCard({ member, year, gifts, onClose }: { member: Member; year: number; gifts: Gift[]; onClose: () => void }) {
  const { branchName } = useData();
  const perMonth = MONTHS.map((_, i) => gifts.filter((g) => Number(g.date.slice(5, 7)) === i + 1).reduce((t, g) => t + g.amount, 0));
  const total = perMonth.reduce((a, b) => a + b, 0);
  return (
    <Modal open onClose={onClose} title="Tithe card">
      <div id="tithe-card">
        <div className="rounded-2xl bg-royal-950 p-5 text-white">
          <div className="text-xs uppercase tracking-widest text-gold-300">Throne of God's Grace · {year}</div>
          <div className="mt-1 font-display text-xl font-bold">{member.firstName} {member.lastName}</div>
          <div className="text-sm text-royal-200">{member.membershipNo || 'No card number'} · {branchName(member.branchId)}</div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {MONTHS.map((m, i) => (
            <div key={m} className={`rounded-xl border p-2 text-center ${perMonth[i] ? 'border-emerald-200 bg-emerald-50' : 'border-stone-200'}`}>
              <div className="text-xs text-stone-500">{m.slice(0, 3)}</div>
              <div className={`text-sm font-semibold ${perMonth[i] ? 'text-emerald-700' : 'text-stone-300'}`}>{perMonth[i] ? money(perMonth[i]) : '—'}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between rounded-xl bg-stone-50 px-4 py-3">
          <span className="text-sm text-stone-600">{perMonth.filter(Boolean).length} of 12 months</span>
          <span className="font-display text-lg font-bold text-royal-950">{money(total)}</span>
        </div>
        {gifts.length > 0 && (
          <ul className="mt-4 max-h-48 divide-y divide-stone-100 overflow-y-auto text-sm">
            {[...gifts].sort((a, b) => b.date.localeCompare(a.date)).map((g) => (
              <li key={g.id} className="flex justify-between py-2"><span className="text-stone-600">{prettyDate(g.date)} · {labelOf(PAYMENT_METHODS, g.method)}</span><span className="font-medium">{money(g.amount)}</span></li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-4 flex justify-end"><Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button></div>
    </Modal>
  );
}

const TITHE_FIELDS: ImportField[] = [
  { key: 'date', label: 'Date', required: true, aliases: ['date', 'datepaid', 'paymentdate', 'month'] },
  { key: 'amount', label: 'Amount', required: true, aliases: ['amount', 'tithe', 'amountghs', 'ghs', 'cedis', 'amt'] },
  { key: 'name', label: 'Name', aliases: ['name', 'fullname', 'membername', 'payer'] },
  { key: 'membershipNo', label: 'Membership / card no.', aliases: ['membershipno', 'cardno', 'titheno', 'memberno', 'id'] },
  { key: 'phone', label: 'Phone', aliases: ['phone', 'phonenumber', 'mobile', 'contact'] },
  { key: 'method', label: 'Method', aliases: ['method', 'paymentmethod', 'mode', 'channel'] },
  { key: 'reference', label: 'Reference', aliases: ['reference', 'ref', 'transactionid', 'receipt', 'receiptno'] },
];

function TitheImport({ onClose }: { onClose: () => void }) {
  const { profile } = useAuth();
  const { branches, members, scope } = useData();
  const [branchId, setBranchId] = useState(profile?.branchId ?? (scope !== ALL ? scope : ''));

  async function run(rows: Record<string, string>[]) {
    if (!branchId) throw new Error('Choose the branch these tithes belong to.');
    const pool = members.filter((m) => m.branchId === branchId);
    const byNo = new Map(pool.filter((m) => m.membershipNo).map((m) => [m.membershipNo!.toLowerCase(), m]));
    const byPhone = new Map(pool.filter((m) => m.phone).map((m) => [normalizePhone(m.phone), m]));
    const byName = new Map(pool.map((m) => [`${m.firstName} ${m.lastName}`.toLowerCase().replace(/\s+/g, ' ').trim(), m]));
    const notes: string[] = [];
    const out: Record<string, unknown>[] = [];
    let skipped = 0; let unmatched = 0;
    rows.forEach((r, i) => {
      const amount = parseAmount(r.amount);
      const date = parseDateLoose(r.date);
      if (!(amount > 0) || !date) { skipped++; notes.push(`Row ${i + 2}: missing date or amount`); return; }
      const m = (r.membershipNo && byNo.get(r.membershipNo.toLowerCase())) || (r.phone && byPhone.get(normalizePhone(r.phone)))
        || (r.name && byName.get(r.name.toLowerCase().replace(/\s+/g, ' ').trim())) || null;
      if (!m) { unmatched++; if (r.name) notes.push(`Row ${i + 2}: "${r.name}" not found in members — saved by name only`); }
      const ml = (r.method || '').toLowerCase();
      const method: PaymentMethod = ml.includes('momo') || ml.includes('mobile') ? 'momo' : ml.includes('bank') || ml.includes('transfer') ? 'bank' : ml.includes('cheque') ? 'cheque' : ml.includes('card') ? 'card' : 'cash';
      out.push({
        branchId, date, amount, type: 'tithe', method, memberId: m?.id ?? null,
        memberName: m ? `${m.firstName} ${m.lastName}` : (r.name || ''), reference: r.reference || '', note: 'Imported',
        createdBy: profile?.uid, createdAt: serverTimestamp(),
      });
    });
    for (let i = 0; i < out.length; i += 400) {
      const batch = writeBatch(db);
      out.slice(i, i + 400).forEach((g) => batch.set(doc(collection(db, 'giving')), g));
      await batch.commit();
    }
    if (unmatched) notes.unshift(`${unmatched} payment(s) could not be matched to a member.`);
    return { added: out.length, skipped, notes };
  }

  return (
    <ImportWizard
      title="Import old tithe records"
      fields={TITHE_FIELDS}
      onClose={onClose}
      onImport={run}
      help={<>One row per payment. Each row is matched to a member by <b>card number</b>, then <b>phone</b>, then <b>exact name</b>. Import your members first so the matches work. Today is {prettyDate(today())}.</>}
      options={
        <label className="block rounded-xl border border-stone-200 p-4 text-sm">
          <span className="mb-1 block font-medium text-stone-700">Branch</span>
          <Select required value={branchId} disabled={!!profile?.branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">Choose…</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </label>
      }
    />
  );
}
