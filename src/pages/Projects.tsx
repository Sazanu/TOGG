import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { addDoc, collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { QRCodeSVG } from 'qrcode.react';
import { CheckCircle2, Circle, Copy, Hammer, Pencil, Plus, Share2, Trash2 } from 'lucide-react';
import { HowToPay } from '../components/HowToPay';
import { FullLogo } from '../components/Logo';
import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Spinner, Textarea, cx, errorText, useToast } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { db } from '../lib/firebase';
import { money, moneyShort, prettyDate, today } from '../lib/format';
import { can, isGlobal } from '../lib/roles';
import { publicBase, usePayments } from '../lib/settings';
import type { Gift, Milestone, Project } from '../lib/types';
import { RecordGift } from './Giving';

export function useProjects() {
  const [list, setList] = useState<Project[] | null>(null);
  useEffect(() => onSnapshot(collection(db, 'projects'), (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Project).sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''))), () => setList([])), []);
  return list;
}

export function Thermometer({ p, big }: { p: Project; big?: boolean }) {
  const pct = p.goal ? Math.min(100, Math.round((p.raised / p.goal) * 100)) : 0;
  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <div className={cx('font-display font-extrabold text-royal-950', big ? 'text-3xl sm:text-4xl' : 'text-2xl')}>{money(p.raised)}</div>
          <div className="text-sm text-stone-500">raised of {money(p.goal)} goal</div>
        </div>
        <div className={cx('font-display font-bold text-gold-600', big ? 'text-3xl' : 'text-xl')}>{pct}%</div>
      </div>
      <div className={cx('mt-3 overflow-hidden rounded-full bg-stone-100', big ? 'h-5' : 'h-3')}>
        <div className="h-full rounded-full bg-gradient-to-r from-gold-400 to-gold-600 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-stone-500">
        <span>{p.donors} contribution{p.donors === 1 ? '' : 's'}</span>
        <span className="flex items-center gap-1"><Hammer className="h-3.5 w-3.5" /> Work done: <b className="text-royal-700">{p.progress}%</b></span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-royal-500" style={{ width: `${p.progress}%` }} /></div>
    </div>
  );
}

