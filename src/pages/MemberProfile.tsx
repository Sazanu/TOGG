import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { addDoc, collection, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { ArrowLeft, BellRing, Check, HandHeart, Home, Lock, MessageCircleHeart, Pencil, Phone, Sparkles, Wallet } from 'lucide-react';
import { Avatar, Badge, Button, Card, Empty, Field, Input, Modal, Select, Spinner, Textarea, cx, errorText, useToast } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { db } from '../lib/firebase';
import { GIVING_TYPES, MONTHS, ageFrom, initials, labelOf, money, prettyDate, shortDate, today } from '../lib/format';
import { ASSESS_AREAS, ASSESS_LABEL } from '../lib/pastoral';
import { can } from '../lib/roles';
import { usePrayerRequests, PrayerCard } from './Prayer';
import type { Assessment, Gift, Member, PastorNote, Service } from '../lib/types';
import { MemberForm } from './Members';

export default function MemberProfile() {
  const { id = '' } = useParams();
  const { profile } = useAuth();
  const { memberById, membersLoading, branchName, deptName, cellName } = useData();
  const role = profile?.role;
  const m = memberById.get(id);
  const [editing, setEditing] = useState(false);
  const canEdit = !!m && (can(role, 'members.write') || (role === 'dept_leader' && m.departmentIds.some((d) => profile?.departmentIds.includes(d))));

  if (membersLoading) return <Spinner />;
  if (!m) return <Empty title="Member not found">They may be in a branch you cannot see. <Link to="/members" className="text-royal-700 underline">Back to members</Link></Empty>;

  const facts: [string, string][] = [
    ['Membership no.', m.membershipNo || '—'], ['Phone', m.phone || '—'], ['Email', m.email || '—'],
    ['Gender', m.gender || '—'], ['Date of birth', m.dob ? `${prettyDate(m.dob)} (${ageFrom(m.dob)} yrs)` : '—'], ['Marital status', m.maritalStatus || '—'],
    ['Occupation', m.occupation || '—'], ['Address / area', m.address || '—'], ['Joined', prettyDate(m.joinedAt)], ['Branch', branchName(m.branchId)],
  ];

  return (
    <div>
      <Link to="/members" className="mb-4 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-royal-700"><ArrowLeft className="h-4 w-4" /> Members</Link>
      <Card className="mb-6 overflow-hidden">
        <div className="flex flex-col gap-4 bg-royal-950 p-6 text-white sm:flex-row sm:items-center">
          <Avatar text={initials(m.firstName, m.lastName)} className="!h-16 !w-16 bg-gold-400 !text-xl text-royal-950" />
          <div className="flex-1">
            <h1 className="font-display text-2xl font-bold">{m.title && <span className="text-royal-300">{m.title} </span>}{m.firstName} {m.lastName}</h1>
            <div className="mt-1 flex flex-wrap gap-2 text-sm text-royal-200">
              {m.membershipNo && <span className="font-mono text-gold-300">{m.membershipNo}</span>}
              <span>{branchName(m.branchId)}</span>
              <Badge color={m.status === 'active' ? 'green' : m.status === 'visitor' ? 'gold' : 'gray'}>{m.status === 'inactive' ? 'not active' : m.status}</Badge>
            </div>
          </div>
          <div className="flex gap-2">
            {m.phone && <a href={`tel:${m.phone}`}><Button variant="gold" size="sm"><Phone className="h-4 w-4" /> Call</Button></a>}
            {canEdit && <Button size="sm" variant="outline" className="!bg-white" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Edit</Button>}
          </div>
        </div>
        <dl className="grid gap-x-6 gap-y-3 p-6 text-sm sm:grid-cols-2 lg:grid-cols-5">
          {facts.map(([k, v]) => <div key={k}><dt className="text-xs text-stone-500">{k}</dt><dd className="font-medium text-stone-800">{v}</dd></div>)}
        </dl>
        <div className="flex flex-wrap gap-2 border-t border-stone-100 px-6 py-4">
          {m.departmentIds.length === 0 && !m.cellId && <span className="text-sm text-stone-400">Not in a department or cell yet.</span>}
          {m.departmentIds.map((d) => <Link key={d} to={`/departments/${d}`}><Badge color="royal">{deptName(d)}</Badge></Link>)}
          {m.cellId && <Link to={`/cells/${m.cellId}`}><Badge color="blue"><Home className="mr-1 h-3 w-3" /> Cell: {cellName(m.cellId)}</Badge></Link>}
          {m.notes && <p className="mt-2 w-full whitespace-pre-line text-sm text-stone-600">{m.notes}</p>}
        </div>
      </Card>

      {role === 'head_pastor' && <PastoralPanel member={m} />}

      <div className="grid gap-6 lg:grid-cols-2">
        {can(role, 'attendance.write') && <AttendanceHistory member={m} />}
        {can(role, 'giving.read') && <GivingHistory member={m} />}
        {can(role, 'prayer.view') && <MemberPrayers member={m} />}
      </div>

      {editing && <MemberForm member={m} defaultBranch={m.branchId} lockBranch={!!profile?.branchId} onClose={() => setEditing(false)} />}
    </div>
  );
}

function AttendanceHistory({ member }: { member: Member }) {
  const [rows, setRows] = useState<{ s: Service; present: boolean }[] | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      const snap = await getDocs(query(collection(db, 'services'), where('branchId', '==', member.branchId)));
      const svcs = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Service).filter((s) => s.date >= member.joinedAt || !member.joinedAt)
        .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
      const marks = await Promise.all(svcs.map(async (s) => ({ s, present: (await getDoc(doc(db, 'services', s.id, 'checkins', member.id))).exists() })));
      if (live) setRows(marks);
    })().catch(() => live && setRows([]));
    return () => { live = false; };
  }, [member.id, member.branchId, member.joinedAt]);
  const pct = rows && rows.length ? Math.round((rows.filter((r) => r.present).length / rows.length) * 100) : null;
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold text-stone-900">Attendance</h2>
        {pct !== null && <Badge color={pct >= 75 ? 'green' : pct >= 50 ? 'gold' : 'red'}>{pct}% of last {rows!.length} services</Badge>}
      </div>
      {!rows ? <Spinner /> : rows.length === 0 ? <p className="text-sm text-stone-400">No services recorded since they joined.</p> : (
        <div className="flex flex-wrap gap-2">
          {rows.map(({ s, present }) => (
            <div key={s.id} title={`${s.title || s.type} · ${prettyDate(s.date)}`} className={cx('flex w-16 flex-col items-center rounded-xl border px-1 py-2 text-[11px]', present ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-100 bg-red-50 text-red-500')}>
              {present ? <Check className="h-4 w-4" /> : <span className="h-4 font-bold">✕</span>}
              <span>{shortDate(s.date)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function GivingHistory({ member }: { member: Member }) {
  const [gifts, setGifts] = useState<Gift[] | null>(null);
  const year = new Date().getFullYear();
  useEffect(() => onSnapshot(query(collection(db, 'giving'), where('branchId', '==', member.branchId), where('memberId', '==', member.id)),
    (s) => setGifts(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Gift).sort((a, b) => b.date.localeCompare(a.date))), () => setGifts([])), [member.id, member.branchId]);
  const tithesByMonth = useMemo(() => MONTHS.map((_, i) => (gifts ?? []).filter((g) => g.type === 'tithe' && g.date.startsWith(`${year}-${String(i + 1).padStart(2, '0')}`)).reduce((t, g) => t + g.amount, 0)), [gifts, year]);
  const totals = useMemo(() => {
    const mp = new Map<string, number>();
    (gifts ?? []).filter((g) => g.date.startsWith(String(year))).forEach((g) => mp.set(g.type, (mp.get(g.type) ?? 0) + g.amount));
    return [...mp.entries()].sort((a, b) => b[1] - a[1]);
  }, [gifts, year]);
  return (
    <Card className="p-5">
      <h2 className="mb-4 flex items-center gap-2 font-semibold text-stone-900"><Wallet className="h-4 w-4 text-gold-600" /> Tithe &amp; giving · {year}</h2>
      {!gifts ? <Spinner /> : (
        <>
          <div className="mb-4 grid grid-cols-6 gap-1.5">
            {MONTHS.map((mo, i) => (
              <div key={mo} className={cx('rounded-lg py-1.5 text-center text-[11px]', tithesByMonth[i] ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-50 text-stone-400')}>
                <div>{mo.slice(0, 3)}</div><div className="font-semibold">{tithesByMonth[i] ? Math.round(tithesByMonth[i]) : '—'}</div>
              </div>
            ))}
          </div>
          {totals.length === 0 ? <p className="text-sm text-stone-400">No giving recorded this year.</p> : (
            <ul className="space-y-1.5 text-sm">
              {totals.map(([t, v]) => <li key={t} className="flex justify-between"><span className="text-stone-600">{labelOf(GIVING_TYPES, t as never)}</span><b>{money(v)}</b></li>)}
            </ul>
          )}
          {gifts.length > 0 && (
            <details className="mt-3 text-sm"><summary className="cursor-pointer text-royal-700">All {gifts.length} records</summary>
              <ul className="mt-2 max-h-56 divide-y divide-stone-100 overflow-y-auto">
                {gifts.map((g) => <li key={g.id} className="flex justify-between py-1.5"><span className="text-stone-600">{prettyDate(g.date)} · {labelOf(GIVING_TYPES, g.type)}</span><span>{money(g.amount)}</span></li>)}
              </ul>
            </details>
          )}
        </>
      )}
    </Card>
  );
}

function MemberPrayers({ member }: { member: Member }) {
  const { requests } = usePrayerRequests();
  const key = (member.phone || '').replace(/\D/g, '').slice(-9);
  const mine = requests.filter((r) => r.memberId === member.id || (key.length === 9 && r.phoneKey === key));
  const prayers = mine.filter((r) => r.kind === 'prayer' && r.status !== 'answered');
  const answered = mine.filter((r) => r.kind === 'prayer' && r.status === 'answered');
  const testimonies = mine.filter((r) => r.kind === 'testimony');
  return (
    <Card className="p-5 lg:col-span-2">
      <h2 className="mb-4 flex items-center gap-2 font-semibold text-stone-900"><MessageCircleHeart className="h-4 w-4 text-royal-600" /> Prayer requests &amp; testimonies</h2>
      {mine.length === 0 ? <p className="text-sm text-stone-400">None that you can see.</p> : (
        <div className="grid gap-4 md:grid-cols-3">
          {([['Prayer requests', prayers, <HandHeart key="a" className="h-4 w-4" />], ['Answered prayers', answered, <Check key="b" className="h-4 w-4" />], ['Testimonies', testimonies, <Sparkles key="c" className="h-4 w-4" />]] as const).map(([title, list, icon]) => (
            <div key={title}>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500">{icon}{title} ({list.length})</h3>
              <div className="space-y-2">{list.map((r) => <PrayerCard key={r.id} r={r} compact />)}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/** Head Pastor only: private ratings and reminders that surface on the dashboard. */
function PastoralPanel({ member }: { member: Member }) {
  const { profile } = useAuth();
  const toast = useToast();
  const [notes, setNotes] = useState<PastorNote[]>([]);
  const [remind, setRemind] = useState(false);
  useEffect(() => onSnapshot(query(collection(db, 'pastorNotes'), where('memberId', '==', member.id)),
    (s) => setNotes(s.docs.map((d) => ({ id: d.id, ...d.data() }) as PastorNote)), (e) => console.error(e)), [member.id]);
  const name = `${member.firstName} ${member.lastName}`;

  async function rate(area: string, rating: Assessment) {
    try {
      const id = `${member.id}_${area.replace(/[^a-z]/gi, '')}`;
      const cur = notes.find((n) => n.id === id);
      await setDoc(doc(db, 'pastorNotes', id), {
        memberId: member.id, memberName: name, area, rating, note: cur?.note ?? '', remindOn: cur?.remindOn ?? '',
        done: rating !== 'needs_improvement' && !cur?.remindOn, by: profile?.uid, updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch (e) { toast('err', errorText(e)); }
  }
  async function setNote(n: PastorNote, note: string) {
    try { await updateDoc(doc(db, 'pastorNotes', n.id), { note }); } catch (e) { toast('err', errorText(e)); }
  }
  const reminders = notes.filter((n) => !n.rating);

  return (
    <Card className="mb-6 border-gold-200">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gold-100 bg-gold-50/60 px-5 py-3">
        <h2 className="flex items-center gap-2 font-semibold text-stone-900"><Lock className="h-4 w-4 text-gold-600" /> Pastoral assessment <span className="text-xs font-normal text-stone-500">— only you can see this</span></h2>
        <Button size="sm" variant="outline" onClick={() => setRemind(true)}><BellRing className="h-4 w-4" /> Remind me</Button>
      </div>
      <div className="divide-y divide-stone-100">
        {ASSESS_AREAS.map((area) => {
          const n = notes.find((x) => x.area === area && x.rating);
          return (
            <div key={area} className="flex flex-col gap-2 px-5 py-3 md:flex-row md:items-center">
              <span className="w-44 text-sm font-medium text-stone-700">{area}</span>
              <div className="flex gap-1">
                {(['good', 'fair', 'needs_improvement'] as Assessment[]).map((r) => (
                  <button key={r} onClick={() => rate(area, r)}
                    className={cx('rounded-lg border px-2.5 py-1 text-xs', n?.rating === r ? (r === 'good' ? 'border-emerald-500 bg-emerald-500 text-white' : r === 'fair' ? 'border-gold-500 bg-gold-500 text-white' : 'border-red-500 bg-red-500 text-white') : 'border-stone-200 text-stone-600 hover:bg-stone-50')}>
                    {ASSESS_LABEL[r]}
                  </button>
                ))}
              </div>
              {n && <Input defaultValue={n.note} placeholder="Note (optional)" className="!py-1.5 md:flex-1" onBlur={(e) => e.target.value !== n.note && setNote(n, e.target.value)} />}
            </div>
          );
        })}
      </div>
      {reminders.length > 0 && (
        <div className="border-t border-stone-100 px-5 py-3">
          <h3 className="mb-2 text-xs font-semibold uppercase text-stone-500">Reminders</h3>
          <ul className="space-y-1 text-sm">
            {reminders.map((r) => (
              <li key={r.id} className={cx('flex items-center gap-2', r.done && 'text-stone-400 line-through')}>
                <BellRing className="h-3.5 w-3.5" /> {prettyDate(r.remindOn)} — {r.area}{r.note && `: ${r.note}`}
                {!r.done && <button className="ml-auto text-xs text-royal-700 hover:underline" onClick={() => updateDoc(doc(db, 'pastorNotes', r.id), { done: true })}>Done</button>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="border-t border-stone-100 px-5 py-2 text-xs text-stone-500">Anything marked <b>Needs improvement</b> and every reminder that is due appears on your dashboard under “For your attention”.</p>
      {remind && <ReminderForm memberId={member.id} memberName={name} onClose={() => setRemind(false)} />}
    </Card>
  );
}

export function ReminderForm({ memberId, memberName, onClose }: { memberId: string; memberName: string; onClose: () => void }) {
  const { profile } = useAuth();
  const toast = useToast();
  const [area, setArea] = useState(memberId ? ASSESS_AREAS[0] : '');
  const [note, setNote] = useState('');
  const [on, setOn] = useState(today());
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      await addDoc(collection(db, 'pastorNotes'), { memberId, memberName, area: area.trim(), rating: null, note: note.trim(), remindOn: on, done: false, by: profile?.uid, createdAt: serverTimestamp() });
      toast('ok', `I will remind you on ${prettyDate(on)}.`); onClose();
    } catch (err) { toast('err', errorText(err)); setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={memberName ? `Reminder about ${memberName}` : 'New reminder'}>
      <form onSubmit={save} className="space-y-4">
        {memberId ? (
          <Field label="Area"><Select value={area} onChange={(e) => setArea(e.target.value)}>{ASSESS_AREAS.map((a) => <option key={a}>{a}</option>)}<option>Follow-up visit</option><option>Other</option></Select></Field>
        ) : (
          <Field label="What should I remind you about?"><Input required value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. Check roofing project progress, Women's ministry budget" /></Field>
        )}
        <Field label="Note"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <Field label="Show it on my dashboard from"><Input type="date" required value={on} onChange={(e) => setOn(e.target.value)} /></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy}>Save reminder</Button></div>
      </form>
    </Modal>
  );
}
