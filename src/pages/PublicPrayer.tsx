import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { collection, doc, getDocs, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore';
import { CheckCircle2, Mic, Square, Trash2, Video } from 'lucide-react';
import { FullLogo } from '../components/Logo';
import { Button, Card, Field, Input, Select, Textarea, cx, errorText } from '../components/ui';
import { db } from '../lib/firebase';
import { mediaReady, uploadPrayerMedia, useMediaSettings } from '../lib/media';
import { PRAYER_LEVELS, type PrayerLevel } from '../lib/roles';
import type { Branch, Cell, Department } from '../lib/types';

export default function PublicPrayer() {
  const [params] = useSearchParams();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [depts, setDepts] = useState<Department[]>([]);
  const [cells, setCells] = useState<Cell[]>([]);
  const [kind, setKind] = useState<'prayer' | 'testimony'>('prayer');
  const [d, setD] = useState({ name: '', phone: '', branchId: params.get('branch') ?? '', toLevel: 'branch_pastor' as PrayerLevel, departmentId: '', cellId: '', text: '' });
  const [media, setMedia] = useState<{ blob: Blob; type: 'audio' | 'video'; url: string } | null>(null);
  const [recording, setRecording] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const mediaSettings = useMediaSettings();
  const canRecord = mediaReady(mediaSettings);

  useEffect(() => {
    getDocs(query(collection(db, 'branches'), orderBy('name'))).then((s) => {
      const list = s.docs.map((x) => ({ id: x.id, ...x.data() }) as Branch); setBranches(list);
      if (!d.branchId && list.length === 1) setD((p) => ({ ...p, branchId: list[0].id }));
    }).catch(() => setError('Could not load branches. Please try again later.'));
    getDocs(collection(db, 'departments')).then((s) => setDepts(s.docs.map((x) => ({ id: x.id, ...x.data() }) as Department).sort((a, b) => a.name.localeCompare(b.name)))).catch(() => {});
    getDocs(collection(db, 'cells')).then((s) => setCells(s.docs.map((x) => ({ id: x.id, ...x.data() }) as Cell))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startRec() {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        setMedia({ blob, type: 'audio', url: URL.createObjectURL(blob) });
      };
      rec.start(); recRef.current = rec; setRecording(true);
    } catch { setError('Could not use the microphone. Allow microphone access, or type your request instead.'); }
  }
  function stopRec() { recRef.current?.stop(); setRecording(false); }
  function pickVideo(f: File) {
    if (f.size > 50 * 1024 * 1024) { setError('That video is too big (max 50 MB). Record a shorter one.'); return; }
    setMedia({ blob: f, type: 'video', url: URL.createObjectURL(f) });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!d.text.trim() && !media) { setError('Type your message or record a voice note / video.'); return; }
    setBusy(true); setError('');
    try {
      const refDoc = doc(collection(db, 'prayerRequests'));
      let mediaPath = ''; let mediaUrl = '';
      if (media) ({ mediaPath, mediaUrl } = await uploadPrayerMedia(refDoc.id, media.blob, media.type, mediaSettings));
      await setDoc(refDoc, {
        kind, name: d.name.trim().slice(0, 80), phone: d.phone.trim().slice(0, 30), phoneKey: d.phone.replace(/\D/g, '').slice(-9),
        branchId: d.branchId, toLevel: d.toLevel, departmentId: d.toLevel === 'dept_leader' ? d.departmentId : '', cellId: d.toLevel === 'cell_leader' ? d.cellId : '',
        text: d.text.trim().slice(0, 4000), mediaPath, mediaUrl, mediaType: media?.type ?? '', confidential: d.toLevel === 'head_pastor',
        status: 'new', answerNote: '', memberId: '', createdAt: serverTimestamp(),
      });
      setDone(true);
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }

  const set = (k: keyof typeof d, v: string) => setD((p) => ({ ...p, [k]: v }));
  const branchCells = cells.filter((c) => c.branchId === d.branchId);

  return (
    <div className="min-h-screen bg-gradient-to-b from-royal-950 via-royal-900 via-[16rem] to-cream to-[30rem] px-4 py-10">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 text-center text-white">
          <div className="mx-auto mb-4 inline-block rounded-3xl bg-white p-3 shadow-xl"><FullLogo className="h-24" /></div>
          <h1 className="font-display text-3xl font-extrabold">{kind === 'prayer' ? 'Prayer request' : 'Share a testimony'}</h1>
          <p className="mt-2 text-sm text-royal-200">{kind === 'prayer' ? '“The prayer of a righteous person is powerful and effective.” — James 5:16' : '“Let the redeemed of the Lord say so.” — Psalm 107:2'}</p>
        </div>
        <Card className="p-6">
          {done ? (
            <div className="py-8 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
              <h2 className="mt-4 font-display text-xl font-bold text-royal-950">{kind === 'prayer' ? 'We are standing with you in prayer' : 'Thank you for sharing!'}</h2>
              <p className="mt-2 text-sm text-stone-500">It has been sent to the {PRAYER_LEVELS.find((l) => l.value === d.toLevel)?.label.replace('My ', 'your ').replace('The ', 'the ')}.</p>
              <Button variant="outline" className="mt-6" onClick={() => { setDone(false); setMedia(null); setD({ ...d, text: '' }); }}>Send another</Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1">
                {(['prayer', 'testimony'] as const).map((k) => (
                  <button type="button" key={k} onClick={() => setKind(k)} className={cx('rounded-lg py-2 text-sm font-medium', kind === k ? 'bg-white text-royal-900 shadow' : 'text-stone-500')}>{k === 'prayer' ? '🙏 Prayer request' : '🙌 Testimony'}</button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Your name"><Input required maxLength={80} value={d.name} onChange={(e) => set('name', e.target.value)} /></Field>
                <Field label="Phone"><Input required maxLength={30} inputMode="tel" value={d.phone} onChange={(e) => set('phone', e.target.value)} placeholder="024… or +44…" /></Field>
              </div>
              <Field label="Branch">
                <Select required value={d.branchId} onChange={(e) => set('branchId', e.target.value)}>
                  <option value="">Choose your branch…</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}{b.kind === 'online' ? ' (online / abroad)' : b.location ? ` — ${b.location}` : ''}</option>)}
                </Select>
              </Field>
              <Field label="Send it to" hint="Choose who should receive it. Leaders above them can also see it, except requests for the Head Pastor, which stay private.">
                <Select value={d.toLevel} onChange={(e) => set('toLevel', e.target.value)}>
                  {PRAYER_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </Select>
              </Field>
              {d.toLevel === 'dept_leader' && (
                <Field label="Which department?">
                  <Select required value={d.departmentId} onChange={(e) => set('departmentId', e.target.value)}>
                    <option value="">Choose…</option>{depts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </Select>
                </Field>
              )}
              {d.toLevel === 'cell_leader' && (
                <Field label="Which cell?">
                  <Select required value={d.cellId} onChange={(e) => set('cellId', e.target.value)}>
                    <option value="">Choose…</option>{branchCells.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </Select>
                </Field>
              )}
              <Field label={kind === 'prayer' ? 'Your prayer request' : 'Your testimony'}>
                <Textarea rows={4} maxLength={4000} value={d.text} onChange={(e) => set('text', e.target.value)} placeholder="Type here, or record a voice note or video below" />
              </Field>
              {canRecord && <div className="rounded-xl border border-dashed border-stone-300 p-3">
                {media ? (
                  <div>
                    {media.type === 'audio' ? <audio src={media.url} controls className="w-full" /> : <video src={media.url} controls className="max-h-60 w-full rounded-lg bg-black" />}
                    <button type="button" onClick={() => setMedia(null)} className="mt-2 flex items-center gap-1 text-xs text-red-600"><Trash2 className="h-3.5 w-3.5" /> Remove</button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {recording
                      ? <Button type="button" variant="danger" onClick={stopRec}><Square className="h-4 w-4" /> Stop recording</Button>
                      : <Button type="button" variant="outline" onClick={startRec}><Mic className="h-4 w-4" /> Record voice note</Button>}
                    <Button type="button" variant="outline" onClick={() => videoRef.current?.click()} disabled={recording}><Video className="h-4 w-4" /> Video</Button>
                    <input ref={videoRef} type="file" accept="video/*" capture="user" hidden onChange={(e) => e.target.files?.[0] && pickVideo(e.target.files[0])} />
                    {recording && <span className="flex items-center gap-1 text-sm text-red-600"><span className="h-2 w-2 animate-pulse rounded-full bg-red-600" /> Recording…</span>}
                  </div>
                )}
              </div>}
              {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              <Button type="submit" loading={busy} className="w-full">Send</Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
