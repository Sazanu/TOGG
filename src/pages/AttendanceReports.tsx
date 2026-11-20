import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Download, MessageSquare, TrendingDown, TrendingUp, Users } from 'lucide-react';
import { Avatar, Badge, Button, Card, Empty, Select, Spinner, Stat, cx, errorText, useToast } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { ALL, useData } from '../context/DataContext';
import { downloadExcel } from '../lib/csv';
import { db } from '../lib/firebase';
import { initials, monthKey, monthLabel, shiftMonth, shortDate } from '../lib/format';
import { can, isGlobal } from '../lib/roles';
import { queueSms } from '../lib/sms';
import type { MemberCategory, Service } from '../lib/types';

interface Row { s: Service; present: Set<string>; byCat: Record<MemberCategory, number> }

async function loadMonth(branch: string, month: string): Promise<Row[]> {
  const base = collection(db, 'services');
  const snap = await getDocs(branch === ALL ? query(base, where('date', '>=', `${month}-01`), where('date', '<=', `${month}-31`)) : query(base, where('branchId', '==', branch)));
  const services = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Service).filter((s) => s.date.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date));
  return Promise.all(services.map(async (s) => {
    const ch = await getDocs(collection(db, 'services', s.id, 'checkins'));
    const byCat: Record<MemberCategory, number> = { adult: 0, teen: 0, child: 0 };
    ch.docs.forEach((d) => { const c = d.data().category as MemberCategory; if (c in byCat) byCat[c]++; });
    return { s, present: new Set(ch.docs.map((d) => d.id)), byCat };
  }));
}

