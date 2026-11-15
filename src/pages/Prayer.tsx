import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where, type Query } from 'firebase/firestore';
import { getDownloadURL, ref } from 'firebase/storage';
import { Check, Copy, HandHeart, Link2, Mic, Sparkles, Video } from 'lucide-react';
import { Badge, Button, Card, Empty, Modal, PageHeader, Select, Spinner, Textarea, cx, errorText, useToast } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { ALL, useData } from '../context/DataContext';
import { db, storage } from '../lib/firebase';
import { PRAYER_LEVELS, can, isGlobal, type PrayerLevel } from '../lib/roles';
import { publicBase, usePayments } from '../lib/settings';
import type { PrayerRequest } from '../lib/types';

export const LEVEL_LABEL: Record<PrayerLevel, string> = {
  cell_leader: 'Cell leader', dept_leader: 'Department head', branch_pastor: 'Branch pastor', associate_pastor: 'Associate Pastor', head_pastor: 'Head Pastor',
};

/** Everything the signed-in person may see, following the church hierarchy (the database rules enforce the same). */
export function usePrayerRequests() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<PrayerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const role = profile?.role;
  const key = `${role}|${profile?.branchId}|${profile?.departmentIds?.join()}|${profile?.cellIds?.join()}`;
  useEffect(() => {
    if (!profile || !can(role, 'prayer.view')) { setRequests([]); setLoading(false); return; }
    const base = collection(db, 'prayerRequests');
    const b = profile.branchId ?? '';
    const qs: Query[] = [];
    if (role === 'head_pastor') PRAYER_LEVELS.forEach((l) => qs.push(query(base, where('toLevel', '==', l.value))));
    else if (role === 'associate_pastor') PRAYER_LEVELS.filter((l) => l.value !== 'head_pastor').forEach((l) => qs.push(query(base, where('toLevel', '==', l.value))));
    else if (role === 'branch_pastor') (['cell_leader', 'dept_leader', 'branch_pastor'] as const).forEach((l) => qs.push(query(base, where('toLevel', '==', l), where('branchId', '==', b))));
    else if (role === 'secretary') (['cell_leader', 'dept_leader'] as const).forEach((l) => qs.push(query(base, where('toLevel', '==', l), where('branchId', '==', b))));
    else if (role === 'dept_leader') (profile.departmentIds ?? []).forEach((d) => qs.push(query(base, where('toLevel', '==', 'dept_leader'), where('branchId', '==', b), where('departmentId', '==', d))));
    else if (role === 'cell_leader') (profile.cellIds ?? []).forEach((c) => qs.push(query(base, where('toLevel', '==', 'cell_leader'), where('branchId', '==', b), where('cellId', '==', c))));
    if (!qs.length) { setRequests([]); setLoading(false); return; }
    const parts = new Map<number, PrayerRequest[]>();
    const unsubs = qs.map((q, i) => onSnapshot(q, (s) => {
      parts.set(i, s.docs.map((d) => ({ id: d.id, ...d.data() }) as PrayerRequest));
      const all = [...parts.values()].flat();
      all.sort((x, y) => (y.createdAt?.toDate().getTime() ?? Date.now()) - (x.createdAt?.toDate().getTime() ?? Date.now()));
      setRequests(all);
      if (parts.size === qs.length) setLoading(false);
    }, (e) => { console.error('prayer', e); parts.set(i, []); if (parts.size === qs.length) setLoading(false); }));
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { requests, loading };
}

function Media({ path, url: direct, type }: { path: string; url?: string; type: PrayerRequest['mediaType'] }) {
  const [url, setUrl] = useState(direct ?? '');
  const [err, setErr] = useState('');
  useEffect(() => { if (!direct && path) getDownloadURL(ref(storage, path)).then(setUrl).catch((e) => setErr(errorText(e))); }, [path, direct]);
  if (err) return <p className="text-xs text-red-600">Could not load the recording: {err}</p>;
  if (!url) return <p className="text-xs text-stone-400">Loading recording…</p>;
  return type === 'video' ? <video src={url} controls className="mt-2 max-h-64 w-full rounded-xl bg-black" /> : <audio src={url} controls className="mt-2 w-full" />;
}

export function PrayerCard({ r, compact, onLink }: { r: PrayerRequest; compact?: boolean; onLink?: (r: PrayerRequest) => void }) {
  const { branchName, deptName, cellName } = useData();
  const toast = useToast();
  const [answering, setAnswering] = useState(false);
  const [note, setNote] = useState(r.answerNote ?? '');
  async function set(status: PrayerRequest['status'], extra: object = {}) {
    try { await updateDoc(doc(db, 'prayerRequests', r.id), { status, ...extra, updatedAt: serverTimestamp() }); setAnswering(false); }
    catch (e) { toast('err', errorText(e)); }
  }
  const when = r.createdAt ? r.createdAt.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  return (
    <div className={cx('rounded-xl border p-3', r.kind === 'testimony' ? 'border-gold-200 bg-gold-50/40' : r.status === 'answered' ? 'border-emerald-200 bg-emerald-50/40' : 'border-stone-200 bg-white')}>
      <div className="flex flex-wrap items-center gap-2">
        {!compact && <span className="font-medium text-stone-900">{r.name || 'Anonymous'}</span>}
        {r.kind === 'testimony' ? <Badge color="gold">testimony</Badge> : <Badge color={r.status === 'answered' ? 'green' : r.status === 'praying' ? 'blue' : 'gray'}>{r.status === 'new' ? 'new' : r.status}</Badge>}
        {r.mediaType === 'audio' && <Mic className="h-3.5 w-3.5 text-stone-400" />}
        {r.mediaType === 'video' && <Video className="h-3.5 w-3.5 text-stone-400" />}
        <span className="ml-auto text-[11px] text-stone-400">{when}</span>
      </div>
      {!compact && <div className="mt-0.5 text-xs text-stone-500">{r.phone} · {branchName(r.branchId)} · to {LEVEL_LABEL[r.toLevel]}{r.departmentId ? ` (${deptName(r.departmentId)})` : ''}{r.cellId ? ` (${cellName(r.cellId)})` : ''}</div>}
      {r.text && <p className="mt-2 whitespace-pre-line text-sm text-stone-700">{r.text}</p>}
      {(r.mediaPath || r.mediaUrl) && <Media path={r.mediaPath} url={r.mediaUrl} type={r.mediaType} />}
      {r.answerNote && <p className="mt-2 rounded-lg bg-emerald-50 px-2 py-1 text-xs text-emerald-800">🙌 {r.answerNote}</p>}
      {!compact && r.kind === 'prayer' && (
        <div className="mt-3 flex flex-wrap gap-2">
          {r.status === 'new' && <Button size="sm" variant="outline" onClick={() => set('praying')}><HandHeart className="h-3.5 w-3.5" /> Praying</Button>}
          {r.status !== 'answered' && <Button size="sm" variant="outline" onClick={() => setAnswering(true)}><Check className="h-3.5 w-3.5" /> Answered</Button>}
          {onLink && <Button size="sm" variant="ghost" onClick={() => onLink(r)}><Link2 className="h-3.5 w-3.5" /> {r.memberId ? 'Linked' : 'Link to member'}</Button>}
        </div>
      )}
      {!compact && r.kind === 'testimony' && onLink && <div className="mt-3"><Button size="sm" variant="ghost" onClick={() => onLink(r)}><Link2 className="h-3.5 w-3.5" /> {r.memberId ? 'Linked' : 'Link to member'}</Button></div>}
      {answering && (
        <Modal open onClose={() => setAnswering(false)} title="Prayer answered 🙌">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="How did God answer? (shows on their member page)" />
          <div className="mt-3 flex justify-end"><Button onClick={() => set('answered', { answerNote: note.trim() })}>Save</Button></div>
        </Modal>
      )}
    </div>
  );
}

export default function Prayer() {
  const { profile } = useAuth();
  const { requests, loading } = usePrayerRequests();
  const { members, scope } = useData();
  const toast = useToast();
  const payments = usePayments();
  const [tab, setTab] = useState<'open' | 'answered' | 'testimony'>('open');
  const [linking, setLinking] = useState<PrayerRequest | null>(null);
  const [pick, setPick] = useState('');
  const shown = useMemo(() => requests
    .filter((r) => !isGlobal(profile?.role) || scope === ALL || r.branchId === scope)
    .filter((r) => (tab === 'testimony' ? r.kind === 'testimony' : r.kind === 'prayer' && (tab === 'answered' ? r.status === 'answered' : r.status !== 'answered'))), [requests, tab, scope, profile?.role]);
  const link = `${publicBase(payments)}/prayer`;

  function suggest(r: PrayerRequest) {
    const k = (r.phone || '').replace(/\D/g, '').slice(-9);
    return members.find((m) => k.length === 9 && (m.phone || '').replace(/\D/g, '').slice(-9) === k);
  }

  async function saveLink() {
    if (!linking) return;
    try { await updateDoc(doc(db, 'prayerRequests', linking.id), { memberId: pick, updatedAt: serverTimestamp() }); toast('ok', 'Linked to member.'); setLinking(null); }
    catch (e) { toast('err', errorText(e)); }
  }

  return (
    <div>
      <PageHeader title="Prayer requests & testimonies" subtitle="Sent by members by text, voice note or video. You only see those addressed to you or to people under you."
        actions={<Button variant="outline" onClick={() => { navigator.clipboard.writeText(link); toast('ok', 'Link copied — share it in WhatsApp groups.'); }}><Copy className="h-4 w-4" /> Copy form link</Button>} />
      <div className="mb-4 flex gap-1 rounded-2xl border border-stone-200 bg-white p-1">
        {([['open', 'Prayer requests'], ['answered', 'Answered'], ['testimony', 'Testimonies']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cx('rounded-xl px-4 py-2 text-sm font-medium', tab === k ? 'bg-royal-800 text-white' : 'text-stone-600 hover:bg-stone-100')}>
            {l} <span className="opacity-60">({requests.filter((r) => (k === 'testimony' ? r.kind === 'testimony' : r.kind === 'prayer' && (k === 'answered' ? r.status === 'answered' : r.status !== 'answered'))).length})</span>
          </button>
        ))}
      </div>
      {loading ? <Spinner /> : shown.length === 0 ? (
        <Card><Empty icon={tab === 'testimony' ? <Sparkles /> : <HandHeart />} title="Nothing here yet">Share the prayer form link from Sign-ups (it has a QR code), or with the button above.</Empty></Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">{shown.map((r) => <PrayerCard key={r.id} r={r} onLink={(x) => { setLinking(x); setPick(x.memberId || suggest(x)?.id || ''); }} />)}</div>
      )}
      {linking && (
        <Modal open onClose={() => setLinking(null)} title="Link to a member">
          <p className="mb-3 text-sm text-stone-500">It will then show on their member page. {suggest(linking) && <>Matched by phone: <b>{suggest(linking)!.firstName} {suggest(linking)!.lastName}</b>.</>}</p>
          <Select value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">— not linked —</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.firstName} {m.lastName} {m.phone && `· ${m.phone}`}</option>)}
          </Select>
          <div className="mt-4 flex justify-end"><Button onClick={saveLink}>Save</Button></div>
        </Modal>
      )}
    </div>
  );
}
