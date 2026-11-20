import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { addDoc, collection, limit, onSnapshot, orderBy, query, serverTimestamp, where } from 'firebase/firestore';
import { CalendarCheck, ChevronRight, Plus, Tablet } from 'lucide-react';
import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Spinner, errorText, useToast } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { ALL, useData } from '../context/DataContext';
import { db } from '../lib/firebase';
import { SERVICE_TYPES, prettyDate, shortDate, today } from '../lib/format';
import type { Service } from '../lib/types';
import AttendanceReports from './AttendanceReports';

export function useServices(scope: string, max = 60) {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    const base = collection(db, 'services');
    const q = scope === ALL
      ? query(base, orderBy('date', 'desc'), limit(max))
      : query(base, where('branchId', '==', scope));
    return onSnapshot(q, (s) => {
      const list = s.docs.map((d) => ({ id: d.id, ...d.data() }) as Service);
      list.sort((a, b) => b.date.localeCompare(a.date));
      setServices(list.slice(0, max));
      setLoading(false);
    }, (e) => { console.error('services', e); setLoading(false); });
  }, [scope, max]);
  return { services, loading };
}

export default function Attendance() {
  const { scope, branchName } = useData();
  const { services, loading } = useServices(scope);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'services' | 'reports'>('services');

  const avg = useMemo(() => {
    const sundays = services.filter((s) => s.type === 'Sunday Service').slice(0, 8);
    if (!sundays.length) return null;
    return Math.round(sundays.reduce((t, s) => t + (s.count || 0) + (s.visitors || 0), 0) / sundays.length);
  }, [services]);

  return (
    <div>
      <PageHeader
        title="Attendance"
        subtitle={`${scope === ALL ? 'All branches' : branchName(scope)}${avg !== null ? ` · average Sunday: ${avg}` : ''}`}
        actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Start check-in</Button>}
      />
      <div className="mb-6 flex gap-1 rounded-2xl border border-stone-200 bg-white p-1">
        {(['services', 'reports'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-xl px-4 py-2 text-sm font-medium ${tab === t ? 'bg-royal-800 text-white' : 'text-stone-600 hover:bg-stone-100'}`}>{t === 'services' ? 'Services & check-in' : 'Reports'}</button>
        ))}
      </div>
      {tab === 'reports' ? <AttendanceReports /> : <>
      {services.filter((s) => s.date === today()).map((s) => (
        <Card key={s.id} className="mb-4 flex flex-wrap items-center gap-4 border-gold-200 bg-gradient-to-r from-gold-50 to-white p-5">
          <div className="flex-1"><div className="text-xs font-semibold uppercase tracking-wide text-gold-700">Today</div><div className="font-display text-lg font-bold text-royal-950">{s.title || s.type}</div><div className="text-sm text-stone-500">{branchName(s.branchId)} · {(s.count || 0) + (s.visitors || 0)} in church</div></div>
          <Link to={`/station/${s.id}`}><Button variant="gold"><Tablet className="h-4 w-4" /> Open check-in station</Button></Link>
          <Link to={`/attendance/${s.id}`}><Button variant="outline">List view</Button></Link>
        </Card>
      ))}
      <Card>
        {loading ? <Spinner /> : services.length === 0 ? (
          <Empty icon={<CalendarCheck />} title="No services recorded yet">Start a check-in for today's service to begin taking attendance.</Empty>
        ) : (
          <ul className="divide-y divide-stone-100">
            {services.map((s) => (
              <li key={s.id}>
                <Link to={`/attendance/${s.id}`} className="flex items-center gap-4 px-4 py-4 hover:bg-stone-50/70 sm:px-5">
                  <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-royal-50 text-royal-700">
                    <span className="text-[10px] font-semibold uppercase">{shortDate(s.date).split(' ')[1]}</span>
                    <span className="font-display text-lg font-bold leading-none">{shortDate(s.date).split(' ')[0]}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-stone-900">{s.title || s.type}</div>
                    <div className="truncate text-xs text-stone-500">{prettyDate(s.date)} · {branchName(s.branchId)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-display text-xl font-bold text-royal-950">{(s.count || 0) + (s.visitors || 0)}</div>
                    <div className="text-[11px] text-stone-500">{s.count || 0} members{s.visitors ? ` + ${s.visitors}` : ''}</div>
                  </div>
                  {s.date === today() && <Badge color="green">Today</Badge>}
                  <ChevronRight className="h-4 w-4 text-stone-300" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      </>}
      {open && <NewService onClose={() => setOpen(false)} />}
    </div>
  );
}

function NewService({ onClose }: { onClose: () => void }) {
  const { profile } = useAuth();
  const { branches, scope } = useData();
  const nav = useNavigate();
  const toast = useToast();
  const [branchId, setBranchId] = useState(profile?.branchId ?? (scope !== ALL ? scope : branches[0]?.id ?? ''));
  const [date, setDate] = useState(today());
  const [type, setType] = useState(SERVICE_TYPES[0]);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const ref = await addDoc(collection(db, 'services'), {
        branchId, date, type, title: title.trim(), count: 0, visitors: 0,
        createdBy: profile?.uid, createdAt: serverTimestamp(),
      });
      nav(`/attendance/${ref.id}`);
    } catch (err) {
      toast('err', errorText(err));
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Start check-in">
      <form onSubmit={create} className="space-y-4">
        <Field label="Branch">
          <Select required value={branchId} disabled={!!profile?.branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">Choose…</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Date"><Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Service type">
            <Select value={type} onChange={(e) => setType(e.target.value)}>{SERVICE_TYPES.map((t) => <option key={t}>{t}</option>)}</Select>
          </Field>
        </div>
        <Field label="Title (optional)" hint="e.g. Harvest Thanksgiving, Youth Week Day 2"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>Start</Button>
        </div>
      </form>
    </Modal>
  );
}