export default function AttendanceReports() {
  const { profile } = useAuth();
  const { members, scope, branchName } = useData();
  const toast = useToast();
  const branch = profile?.branchId ?? scope;
  const [month, setMonth] = useState(monthKey());
  const [rows, setRows] = useState<Row[] | null>(null);
  const [prev, setPrev] = useState<Row[]>([]);
  const [type, setType] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setRows(null);
    loadMonth(branch, month).then(setRows).catch((e) => { toast('err', errorText(e)); setRows([]); });
    loadMonth(branch, shiftMonth(month, -1)).then(setPrev).catch(() => setPrev([]));
  }, [branch, month, toast]);

  const shown = (rows ?? []).filter((r) => !type || r.s.type === type);
  const types = [...new Set((rows ?? []).map((r) => r.s.type))];
  const total = (r: Row) => (r.s.count || 0) + (r.s.visitors || 0);
  const avg = shown.length ? Math.round(shown.reduce((t, r) => t + total(r), 0) / shown.length) : 0;
  const prevShown = prev.filter((r) => !type || r.s.type === type);
  const prevAvg = prevShown.length ? Math.round(prevShown.reduce((t, r) => t + total(r), 0) / prevShown.length) : 0;
  const maxT = Math.max(1, ...shown.map(total));

  // How often each active member came (only services of their own branch count).
  const rates = useMemo(() => members.filter((m) => m.status === 'active').map((m) => {
    const theirs = shown.filter((r) => r.s.branchId === m.branchId);
    const came = theirs.filter((r) => r.present.has(m.id)).length;
    return { m, came, of: theirs.length, pct: theirs.length ? Math.round((came / theirs.length) * 100) : 0 };
  }).filter((x) => x.of > 0).sort((a, b) => a.pct - b.pct || a.m.firstName.localeCompare(b.m.firstName)), [members, shown]);
  const missedAll = rates.filter((r) => r.came === 0);
  const faithful = rates.filter((r) => r.pct === 100).length;

  function exportXlsx() {
    downloadExcel(`togg-attendance-${month}.xlsx`, [
      { name: 'Services', rows: shown.map((r) => ({ Date: r.s.date, Service: r.s.title || r.s.type, Branch: branchName(r.s.branchId), Adults: r.byCat.adult, Teens: r.byCat.teen, Children: r.byCat.child, 'Guests (head-count)': r.s.visitors || 0, Total: total(r) })) },
      { name: 'Members', rows: rates.map((r) => ({ Name: `${r.m.firstName} ${r.m.lastName}`, Phone: r.m.phone, Attended: r.came, 'Out of': r.of, 'Rate %': r.pct })) },
    ]);
  }

  async function textMissing() {
    const withPhone = missedAll.filter((r) => r.m.phone);
    if (!withPhone.length || !confirm(`Send a "we miss you" SMS to ${withPhone.length} members who did not come to any ${type || 'service'} in ${monthLabel(month)}?`)) return;
    setSending(true);
    try {
      const branchId = isGlobal(profile?.role) ? (branch === ALL ? null : branch) : profile?.branchId ?? null;
      const r = await queueSms({ branchId, message: `Hello {firstName}, we have missed you in church this month. We love you and are praying for you. See you on Sunday! - {church}`, audience: { type: 'members', memberIds: withPhone.map((x) => x.m.id), branchId }, label: `Missed all services — ${monthLabel(month)}`, createdBy: profile?.uid, createdByName: profile?.displayName });
      toast(r.delivered ? 'ok' : 'err', r.delivered ? 'Sent to the SMS server.' : 'Saved, but no SMS server answered — see System status.');
    } catch (e) { toast('err', errorText(e)); } finally { setSending(false); }
  }

  return (
    <div>
      <Card className="mb-6 flex flex-wrap items-center gap-2 p-3">
        <Select value={month} onChange={(e) => setMonth(e.target.value)} className="!w-44 !py-2">{Array.from({ length: 12 }, (_, i) => shiftMonth(monthKey(), -i)).map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</Select>
        <Select value={type} onChange={(e) => setType(e.target.value)} className="!w-52 !py-2"><option value="">All services</option>{types.map((t) => <option key={t}>{t}</option>)}</Select>
        <span className="text-sm text-stone-500">{branch === ALL ? 'All branches' : branchName(branch)}</span>
        <Button variant="outline" size="sm" className="ml-auto" onClick={exportXlsx}><Download className="h-4 w-4" /> Excel</Button>
      </Card>
      {!rows ? <Spinner label="Counting attendance…" /> : shown.length === 0 ? <Card><Empty icon={<Users />} title={`No services recorded in ${monthLabel(month)}`} /></Card> : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Services held" value={shown.length} />
            <Stat label="Average attendance" value={avg} icon={avg >= prevAvg ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              sub={prevAvg ? <span className={avg >= prevAvg ? 'text-emerald-600' : 'text-red-600'}>{avg >= prevAvg ? '▲' : '▼'} {Math.abs(avg - prevAvg)} vs {monthLabel(shiftMonth(month, -1))}</span> : undefined} />
            <Stat label="Came every time" value={faithful} sub={`of ${rates.length} active members`} />
            <Stat label="Did not come at all" value={missedAll.length} sub="active members" />
          </div>

          <Card className="mb-6 p-5">
            <h2 className="mb-4 font-semibold text-stone-900">Each service</h2>
            <div className="mb-5 flex h-40 items-end gap-2">
              {shown.map((r) => (
                <Link key={r.s.id} to={`/attendance/${r.s.id}`} className="group flex flex-1 flex-col items-center gap-1" title={`${r.s.title || r.s.type}: ${total(r)}`}>
                  <span className="text-[11px] text-stone-500">{total(r)}</span>
                  <div className="flex w-full max-w-[44px] flex-col-reverse overflow-hidden rounded-t-lg" style={{ height: `${Math.max(4, (total(r) / maxT) * 120)}px` }}>
                    <div className="bg-royal-700" style={{ flex: r.byCat.adult }} /><div className="bg-royal-400" style={{ flex: r.byCat.teen }} /><div className="bg-gold-400" style={{ flex: r.byCat.child }} /><div className="bg-stone-300" style={{ flex: r.s.visitors || 0 }} />
                  </div>
                  <span className="text-[10px] text-stone-400">{shortDate(r.s.date)}</span>
                </Link>
              ))}
            </div>
            <div className="mb-4 flex flex-wrap gap-4 text-xs text-stone-500">
              {[['bg-royal-700', 'Adults'], ['bg-royal-400', 'Teens'], ['bg-gold-400', 'Children'], ['bg-stone-300', 'Guests (head-count)']].map(([c, l]) => <span key={l} className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${c}`} />{l}</span>)}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs uppercase text-stone-500">{['Date', 'Service', 'Adults', 'Teens', 'Children', 'Guests', 'Total'].map((h, i) => <th key={h} className={cx('py-2 font-medium', i > 1 && 'text-right')}>{h}</th>)}</tr></thead>
                <tbody>{shown.map((r) => (
                  <tr key={r.s.id} className="border-t border-stone-100">
                    <td className="py-2">{shortDate(r.s.date)}</td><td><Link className="hover:text-royal-700" to={`/attendance/${r.s.id}`}>{r.s.title || r.s.type}</Link>{branch === ALL && <span className="text-xs text-stone-400"> · {branchName(r.s.branchId)}</span>}</td>
                    <td className="text-right">{r.byCat.adult}</td><td className="text-right">{r.byCat.teen}</td><td className="text-right">{r.byCat.child}</td><td className="text-right">{r.s.visitors || 0}</td><td className="text-right font-semibold">{total(r)}</td>
                  </tr>))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <div className="flex items-center justify-between border-b border-stone-100 px-5 py-3">
                <h2 className="font-semibold text-stone-900">Did not come in {monthLabel(month)} ({missedAll.length})</h2>
                {can(profile?.role, 'sms.send') && missedAll.length > 0 && <Button size="sm" variant="gold" loading={sending} onClick={textMissing}><MessageSquare className="h-4 w-4" /> Text them</Button>}
              </div>
              {missedAll.length === 0 ? <p className="px-5 py-6 text-sm text-emerald-600">Every active member came at least once. 🎉</p> : (
                <ul className="max-h-96 divide-y divide-stone-100 overflow-y-auto">
                  {missedAll.map(({ m }) => (
                    <li key={m.id} className="flex items-center gap-3 px-5 py-2.5">
                      <Avatar text={initials(m.firstName, m.lastName)} />
                      <Link to={`/members/${m.id}`} className="min-w-0 flex-1 truncate text-sm hover:text-royal-700">{m.firstName} {m.lastName}<span className="block text-xs text-stone-400">{m.phone || 'No phone'}</span></Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <div className="border-b border-stone-100 px-5 py-3"><h2 className="font-semibold text-stone-900">Attendance rate per member</h2></div>
              <ul className="max-h-96 divide-y divide-stone-100 overflow-y-auto">
                {rates.filter((r) => r.came > 0).map(({ m, came, of, pct }) => (
                  <li key={m.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                    <Link to={`/members/${m.id}`} className="min-w-0 flex-1 truncate hover:text-royal-700">{m.firstName} {m.lastName}</Link>
                    <div className="hidden h-2 w-28 rounded-full bg-stone-100 sm:block"><div className={cx('h-2 rounded-full', pct >= 75 ? 'bg-emerald-500' : pct >= 50 ? 'bg-gold-400' : 'bg-red-400')} style={{ width: `${pct}%` }} /></div>
                    <Badge color={pct >= 75 ? 'green' : pct >= 50 ? 'gold' : 'red'}>{came}/{of}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
