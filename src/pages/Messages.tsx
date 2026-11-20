import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { addDoc, collection, deleteDoc, doc, getDoc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { BellRing, CalendarClock, History, KeyRound, MessageSquare, Pencil, Plus, Send, Settings2, Trash2, Wand2 } from 'lucide-react';
import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Spinner, Textarea, cx, errorText, useToast } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { ALL, useData } from '../context/DataContext';
import { db } from '../lib/firebase';
import { DAYS, SERVICE_TYPES, prettyDate, smsParts } from '../lib/format';
import { isGlobal } from '../lib/roles';
import { DEFAULT_SMS_SETTINGS, TEMPLATES, estimateRecipients, isServerUrl, queueSms } from '../lib/sms';
import type { Audience, AudienceType, MemberCategory, Programme, SmsMessage, SmsSettings } from '../lib/types';

type Tab = 'send' | 'history' | 'reminders' | 'auto' | 'settings';

export default function Messages() {
  const { profile } = useAuth();
  const global = isGlobal(profile?.role);
  const [params] = useSearchParams();
  const [tab, setTab] = useState<Tab>('send');
  const tabs: { id: Tab; label: string; icon: JSX.Element; show: boolean }[] = [
    { id: 'send', label: 'Send SMS', icon: <Send className="h-4 w-4" />, show: true },
    { id: 'history', label: 'Sent & scheduled', icon: <History className="h-4 w-4" />, show: true },
    { id: 'reminders', label: 'Programme reminders', icon: <BellRing className="h-4 w-4" />, show: true },
    { id: 'auto', label: 'Automatic SMS', icon: <Wand2 className="h-4 w-4" />, show: global },
    { id: 'settings', label: 'SMS provider', icon: <Settings2 className="h-4 w-4" />, show: global },
  ];
  return (
    <div>
      <PageHeader title="Messages" subtitle="Instant and automatic SMS: announcements, programme reminders, online meeting links and missed-service follow-up." />
      <SmsModeBanner />
      <div className="mb-6 flex gap-1 overflow-x-auto rounded-2xl border border-stone-200 bg-white p-1">
        {tabs.filter((t) => t.show).map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={cx('flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium', tab === t.id ? 'bg-royal-800 text-white' : 'text-stone-600 hover:bg-stone-100')}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>
      {tab === 'send' && <Compose absenteesFor={params.get('absentees')} onSent={() => setTab('history')} />}
      {tab === 'history' && <HistoryList />}
      {tab === 'reminders' && <Reminders />}
      {tab === 'auto' && global && <Automations />}
      {tab === 'settings' && global && <ProviderSettings />}
    </div>
  );
}

export function AudiencePicker({ value, onChange }: { value: Audience; onChange: (a: Audience) => void }) {
  const { profile } = useAuth();
  const { branches, deptTree, cells } = useData();
  const global = isGlobal(profile?.role);
  const set = (p: Partial<Audience>) => onChange({ ...value, ...p });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Send to">
        <Select value={value.type} onChange={(e) => set({ type: e.target.value as AudienceType })}>
          <option value="all">{global ? 'All members (all branches)' : 'All members of my branch'}</option>
          {global && <option value="branch">One branch</option>}
          <option value="department">A department (and its sub-departments)</option>
          <option value="cell">A cell</option>
          <option value="category">An age group</option>
          <option value="custom">Type phone numbers</option>
          {value.type === 'absentees' && <option value="absentees">Members absent from a service</option>}
        </Select>
      </Field>
      {value.type === 'branch' && (
        <Field label="Branch">
          <Select required value={value.branchId ?? ''} onChange={(e) => set({ branchId: e.target.value })}>
            <option value="">Choose…</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
      )}
      {value.type === 'department' && (
        <Field label="Department">
          <Select required value={value.departmentId ?? ''} onChange={(e) => set({ departmentId: e.target.value })}>
            <option value="">Choose…</option>
            {deptTree.map(({ dept, depth }) => <option key={dept.id} value={dept.id}>{depth ? '↳ ' : ''}{dept.name}</option>)}
          </Select>
        </Field>
      )}
      {value.type === 'cell' && (
        <Field label="Cell">
          <Select required value={value.cellId ?? ''} onChange={(e) => set({ cellId: e.target.value })}>
            <option value="">Choose…</option>
            {cells.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
      )}
      {value.type === 'category' && (
        <Field label="Age group">
          <Select value={value.category ?? 'adult'} onChange={(e) => set({ category: e.target.value as MemberCategory })}>
            <option value="adult">Adults</option><option value="teen">Teens</option><option value="child">Children (parents' numbers)</option>
          </Select>
        </Field>
      )}
      {value.type === 'custom' && (
        <Field label="Phone numbers" hint="Separate with commas or new lines." className="sm:col-span-2">
          <Textarea rows={2} value={(value.phones ?? []).join('\n')} onChange={(e) => set({ phones: e.target.value.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean) })} placeholder="0241234567, 0201234567" />
        </Field>
      )}
      {value.type !== 'custom' && value.type !== 'absentees' && (
        <label className="flex items-center gap-2 self-end pb-3 text-sm text-stone-600">
          <input type="checkbox" checked={!!value.includeVisitors} onChange={(e) => set({ includeVisitors: e.target.checked })} className="rounded border-stone-300" /> Include visitors
        </label>
      )}
    </div>
  );
}

function Compose({ absenteesFor, onSent }: { absenteesFor: string | null; onSent: () => void }) {
  const { profile } = useAuth();
  const { members, scope, branchName, deptWithChildren } = useData();
  const toast = useToast();
  const global = isGlobal(profile?.role);
  const myBranch = global ? (scope === ALL ? null : scope) : profile?.branchId ?? null;
  const [audience, setAudience] = useState<Audience>(absenteesFor ? { type: 'absentees', serviceId: absenteesFor } : { type: 'all' });
  const [message, setMessage] = useState(absenteesFor ? DEFAULT_SMS_SETTINGS.absenteeTemplate : '');
  const [label, setLabel] = useState(absenteesFor ? 'Missed service follow-up' : '');
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [sendAt, setSendAt] = useState('');
  const [busy, setBusy] = useState(false);

  const effective: Audience = { ...audience, branchId: audience.type === 'branch' ? audience.branchId : myBranch };
  const count = estimateRecipients(effective, members, deptWithChildren);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    if (when === 'later' && !sendAt) { toast('err', 'Choose when to send.'); return; }
    if (count === 0) { toast('err', 'Nobody in that group has a phone number.'); return; }
    if (when === 'now' && !confirm(`Send this SMS now to ${count < 0 ? 'the absent members' : `${count} people`}?`)) return;
    setBusy(true);
    try {
      const branchId = global ? (effective.branchId ?? null) : profile?.branchId ?? null;
      const res = await queueSms({
        branchId, message: message.trim(), audience: { ...effective, branchId }, label: label.trim() || message.trim().slice(0, 40),
        sendAt: when === 'later' ? new Date(sendAt) : null, createdBy: profile?.uid, createdByName: profile?.displayName, estimate: count,
      });
      if (when === 'later') toast('ok', `Scheduled for ${new Date(sendAt).toLocaleString('en-GB')}.`);
      else if (res.delivered) toast('ok', 'Message sent to the SMS server — its result shows in “Sent & scheduled”.');
      else toast('err', 'Saved, but no SMS server answered. Open System status to fix it; the message will go out once the server runs.');
      setMessage(''); setLabel('');
      onSent();
    } catch (err) { toast('err', errorText(err)); } finally { setBusy(false); }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="p-5 sm:p-6 lg:col-span-2">
        <form onSubmit={send} className="space-y-5">
          <AudiencePicker value={audience} onChange={setAudience} />
          {!global && <p className="-mt-2 text-xs text-stone-500">Only members of {branchName(profile?.branchId)} will receive it.</p>}
          <Field label="Message">
            <Textarea required rows={5} maxLength={918} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Type your announcement…" />
          </Field>
          <div className="-mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
            <div className="flex flex-wrap gap-1">
              {['{firstName}', '{church}'].map((v) => <button type="button" key={v} onClick={() => setMessage((m) => m + v)} className="rounded-md bg-stone-100 px-2 py-1 font-mono hover:bg-royal-50">{v}</button>)}
            </div>
            <span>{message.length} characters · {smsParts(message)} SMS per person</span>
          </div>
          <Field label="Label (for your records)"><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Harvest announcement" /></Field>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex rounded-xl border border-stone-200 p-1">
              {(['now', 'later'] as const).map((w) => (
                <button type="button" key={w} onClick={() => setWhen(w)} className={cx('rounded-lg px-4 py-1.5 text-sm', when === w ? 'bg-royal-800 text-white' : 'text-stone-600')}>{w === 'now' ? 'Send now' : 'Schedule'}</button>
              ))}
            </div>
            {when === 'later' && <Input type="datetime-local" value={sendAt} onChange={(e) => setSendAt(e.target.value)} className="!w-60" />}
            <div className="ml-auto text-right">
              <div className="text-xs text-stone-500">Recipients</div>
              <div className="font-display text-xl font-bold text-royal-950">{count < 0 ? 'Absentees' : count}</div>
            </div>
          </div>
          <div className="flex justify-end border-t border-stone-100 pt-4">
            <Button type="submit" variant="gold" loading={busy}>{when === 'now' ? <><Send className="h-4 w-4" /> Send SMS</> : <><CalendarClock className="h-4 w-4" /> Schedule</>}</Button>
          </div>
        </form>
      </Card>
      <Card className="h-fit p-5">
        <h3 className="mb-3 font-semibold text-stone-900">Quick templates</h3>
        <ul className="space-y-2">
          {TEMPLATES.map((t) => (
            <li key={t.label}>
              <button onClick={() => { setMessage(t.text); setLabel(t.label); }} className="w-full rounded-xl border border-stone-200 p-3 text-left hover:border-royal-300">
                <div className="text-sm font-medium text-stone-800">{t.label}</div>
                <div className="mt-0.5 line-clamp-2 text-xs text-stone-500">{t.text}</div>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-stone-500"><b>{'{firstName}'}</b> is replaced with each person's first name.</p>
      </Card>
    </div>
  );
}

const STATUS_COLOR: Record<SmsMessage['status'], 'gray' | 'blue' | 'gold' | 'green' | 'red'> = {
  queued: 'blue', scheduled: 'gold', sending: 'blue', sent: 'green', failed: 'red', cancelled: 'gray',
};

function HistoryList() {
  const { profile } = useAuth();
  const { scope, branchName } = useData();
  const toast = useToast();
  const global = isGlobal(profile?.role);
  const branch = global ? scope : profile?.branchId ?? '';
  const [items, setItems] = useState<SmsMessage[] | null>(null);
  useEffect(() => {
    const base = collection(db, 'smsMessages');
    const q = global && branch === ALL ? query(base, orderBy('createdAt', 'desc'), limit(100)) : query(base, where('branchId', '==', branch));
    return onSnapshot(q, (s) => {
      const list = s.docs.map((d) => ({ id: d.id, ...d.data() }) as SmsMessage);
      list.sort((a, b) => (b.createdAt?.toDate().getTime() ?? Date.now()) - (a.createdAt?.toDate().getTime() ?? Date.now()));
      setItems(list.slice(0, 100));
    }, (e) => { console.error(e); setItems([]); });
  }, [global, branch]);

  async function cancel(m: SmsMessage) {
    if (!confirm('Cancel this scheduled message?')) return;
    try { await updateDoc(doc(db, 'smsMessages', m.id), { status: 'cancelled' }); } catch (e) { toast('err', errorText(e)); }
  }

  return (
    <Card>
      {!items ? <Spinner /> : items.length === 0 ? <Empty icon={<MessageSquare />} title="No messages yet" /> : (
        <ul className="divide-y divide-stone-100">
          {items.map((m) => (
            <li key={m.id} className="px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-stone-900">{m.label || 'Message'}</span>
                <Badge color={STATUS_COLOR[m.status]}>{m.status}</Badge>
                {m.kind === 'automated' && <Badge color="royal">automatic</Badge>}
                <span className="ml-auto text-xs text-stone-500">
                  {m.status === 'scheduled' && m.sendAt ? `Sends ${m.sendAt.toDate().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}` : m.createdAt ? m.createdAt.toDate().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : ''}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-stone-600">{m.message}</p>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-stone-500">
                <span>{m.branchId ? branchName(m.branchId) : 'All branches'}</span>
                {m.recipientsCount !== undefined && <span>{m.sentCount ?? 0} of {m.recipientsCount} delivered to gateway</span>}
                {m.createdByName && <span>by {m.createdByName}</span>}
                {m.error && <span className="text-red-600">{m.error}</span>}
                {m.providerResponse && !m.error && <span className="text-stone-400" title="Reply from the SMS company">Reply: {m.providerResponse.slice(0, 80)}</span>}
                {m.status === 'scheduled' && <button onClick={() => cancel(m)} className="text-red-600 hover:underline">Cancel</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Reminders() {
  const { profile } = useAuth();
  const { scope, branchName } = useData();
  const global = isGlobal(profile?.role);
  const branch = global ? scope : profile?.branchId ?? '';
  const [items, setItems] = useState<Programme[] | null>(null);
  const [editing, setEditing] = useState<Programme | 'new' | null>(null);
  useEffect(() => {
    const base = collection(db, 'programmes');
    const q = global && branch === ALL ? query(base) : query(base, where('branchId', '==', branch));
    return onSnapshot(q, (s) => setItems(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Programme)), (e) => { console.error(e); setItems([]); });
  }, [global, branch]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-stone-500">Recurring programmes such as <b>Peak Hour Prayer</b>, midweek service or online Bible study. Members get an automatic SMS with the time and link before each one.</p>
        <Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> New reminder</Button>
      </div>
      <Card>
        {!items ? <Spinner /> : items.length === 0 ? (
          <Empty icon={<BellRing />} title="No programme reminders yet">Add one, e.g. Peak Hour Prayer, Monday to Friday at 5:00am, reminder 30 minutes before, with the Zoom or Google Meet link.</Empty>
        ) : (
          <ul className="divide-y divide-stone-100">
            {items.map((p) => (
              <li key={p.id} className="flex items-start gap-3 px-5 py-4">
                <div className={cx('rounded-xl p-2.5', p.active ? 'bg-gold-50 text-gold-600' : 'bg-stone-100 text-stone-400')}><BellRing className="h-4 w-4" /></div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-stone-900">{p.title} {!p.active && <Badge color="gray">paused</Badge>}</div>
                  <div className="text-xs text-stone-500">
                    {p.days.length === 7 ? 'Every day' : p.days.map((d) => DAYS[d].slice(0, 3)).join(', ')} at {p.time} · SMS {p.remindMinutesBefore ? `${p.remindMinutesBefore} min before` : 'at start time'} · {p.branchId ? branchName(p.branchId) : 'All branches'}
                  </div>
                  {p.link && <a href={p.link} target="_blank" rel="noreferrer" className="mt-0.5 block truncate text-xs text-royal-700 hover:underline">{p.link}</a>}
                  {p.lastSentOn && <div className="mt-0.5 text-[11px] text-stone-400">Last sent {prettyDate(p.lastSentOn)}</div>}
                </div>
                <button onClick={() => setEditing(p)} className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-royal-700" aria-label="Edit"><Pencil className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {editing && <ProgrammeForm programme={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ProgrammeForm({ programme, onClose }: { programme: Programme | null; onClose: () => void }) {
  const { profile } = useAuth();
  const { scope } = useData();
  const toast = useToast();
  const global = isGlobal(profile?.role);
  const [d, setD] = useState<Omit<Programme, 'id'>>(() => programme ?? {
    branchId: global ? (scope === ALL ? null : scope) : profile?.branchId ?? null,
    title: 'Peak Hour Prayer', link: '', time: '05:00', days: [1, 2, 3, 4, 5], remindMinutesBefore: 30, active: true,
    message: 'Hello {firstName}, {title} starts at {time}. Join here: {link} - {church}', audience: { type: 'all' },
  });
  const [busy, setBusy] = useState(false);
  const preview = d.message.replace(/\{title\}/g, d.title).replace(/\{time\}/g, d.time).replace(/\{link\}/g, d.link || '[link]');

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!d.days.length) { toast('err', 'Choose at least one day.'); return; }
    setBusy(true);
    try {
      const data = { ...d, audience: { ...d.audience, branchId: d.branchId }, updatedAt: serverTimestamp() };
      if (programme) await updateDoc(doc(db, 'programmes', programme.id), data);
      else await addDoc(collection(db, 'programmes'), { ...data, lastSentOn: '', createdAt: serverTimestamp() });
      toast('ok', 'Reminder saved.');
      onClose();
    } catch (err) { toast('err', errorText(err)); setBusy(false); }
  }

  async function remove() {
    if (!programme || !confirm(`Delete ${programme.title}?`)) return;
    try { await deleteDoc(doc(db, 'programmes', programme.id)); onClose(); } catch (err) { toast('err', errorText(err)); }
  }

  return (
    <Modal open onClose={onClose} title={programme ? 'Edit reminder' : 'New programme reminder'} wide>
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Programme"><Input required value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} /></Field>
          <Field label="Online link (Zoom, Meet, YouTube, WhatsApp…)"><Input type="url" value={d.link} onChange={(e) => setD({ ...d, link: e.target.value })} placeholder="https://" /></Field>
        </div>
        <div>
          <span className="mb-1.5 block text-sm font-medium text-stone-700">Days</span>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((name, i) => {
              const on = d.days.includes(i);
              return <button type="button" key={name} onClick={() => setD({ ...d, days: on ? d.days.filter((x) => x !== i) : [...d.days, i].sort() })} className={cx('rounded-full border px-3 py-1.5 text-sm', on ? 'border-royal-600 bg-royal-600 text-white' : 'border-stone-300 text-stone-600')}>{name.slice(0, 3)}</button>;
            })}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Starts at (Ghana time)"><Input type="time" required value={d.time} onChange={(e) => setD({ ...d, time: e.target.value })} /></Field>
          <Field label="Send SMS">
            <Select value={d.remindMinutesBefore} onChange={(e) => setD({ ...d, remindMinutesBefore: Number(e.target.value) })}>
              {[0, 15, 30, 60, 120, 180].map((m) => <option key={m} value={m}>{m === 0 ? 'At start time' : m < 60 ? `${m} minutes before` : `${m / 60} hour${m > 60 ? 's' : ''} before`}</option>)}
            </Select>
          </Field>
          <label className="flex items-center gap-2 self-end pb-3 text-sm text-stone-700"><input type="checkbox" checked={d.active} onChange={(e) => setD({ ...d, active: e.target.checked })} className="rounded border-stone-300" /> Active</label>
        </div>
        <AudiencePicker value={d.audience} onChange={(a) => setD({ ...d, audience: a })} />
        <Field label="Message" hint="{title}, {time}, {link} and {firstName} are filled in automatically.">
          <Textarea required rows={3} value={d.message} onChange={(e) => setD({ ...d, message: e.target.value })} />
        </Field>
        <div className="rounded-xl bg-stone-50 p-3 text-sm text-stone-600"><span className="text-xs font-semibold uppercase text-stone-400">Preview</span><br />{preview.replace(/\{firstName\}/g, 'Ama').replace(/\{church\}/g, "Throne of God's Grace")}</div>
        <div className="flex items-center justify-between border-t border-stone-100 pt-4">
          {programme ? <Button type="button" variant="ghost" className="text-red-600" onClick={remove}><Trash2 className="h-4 w-4" /> Delete</Button> : <span />}
          <div className="flex gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy}>Save</Button></div>
        </div>
      </form>
    </Modal>
  );
}

function useSmsSettings(): [SmsSettings | null, (s: SmsSettings) => Promise<void>] {
  const [s, setS] = useState<SmsSettings | null>(null);
  useEffect(() => onSnapshot(doc(db, 'settings', 'sms'), (snap) => setS({ ...DEFAULT_SMS_SETTINGS, ...(snap.data() as Partial<SmsSettings> | undefined) }), () => setS(DEFAULT_SMS_SETTINGS)), []);
  return [s, async (v) => { await setDoc(doc(db, 'settings', 'sms'), { ...v, updatedAt: serverTimestamp() }, { merge: true }); }];
}

function Automations() {
  const toast = useToast();
  const [s, save] = useSmsSettings();
  const [d, setD] = useState<SmsSettings | null>(null);
  useEffect(() => { if (s && !d) setD(s); }, [s, d]);
  if (!d) return <Spinner />;
  async function submit(e: FormEvent) {
    e.preventDefault();
    try { await save(d!); toast('ok', 'Automatic SMS settings saved.'); } catch (err) { toast('err', errorText(err)); }
  }
  return (
    <form onSubmit={submit} className="space-y-6">
      <Card className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold text-stone-900">Missed a service</h3>
            <p className="text-sm text-stone-500">After attendance is taken, active members who were not checked in get a caring SMS the same day.</p>
          </div>
          <Toggle on={d.absenteeEnabled} onChange={(v) => setD({ ...d, absenteeEnabled: v })} />
        </div>
        <div className={cx('mt-4 space-y-4', !d.absenteeEnabled && 'opacity-50')}>
          <Field label="Message"><Textarea rows={3} value={d.absenteeTemplate} onChange={(e) => setD({ ...d, absenteeTemplate: e.target.value })} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Send from (Ghana time, on the day of the service)">
              <Select value={d.absenteeHour} onChange={(e) => setD({ ...d, absenteeHour: Number(e.target.value) })}>
                {Array.from({ length: 12 }, (_, i) => i + 11).map((h) => <option key={h} value={h}>{h > 12 ? `${h - 12}:00 pm` : `${h}:00 ${h === 12 ? 'pm' : 'am'}`}</option>)}
              </Select>
            </Field>
            <div>
              <span className="mb-1.5 block text-sm font-medium text-stone-700">For these services</span>
              <div className="flex flex-wrap gap-2">
                {SERVICE_TYPES.map((t) => {
                  const on = d.absenteeServiceTypes.includes(t);
                  return <button type="button" key={t} onClick={() => setD({ ...d, absenteeServiceTypes: on ? d.absenteeServiceTypes.filter((x) => x !== t) : [...d.absenteeServiceTypes, t] })} className={cx('rounded-full border px-3 py-1 text-xs', on ? 'border-royal-600 bg-royal-600 text-white' : 'border-stone-300 text-stone-600')}>{t}</button>;
                })}
              </div>
            </div>
          </div>
          <p className="text-xs text-stone-500">Children are not texted. Services where nobody was checked in are skipped. You can also text absentees by hand from any service's check-in page.</p>
        </div>
      </Card>
      <Card className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold text-stone-900">Birthday wishes</h3>
            <p className="text-sm text-stone-500">Sent at 7:00 am to active members on their birthday.</p>
          </div>
          <Toggle on={d.birthdayEnabled} onChange={(v) => setD({ ...d, birthdayEnabled: v })} />
        </div>
        <Field label="Message" className={cx('mt-4', !d.birthdayEnabled && 'opacity-50')}><Textarea rows={2} value={d.birthdayTemplate} onChange={(e) => setD({ ...d, birthdayTemplate: e.target.value })} /></Field>
      </Card>
      <Card className="p-5 sm:p-6">
        <Field label="Church name used for {church}"><Input value={d.churchName} onChange={(e) => setD({ ...d, churchName: e.target.value })} /></Field>
      </Card>
      <div className="flex justify-end"><Button type="submit">Save automatic SMS</Button></div>
    </form>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className={cx('relative h-7 w-12 shrink-0 rounded-full transition', on ? 'bg-emerald-500' : 'bg-stone-300')}>
      <span className={cx('absolute top-1 h-5 w-5 rounded-full bg-white shadow transition', on ? 'left-6' : 'left-1')} />
    </button>
  );
}

function ProviderSettings() {
  const { profile } = useAuth();
  const toast = useToast();
  const [s, save] = useSmsSettings();
  const [d, setD] = useState<SmsSettings | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [keySet, setKeySet] = useState<boolean | null>(null);
  const [testTo, setTestTo] = useState('');
  const [testing, setTesting] = useState(false);
  useEffect(() => { if (s && !d) setD({ ...s, provider: s.provider === 'log' ? 'log' : 'gonlinesites', relayUrl: isServerUrl(s.relayUrl ?? '') ? s.relayUrl : '' }); }, [s, d]);
  useEffect(() => { getDoc(doc(db, 'settings', 'smsKeyStatus')).then((x) => setKeySet(!!x.data()?.set)).catch(() => setKeySet(null)); }, []);
  if (!d) return <Spinner />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const relay = (d!.relayUrl ?? '').trim();
    if (relay && !isServerUrl(relay)) { toast('err', 'That box is only for a Google Apps Script address (https://script.google.com/…). Leave it empty — the app sends to Gonlinesites itself. Put your Gonlinesites key in "API key".'); return; }
    // Accept the whole Gonlinesites link too: take the api_key out of it.
    let key = apiKey.trim();
    const m = key.match(/[?&]api_key=([^&\s]+)/); if (m) key = decodeURIComponent(m[1]);
    const sender = d!.senderId.trim() || 'TOGG';
    try {
      await save({ ...d!, senderId: sender, relayUrl: relay });
      await setDoc(doc(db, 'settings', 'server'), { relayUrl: relay }, { merge: true });
      if (key) {
        await setDoc(doc(db, 'secrets', 'sms'), { apiKey: key, updatedAt: serverTimestamp() });
        await setDoc(doc(db, 'smsSender', 'gonline'), { apiKey: key, senderId: sender, updatedAt: serverTimestamp() });
        await setDoc(doc(db, 'settings', 'smsKeyStatus'), { set: true, by: profile?.displayName ?? '', at: serverTimestamp() });
        setApiKey(''); setKeySet(true);
      } else if (keySet) {
        await setDoc(doc(db, 'smsSender', 'gonline'), { senderId: sender, updatedAt: serverTimestamp() }, { merge: true });
      }
      toast('ok', 'SMS provider saved.');
    } catch (err) { toast('err', errorText(err)); }
  }

  async function test() {
    if (!testTo.trim()) return;
    setTesting(true);
    try {
      const r = await queueSms({ branchId: null, message: `Test SMS from TOGG church system. It works! - ${d!.churchName}`, audience: { type: 'custom', phones: [testTo] }, label: 'Test SMS', createdBy: profile?.uid, createdByName: profile?.displayName });
      toast(r.delivered ? 'ok' : 'err', r.delivered ? 'Test sent to Gonlinesites. It should arrive within a minute.' : `Not sent: ${r.error ?? ''}`);
    } catch (err) { toast('err', errorText(err)); } finally { setTesting(false); }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="p-5 sm:p-6 lg:col-span-2">
        <form onSubmit={submit} className="space-y-4">
          <Field label="SMS provider">
            <Select value={d.provider} onChange={(e) => setD({ ...d, provider: e.target.value as SmsSettings['provider'] })}>
              <option value="gonlinesites">Gonlinesites</option><option value="log">Test mode (don't send)</option>
            </Select>
          </Field>
          <Field label="API key" hint={keySet ? 'A key is saved. Paste a new one only to replace it (e.g. after changing your Gonlinesites password).' : 'From your Gonlinesites panel → API. You can paste the whole API link — the key is taken from it.'}>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <Input type="password" autoComplete="off" className="pl-9" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={keySet ? '•••••••• (saved)' : 'Paste API key or API link'} />
            </div>
          </Field>
          <Field label="Sender ID" hint="Must be approved on your Gonlinesites account first (e.g. TOGG). A name that is not approved yet, such as GracePalace, is rejected by Gonlinesites (error 106) — ask Gonlinesites to register it, then type it here.">
            <Input maxLength={11} value={d.senderId} onChange={(e) => setD({ ...d, senderId: e.target.value })} />
          </Field>
          <details className="rounded-xl border border-stone-200 p-3 text-sm">
            <summary className="cursor-pointer font-medium text-stone-700">Automatic messages (optional server)</summary>
            <p className="mt-2 text-stone-500">Messages you send go to Gonlinesites straight from this app. Automatic ones (absentees after service, birthdays, programme reminders, Paystack confirmations) need the free Google Apps Script server — see <code>sms-server/README.md</code>. Paste <b>its</b> address here, never the Gonlinesites link.</p>
            <Input className="mt-2" type="url" value={d.relayUrl ?? ''} onChange={(e) => setD({ ...d, relayUrl: e.target.value })} placeholder="https://script.google.com/macros/s/…/exec" />
          </details>
          <div className="flex justify-end"><Button type="submit">Save</Button></div>
        </form>
      </Card>
      <Card className="h-fit p-5">
        <h3 className="font-semibold text-stone-900">Send a test</h3>
        <p className="mb-3 text-sm text-stone-500">Save first, then text your own phone.</p>
        <Input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="024 000 0000" />
        <Button className="mt-3 w-full" variant="outline" loading={testing} onClick={test}><Send className="h-4 w-4" /> Send test SMS</Button>
        <p className="mt-4 rounded-xl bg-royal-50 p-3 text-xs text-royal-900">Each SMS uses your Gonlinesites credit. Delivery reports and your balance are in your Gonlinesites dashboard.</p>
      </Card>
    </div>
  );
}

/** Tells staff whether SMS really goes out. */
function SmsModeBanner() {
  const [s] = useSmsSettings();
  const [keySet, setKeySet] = useState<boolean | null>(null);
  useEffect(() => onSnapshot(doc(db, 'settings', 'smsKeyStatus'), (x) => setKeySet(!!x.data()?.set), () => setKeySet(false)), []);
  if (!s || keySet === null) return null;
  if (s.provider === 'log') return <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><b>TEST MODE — no real SMS are sent.</b> Choose Gonlinesites under “SMS provider”.</div>;
  if (!keySet) return <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><b>No Gonlinesites API key yet.</b> Add it under “SMS provider”.</div>;
  return <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><b>SMS is live</b> via Gonlinesites, sender <b>{s.senderId || 'TOGG'}</b>. Messages go out as soon as you press Send.</div>;
}