export default function Projects() {
  const { profile } = useAuth();
  const list = useProjects();
  const [editing, setEditing] = useState<Project | 'new' | null>(null);
  const manage = can(profile?.role, 'projects.manage');
  return (
    <div>
      <PageHeader title="Church projects" subtitle="Raise money for building and other projects, and show the church how far the work has gone."
        actions={manage && <Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> New project</Button>} />
      {!list ? <Spinner /> : list.length === 0 ? (
        <Card><Empty icon={<Hammer />} title="No projects yet">For example: “Roofing the church building — GH₵250,000”. Add milestones like “Buy roofing sheets” and post progress updates.</Empty></Card>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {list.map((p) => (
            <Link key={p.id} to={`/projects/${p.id}`}>
              <Card className="h-full p-5 transition hover:border-royal-300">
                <div className="mb-2 flex items-center gap-2">
                  <Badge color={p.status === 'completed' ? 'green' : p.status === 'paused' ? 'gray' : 'gold'}>{p.status}</Badge>
                  {p.public && <Badge color="blue">public page</Badge>}
                </div>
                <h3 className="font-display text-lg font-bold text-royal-950">{p.title}</h3>
                <p className="mb-4 line-clamp-2 text-sm text-stone-500">{p.description}</p>
                <Thermometer p={p} />
              </Card>
            </Link>
          ))}
        </div>
      )}
      {editing && <ProjectForm project={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ProjectForm({ project, onClose }: { project: Project | null; onClose: () => void }) {
  const toast = useToast();
  const [d, setD] = useState({
    title: project?.title ?? '', description: project?.description ?? '', goal: project?.goal ?? 0, startDate: project?.startDate ?? today(),
    targetDate: project?.targetDate ?? '', public: project?.public ?? true, status: project?.status ?? 'active',
  });
  const [milestones, setMilestones] = useState<Milestone[]>(project?.milestones ?? []);
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      const data = { ...d, goal: Number(d.goal) || 0, milestones: milestones.filter((m) => m.title.trim()), updatedAt: serverTimestamp() };
      if (project) await updateDoc(doc(db, 'projects', project.id), data);
      else await addDoc(collection(db, 'projects'), { ...data, raised: 0, donors: 0, progress: 0, updates: [], createdAt: serverTimestamp() });
      toast('ok', 'Project saved.'); onClose();
    } catch (err) { toast('err', errorText(err)); setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={project ? 'Edit project' : 'New project'} wide>
      <form onSubmit={save} className="space-y-4">
        <Field label="Project name"><Input required value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="e.g. Roofing the church building" /></Field>
        <Field label="Description"><Textarea rows={3} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} /></Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Goal (GH₵)"><Input required type="number" min={1} value={d.goal || ''} onChange={(e) => setD({ ...d, goal: Number(e.target.value) })} /></Field>
          <Field label="Start"><Input type="date" value={d.startDate} onChange={(e) => setD({ ...d, startDate: e.target.value })} /></Field>
          <Field label="Target finish"><Input type="date" value={d.targetDate} onChange={(e) => setD({ ...d, targetDate: e.target.value })} /></Field>
        </div>
        <div>
          <span className="mb-2 block text-sm font-medium text-stone-700">Milestones</span>
          <div className="space-y-2">
            {milestones.map((m, i) => (
              <div key={i} className="flex gap-2">
                <Input value={m.title} onChange={(e) => setMilestones(milestones.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} placeholder="e.g. Buy roofing sheets" />
                <button type="button" onClick={() => setMilestones(milestones.filter((_, j) => j !== i))} className="px-2 text-stone-400 hover:text-red-600" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => setMilestones([...milestones, { title: '', done: false, doneOn: '' }])}><Plus className="h-4 w-4" /> Add milestone</Button>
        </div>
        <div className="flex flex-wrap gap-6 text-sm text-stone-700">
          <label className="flex items-center gap-2"><input type="checkbox" checked={d.public} onChange={(e) => setD({ ...d, public: e.target.checked })} className="rounded border-stone-300" /> Public page people can open and share</label>
          <label className="flex items-center gap-2">Status
            <select value={d.status} onChange={(e) => setD({ ...d, status: e.target.value as Project['status'] })} className="rounded-lg border border-stone-300 px-2 py-1"><option value="active">Active</option><option value="paused">Paused</option><option value="completed">Completed</option></select>
          </label>
        </div>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy}>Save</Button></div>
      </form>
    </Modal>
  );
}

export function ProjectDetail() {
  const { id = '' } = useParams();
  const { profile } = useAuth();
  const { branchName } = useData();
  const toast = useToast();
  const payments = usePayments();
  const [p, setP] = useState<Project | null | undefined>(undefined);
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [editing, setEditing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [update, setUpdate] = useState({ text: '', percent: 0 });
  const [sharing, setSharing] = useState(false);
  const manage = can(profile?.role, 'projects.manage');
  const canRecord = can(profile?.role, 'giving.write');

  useEffect(() => onSnapshot(doc(db, 'projects', id), (s) => setP(s.exists() ? ({ id: s.id, ...s.data() } as Project) : null), () => setP(null)), [id]);
  useEffect(() => {
    if (!can(profile?.role, 'giving.read')) return;
    const base = collection(db, 'giving');
    const q = isGlobal(profile?.role) ? query(base, where('projectId', '==', id)) : query(base, where('projectId', '==', id), where('branchId', '==', profile?.branchId ?? ''));
    return onSnapshot(q, (s) => setGifts(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Gift).sort((a, b) => b.date.localeCompare(a.date))), () => setGifts([]));
  }, [id, profile?.role, profile?.branchId]);
  const top = useMemo(() => gifts.slice(0, 50), [gifts]);

  if (p === undefined) return <Spinner />;
  if (p === null) return <Empty title="Project not found"><Link to="/projects" className="text-royal-700 underline">Back</Link></Empty>;
  const link = `${publicBase(payments)}/give/${p.id}`;

  async function toggle(i: number) {
    try { await updateDoc(doc(db, 'projects', p!.id), { milestones: p!.milestones.map((m, j) => (j === i ? { ...m, done: !m.done, doneOn: !m.done ? today() : '' } : m)) }); }
    catch (e) { toast('err', errorText(e)); }
  }
  async function postUpdate(e: FormEvent) {
    e.preventDefault();
    if (!update.text.trim()) return;
    try {
      const pct = Math.max(0, Math.min(100, Number(update.percent) || p!.progress));
      await updateDoc(doc(db, 'projects', p!.id), { updates: [{ date: today(), text: update.text.trim(), percent: pct }, ...(p!.updates ?? [])], progress: pct });
      setUpdate({ text: '', percent: 0 }); toast('ok', 'Progress update posted.');
    } catch (err) { toast('err', errorText(err)); }
  }

  return (
    <div>
      <PageHeader title={p.title} subtitle={`Started ${prettyDate(p.startDate)}${p.targetDate ? ` · target ${prettyDate(p.targetDate)}` : ''}`}
        actions={<>
          {p.public && <Button variant="outline" onClick={() => setSharing(true)}><Share2 className="h-4 w-4" /> Share</Button>}
          {manage && <Button variant="outline" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Edit</Button>}
          {canRecord && <Button variant="gold" onClick={() => setRecording(true)}><Plus className="h-4 w-4" /> Record contribution</Button>}
        </>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-6"><Thermometer p={p} big />{p.description && <p className="mt-5 whitespace-pre-line text-sm text-stone-600">{p.description}</p>}</Card>
          <Card className="p-5">
            <h2 className="mb-4 font-semibold text-stone-900">Progress updates</h2>
            {manage && (
              <form onSubmit={postUpdate} className="mb-5 grid gap-2 sm:grid-cols-[1fr_7rem_auto]">
                <Input value={update.text} onChange={(e) => setUpdate({ ...update, text: e.target.value })} placeholder="e.g. Trusses are up, sheets arrive next week" />
                <Input type="number" min={0} max={100} value={update.percent || ''} onChange={(e) => setUpdate({ ...update, percent: Number(e.target.value) })} placeholder="% done" />
                <Button type="submit">Post</Button>
              </form>
            )}
            {(p.updates ?? []).length === 0 ? <p className="text-sm text-stone-400">No updates yet.</p> : (
              <ol className="relative space-y-4 border-l-2 border-royal-100 pl-5">
                {p.updates.map((u, i) => (
                  <li key={i}><span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full bg-royal-500" />
                    <div className="text-xs text-stone-500">{prettyDate(u.date)} · {u.percent}% done</div><p className="text-sm text-stone-800">{u.text}</p></li>
                ))}
              </ol>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-3 font-semibold text-stone-900">Milestones</h2>
            {p.milestones.length === 0 ? <p className="text-sm text-stone-400">None set.</p> : (
              <ul className="space-y-2">
                {p.milestones.map((m, i) => (
                  <li key={i}>
                    <button disabled={!manage} onClick={() => toggle(i)} className="flex w-full items-start gap-2 text-left text-sm">
                      {m.done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" /> : <Circle className="h-5 w-5 shrink-0 text-stone-300" />}
                      <span className={m.done ? 'text-stone-400 line-through' : 'text-stone-800'}>{m.title}{m.doneOn && <span className="ml-1 text-xs no-underline">({prettyDate(m.doneOn)})</span>}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {can(profile?.role, 'giving.read') && (
            <Card className="p-5">
              <h2 className="mb-3 font-semibold text-stone-900">Contributions {!isGlobal(profile?.role) && <span className="text-xs font-normal text-stone-500">({branchName(profile?.branchId)})</span>}</h2>
              {top.length === 0 ? <p className="text-sm text-stone-400">None recorded yet.</p> : (
                <ul className="max-h-80 divide-y divide-stone-100 overflow-y-auto text-sm">
                  {top.map((g) => <li key={g.id} className="flex justify-between py-1.5"><span className="truncate text-stone-700">{g.memberName || 'Anonymous'} <span className="text-xs text-stone-400">{prettyDate(g.date)}</span></span><b className="text-emerald-700">{moneyShort(g.amount)}</b></li>)}
                </ul>
              )}
            </Card>
          )}
        </div>
      </div>
      {editing && <ProjectForm project={p} onClose={() => setEditing(false)} />}
      {recording && <RecordGift onClose={() => setRecording(false)} preset={{ type: 'project', projectId: p.id }} />}
      {sharing && (
        <Modal open onClose={() => setSharing(false)} title="Share this project">
          <div className="flex flex-col items-center text-center">
            <div className="rounded-2xl border border-stone-200 p-4"><QRCodeSVG value={link} size={220} fgColor="#0a2b40" /></div>
            <p className="mt-3 break-all text-xs text-stone-500">{link}</p>
            <Button variant="outline" className="mt-3" onClick={() => { navigator.clipboard.writeText(`${p.title} — help us reach ${money(p.goal)}. ${link}`); toast('ok', 'Copied — paste it in WhatsApp.'); }}><Copy className="h-4 w-4" /> Copy message</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Public page, like a fundraising page: progress, milestones, updates and how to give. */
export function PublicProject() {
  const { id = '' } = useParams();
  const payments = usePayments();
  const [p, setP] = useState<Project | null | undefined>(undefined);
  useEffect(() => onSnapshot(doc(db, 'projects', id), (s) => setP(s.exists() ? ({ id: s.id, ...s.data() } as Project) : null), () => setP(null)), [id]);
  return (
    <div className="min-h-screen bg-gradient-to-b from-royal-950 via-royal-900 via-[14rem] to-cream to-[26rem] px-4 py-10">
      <div className="mx-auto max-w-xl">
        <div className="mb-6 text-center"><div className="inline-block rounded-3xl bg-white p-3 shadow-xl"><FullLogo className="h-20" /></div></div>
        {p === undefined ? <Card className="p-6"><Spinner /></Card> : !p ? <Card className="p-6 text-center text-stone-500">This project page is not available.</Card> : (
          <div className="space-y-5">
            <Card className="p-6">
              <h1 className="font-display text-2xl font-extrabold text-royal-950">{p.title}</h1>
              {p.description && <p className="mt-2 whitespace-pre-line text-sm text-stone-600">{p.description}</p>}
              <div className="mt-5"><Thermometer p={p} big /></div>
            </Card>
            <Card className="p-6"><h2 className="mb-3 font-semibold text-stone-900">Give towards it</h2><HowToPay p={payments} reference={p.title} giveLink={`/pay?for=project&project=${p.id}`} /></Card>
            {p.milestones.length > 0 && (
              <Card className="p-6"><h2 className="mb-3 font-semibold text-stone-900">Milestones</h2>
                <ul className="space-y-2">{p.milestones.map((m, i) => <li key={i} className="flex items-center gap-2 text-sm">{m.done ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <Circle className="h-5 w-5 text-stone-300" />}<span className={m.done ? 'text-stone-500' : 'text-stone-800'}>{m.title}</span></li>)}</ul>
              </Card>
            )}
            {(p.updates ?? []).length > 0 && (
              <Card className="p-6"><h2 className="mb-3 font-semibold text-stone-900">Latest news</h2>
                <ul className="space-y-3">{p.updates.slice(0, 6).map((u, i) => <li key={i}><div className="text-xs text-stone-500">{prettyDate(u.date)}</div><p className="text-sm text-stone-800">{u.text}</p></li>)}</ul>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
