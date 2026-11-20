import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  collection, deleteDoc, doc, increment, onSnapshot, orderBy, query, runTransaction, serverTimestamp, updateDoc, writeBatch,
} from 'firebase/firestore';
import { Check, Download, MessageSquare, Minus, Plus, Search, Tablet, Trash2, UserPlus, X } from 'lucide-react';
import { Avatar, Button, Card, Empty, Input, PageHeader, Spinner, errorText, useToast } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { downloadCsv } from '../lib/csv';
import { db } from '../lib/firebase';
import { initials, prettyDate, today } from '../lib/format';
import { can } from '../lib/roles';
import type { CheckIn as CheckInT, Member, MemberCategory, Service } from '../lib/types';

const GROUPS: { key: MemberCategory; label: string }[] = [
  { key: 'adult', label: 'Adults' }, { key: 'teen', label: 'Teens' }, { key: 'child', label: 'Children' },
];

export default function CheckIn() {
  const { serviceId = '' } = useParams();
  const { profile } = useAuth();
  const { members, scope, setScope, canSwitchScope, branchName } = useData();
  const toast = useToast();
  const nav = useNavigate();
  const [service, setService] = useState<Service | null | undefined>(undefined);
  const [checkins, setCheckins] = useState<CheckInT[]>([]);
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => onSnapshot(doc(db, 'services', serviceId), (s) => {
    setService(s.exists() ? ({ id: s.id, ...s.data() } as Service) : null);
  }, () => setService(null)), [serviceId]);

  useEffect(() => onSnapshot(
    query(collection(db, 'services', serviceId, 'checkins'), orderBy('at', 'desc')),
    (s) => setCheckins(s.docs.map((d) => ({ id: d.id, ...d.data() }) as CheckInT)),
  ), [serviceId]);

  // Head/associate pastor: load that branch's members once when the service opens.
  const synced = useRef('');
  const serviceBranch = service?.branchId;
  useEffect(() => {
    if (!serviceBranch || synced.current === serviceId) return;
    synced.current = serviceId;
    if (canSwitchScope && scope !== serviceBranch) setScope(serviceBranch);
  }, [serviceBranch, serviceId, canSwitchScope, scope, setScope]);

  const present = useMemo(() => new Set(checkins.map((c) => c.memberId)), [checkins]);
  const branchMembers = useMemo(() => members.filter((m) => m.branchId === service?.branchId), [members, service]);
  const results = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return [];
    return branchMembers
      .filter((m) => `${m.firstName} ${m.lastName} ${m.phone}`.toLowerCase().includes(n))
      .slice(0, 8);
  }, [q, branchMembers]);

  async function checkIn(m: Member) {
    if (present.has(m.id)) { toast('ok', `${m.firstName} is already checked in.`); return; }
    setBusyId(m.id);
    try {
      await runTransaction(db, async (tx) => {
        const ref = doc(db, 'services', serviceId, 'checkins', m.id);
        const snap = await tx.get(ref);
        if (snap.exists()) return;
        tx.set(ref, { memberId: m.id, name: `${m.firstName} ${m.lastName}`, category: m.category, at: serverTimestamp(), by: profile?.uid });
        tx.update(doc(db, 'services', serviceId), { count: increment(1) });
      });
      setQ('');
      inputRef.current?.focus();
    } catch (e) {
      toast('err', errorText(e));
    } finally {
      setBusyId('');
    }
  }

  async function undo(c: CheckInT) {
    setBusyId(c.id);
    try {
      await runTransaction(db, async (tx) => {
        const ref = doc(db, 'services', serviceId, 'checkins', c.id);
        const snap = await tx.get(ref);
        if (!snap.exists()) return;
        tx.delete(ref);
        tx.update(doc(db, 'services', serviceId), { count: increment(-1) });
      });
    } catch (e) {
      toast('err', errorText(e));
    } finally {
      setBusyId('');
    }
  }

  async function quickAdd() {
    if (!service) return;
    const parts = q.trim().split(/\s+/);
    if (!parts[0]) return;
    const ref = doc(collection(db, 'members'));
    const m: Omit<Member, 'id'> = {
      firstName: parts[0], lastName: parts.slice(1).join(' '), phone: '', email: '', gender: '', dob: '',
      category: 'adult', status: 'visitor', branchId: service.branchId, departmentIds: [], address: '',
      occupation: '', maritalStatus: '', joinedAt: today(), notes: `First visit: ${prettyDate(service.date)}`, cellId: null, source: 'checkin', membershipNo: '',
    };
    try {
      const batch = writeBatch(db);
      batch.set(ref, { ...m, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      batch.set(doc(db, 'services', serviceId, 'checkins', ref.id), { memberId: ref.id, name: `${m.firstName} ${m.lastName}`.trim(), category: 'adult', at: serverTimestamp(), by: profile?.uid });
      batch.update(doc(db, 'services', serviceId), { count: increment(1) });
      await batch.commit();
      toast('ok', `${m.firstName} added as a visitor and checked in.`);
      setQ('');
    } catch (e) {
      toast('err', errorText(e));
    }
  }

  async function bumpVisitors(delta: number) {
    if (!service || (service.visitors || 0) + delta < 0) return;
    try { await updateDoc(doc(db, 'services', serviceId), { visitors: increment(delta) }); }
    catch (e) { toast('err', errorText(e)); }
  }

  async function deleteService() {
    if (!service || !confirm('Delete this service and all its check-ins?')) return;
    try {
      const batch = writeBatch(db);
      checkins.forEach((c) => batch.delete(doc(db, 'services', serviceId, 'checkins', c.id)));
      await batch.commit();
      await deleteDoc(doc(db, 'services', serviceId));
      nav('/attendance');
    } catch (e) { toast('err', errorText(e)); }
  }

  function exportCsv() {
    if (!service) return;
    downloadCsv(`attendance-${service.date}.csv`, checkins.map((c) => ({
      Name: c.name, Group: c.category, Time: c.at ? c.at.toDate().toLocaleTimeString() : '',
    })));
  }

  if (service === undefined) return <Spinner />;
  if (service === null) return <Empty title="Service not found"><Link to="/attendance" className="text-royal-700 underline">Back to attendance</Link></Empty>;

  const canDelete = can(profile?.role, 'members.write');

  return (
    <div>
      <PageHeader
        title={service.title || service.type}
        subtitle={`${prettyDate(service.date)} · ${branchName(service.branchId)}`}
        actions={
          <>
            <Link to={`/station/${serviceId}`}><Button variant="gold"><Tablet className="h-4 w-4" /> Check-in station</Button></Link>
            {can(profile?.role, 'sms.send') && checkins.length > 0 && <Button variant="outline" onClick={() => nav(`/messages?absentees=${serviceId}`)}><MessageSquare className="h-4 w-4" /> Text absentees</Button>}
            <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4" /> Export</Button>
            {canDelete && <Button variant="ghost" className="text-red-600" onClick={deleteService} title="Delete service"><Trash2 className="h-4 w-4" /></Button>}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-4 sm:p-5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" />
              <Input
                ref={inputRef}
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) checkIn(results[0]); }}
                placeholder="Start typing a name…"
                className="!rounded-2xl !border-2 !border-gold-400 py-4 pl-12 text-base focus:!ring-gold-100"
              />
            </div>
            {q.trim() && (
              <ul className="mt-3 divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-100">
                {results.map((m) => {
                  const here = present.has(m.id);
                  return (
                    <li key={m.id}>
                      <button
                        onClick={() => checkIn(m)}
                        disabled={busyId === m.id}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-royal-50/60 disabled:opacity-60"
                      >
                        <Avatar text={initials(m.firstName, m.lastName)} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-stone-900">{m.firstName} {m.lastName}</div>
                          <div className="truncate text-xs text-stone-500">{m.phone || m.category}</div>
                        </div>
                        {here ? <span className="flex items-center gap-1 text-xs font-medium text-emerald-600"><Check className="h-4 w-4" /> Present</span>
                          : <span className="rounded-lg bg-royal-800 px-3 py-1.5 text-xs font-medium text-white">Check in</span>}
                      </button>
                    </li>
                  );
                })}
                <li>
                  <button onClick={quickAdd} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-royal-700 hover:bg-royal-50/60">
                    <UserPlus className="h-4 w-4" /> Add “{q.trim()}” as a first-time visitor
                  </button>
                </li>
              </ul>
            )}
          </Card>

          <Card>
            <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
              <h2 className="font-semibold text-stone-900">Present <span className="text-stone-400">({checkins.length})</span></h2>
            </div>
            {checkins.length === 0 ? <Empty title="No one checked in yet">Type a name above and tap to check them in.</Empty> : (
              <div className="space-y-5 p-4 sm:p-5">
                {GROUPS.map((g) => {
                  const list = checkins.filter((c) => c.category === g.key);
                  if (!list.length) return null;
                  return (
                    <div key={g.key}>
                      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-500">
                        {g.label} <span className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-600">{list.length}</span>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {list.map((c) => (
                          <div key={c.id} className="flex items-center gap-3 rounded-xl border border-stone-200 px-3 py-2.5">
                            <Avatar text={c.name.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase()} />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-stone-900">{c.name}</div>
                              <div className="text-xs text-stone-500">{c.at ? c.at.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'just now'}</div>
                            </div>
                            <button onClick={() => undo(c)} disabled={busyId === c.id} className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-red-600" aria-label="Remove">
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl bg-royal-950 p-6 text-white shadow-card">
            <div className="text-sm text-royal-300">Total in church</div>
            <div className="mt-1 font-display text-5xl font-extrabold">{(service.count || 0) + (service.visitors || 0)}</div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
              {GROUPS.map((g) => (
                <div key={g.key} className="rounded-xl bg-royal-900 py-2">
                  <div className="text-lg font-bold text-gold-400">{checkins.filter((c) => c.category === g.key).length}</div>
                  <div className="text-royal-300">{g.label}</div>
                </div>
              ))}
            </div>
          </div>
          <Card className="p-5">
            <div className="text-sm font-medium text-stone-700">Uncounted visitors</div>
            <p className="mt-1 text-xs text-stone-500">A quick head-count for guests you did not register by name.</p>
            <div className="mt-4 flex items-center justify-between">
              <Button variant="outline" onClick={() => bumpVisitors(-1)} aria-label="Minus"><Minus className="h-4 w-4" /></Button>
              <span className="font-display text-3xl font-bold text-royal-950">{service.visitors || 0}</span>
              <Button variant="outline" onClick={() => bumpVisitors(1)} aria-label="Plus"><Plus className="h-4 w-4" /></Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
