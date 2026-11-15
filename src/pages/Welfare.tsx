import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { BellRing, Check, HeartHandshake, Plus, Search, Send, Settings2 } from 'lucide-react';
import { Avatar, Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Spinner, Stat, Textarea, cx, errorText, useToast } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { ALL, useData } from '../context/DataContext';
import { db } from '../lib/firebase';
import { initials, money, monthKey } from '../lib/format';
import { can, isGlobal } from '../lib/roles';
import { queueSms } from '../lib/sms';
import { publicBase, usePayments, useWelfareSettings } from '../lib/settings';
import { expectedMonths, monthShort, paidMonths, welfareMembers } from '../lib/welfare';
import type { Member, WelfareSettings } from '../lib/types';
import { RecordGift, useGifts } from './Giving';

export default function Welfare() {
  const { profile } = useAuth();
  const { members, membersLoading, scope, branchName } = useData();
  const toast = useToast();
  const settings = useWelfareSettings();
  const payments = usePayments();
  const now = monthKey();
  const { gifts, loading } = useGifts(scope, `${settings.startMonth}-01`, `${now}-31`);
  const paid = useMemo(() => paidMonths(gifts), [gifts]);
  const [q, setQ] = useState('');
  const [onlyOwing, setOnlyOwing] = useState(true);
  const [paying, setPaying] = useState<{ m: Member; owed: string[] } | null>(null);
  const [editing, setEditing] = useState(false);
  const [sending, setSending] = useState(false);
  const canWrite = can(profile?.role, 'giving.write');

  const rows = useMemo(() => welfareMembers(members).map((m) => {
    const exp = expectedMonths(m, settings.startMonth, now);
    const have = paid.get(m.id) ?? new Set();
    const owed = exp.filter((k) => !have.has(k));
    return { m, exp, owed };
  }), [members, settings.startMonth, now, paid]);
  const shown = rows.filter((r) => (!onlyOwing || r.owed.length) && (!q || `${r.m.firstName} ${r.m.lastName} ${r.m.phone}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => b.owed.length - a.owed.length);
  const defaulters = rows.filter((r) => r.owed.length > 0);
  const thisMonthPaid = rows.filter((r) => (paid.get(r.m.id) ?? new Set()).has(now)).length;
  const arrears = defaulters.reduce((t, r) => t + r.owed.length * settings.amount, 0);
  const collected = gifts.filter((g) => g.type === 'welfare' && g.date.startsWith(now)).reduce((t, g) => t + g.amount, 0);

  async function remindAll() {
    const branchId = isGlobal(profile?.role) ? (scope === ALL ? null : scope) : profile?.branchId ?? null;
    if (!confirm(`Send an SMS reminder with the payment link to ${defaulters.filter((r) => r.m.phone).length} members who owe welfare dues?`)) return;
    setSending(true);
    try {
      const r = await queueSms({ branchId, message: settings.template, audience: { type: 'welfare_defaulters', branchId }, label: `Welfare reminder ${monthShort(now)}`, createdBy: profile?.uid, createdByName: profile?.displayName });
      toast(r.delivered ? 'ok' : 'err', r.delivered ? 'Reminders sent. See SMS messages → Sent.' : 'Saved, but the SMS service did not respond. It will retry when it is running.');
    } catch (e) { toast('err', errorText(e)); } finally { setSending(false); }
  }

  return (
    <div>
      <PageHeader title="Welfare" subtitle={`Monthly welfare dues of ${money(settings.amount)} per adult member · ${scope === ALL ? 'all branches' : branchName(scope)}`}
        actions={<>
          {isGlobal(profile?.role) && <Button variant="outline" onClick={() => setEditing(true)}><Settings2 className="h-4 w-4" /> Settings</Button>}
          {can(profile?.role, 'sms.send') || isGlobal(profile?.role) || profile?.role === 'finance' ? <Button variant="gold" loading={sending} disabled={!defaulters.length} onClick={remindAll}><Send className="h-4 w-4" /> Remind defaulters</Button> : null}
        </>} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={`Paid for ${monthShort(now)}`} value={`${thisMonthPaid} / ${rows.length}`} icon={<HeartHandshake className="h-4 w-4" />} />
        <Stat label="Collected this month" value={money(collected)} />
        <Stat label="Members owing" value={defaulters.length} sub={settings.remindEnabled ? `Auto reminder on day ${settings.remindDay} each month` : 'Automatic reminders are off'} />
        <Stat label="Total arrears" value={money(arrears)} />
      </div>
      <Card>
        <div className="flex flex-col gap-3 border-b border-stone-100 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <Input className="pl-9" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-stone-600"><input type="checkbox" checked={onlyOwing} onChange={(e) => setOnlyOwing(e.target.checked)} className="rounded border-stone-300" /> Only members who owe</label>
        </div>
        {loading || membersLoading ? <Spinner /> : shown.length === 0 ? <Empty icon={<Check />} title={onlyOwing ? 'Nobody owes welfare dues 🎉' : 'No members'} /> : (
          <ul className="divide-y divide-stone-100">
            {shown.map(({ m, owed, exp }) => (
              <li key={m.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar text={initials(m.firstName, m.lastName)} />
                  <div className="min-w-0">
                    <div className="truncate font-medium text-stone-900">{m.firstName} {m.lastName}</div>
                    <div className="truncate text-xs text-stone-500">{m.phone || 'No phone — cannot be texted'}{scope === ALL && ` · ${branchName(m.branchId)}`}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {exp.slice(-6).map((k) => <span key={k} title={monthShort(k)} className={cx('rounded px-1.5 py-0.5 text-[10px] font-medium', owed.includes(k) ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700')}>{monthShort(k).slice(0, 3)}</span>)}
                </div>
                <div className="w-32 text-right">{owed.length ? <><Badge color="red">{owed.length} month{owed.length > 1 ? 's' : ''}</Badge><div className="text-xs text-stone-500">{money(owed.length * settings.amount)}</div></> : <Badge color="green">Up to date</Badge>}</div>
                {canWrite && <Button size="sm" variant="outline" disabled={!owed.length} onClick={() => setPaying({ m, owed })}><Plus className="h-3.5 w-3.5" /> Pay</Button>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="mt-3 text-xs text-stone-500">Reminder SMS include the payment link {publicBase(payments)}/pay?for=welfare. Members can be excused from welfare in their member record (Edit → Welfare).</p>
      {paying && <PayWelfare m={paying.m} owed={paying.owed} amount={settings.amount} onClose={() => setPaying(null)} />}
      {editing && <WelfareSettingsForm s={settings} onClose={() => setEditing(false)} />}
    </div>
  );
}

function PayWelfare({ m, owed, amount, onClose }: { m: Member; owed: string[]; amount: number; onClose: () => void }) {
  const [months, setMonths] = useState<string[]>(owed.slice(0, 1));
  const [go, setGo] = useState(false);
  if (go) return <RecordGift onClose={onClose} preset={{ type: 'welfare', memberId: m.id, memberName: `${m.firstName} ${m.lastName}`, branchId: m.branchId, forMonths: months, amount: months.length * amount }} />;
  return (
    <Modal open onClose={onClose} title={`Welfare — ${m.firstName} ${m.lastName}`}>
      <p className="mb-3 text-sm text-stone-600">Which months is this payment for?</p>
      <div className="flex flex-wrap gap-2">
        {owed.map((k) => {
          const on = months.includes(k);
          return <button key={k} onClick={() => setMonths(on ? months.filter((x) => x !== k) : [...months, k].sort())} className={cx('rounded-full border px-3 py-1.5 text-sm', on ? 'border-royal-600 bg-royal-600 text-white' : 'border-stone-300 text-stone-600')}>{monthShort(k)}</button>;
        })}
      </div>
      <div className="mt-4 flex items-center justify-between rounded-xl bg-stone-50 px-4 py-3"><span className="text-sm">{months.length} month(s)</span><b>{money(months.length * amount)}</b></div>
      <div className="mt-4 flex justify-end"><Button disabled={!months.length} onClick={() => setGo(true)}>Continue</Button></div>
    </Modal>
  );
}

function WelfareSettingsForm({ s, onClose }: { s: WelfareSettings; onClose: () => void }) {
  const toast = useToast();
  const [d, setD] = useState(s);
  useEffect(() => setD(s), [s]);
  async function save(e: FormEvent) {
    e.preventDefault();
    try { await setDoc(doc(db, 'settings', 'welfare'), { ...d, amount: Number(d.amount) || 0, updatedAt: serverTimestamp() }); toast('ok', 'Welfare settings saved.'); onClose(); }
    catch (err) { toast('err', errorText(err)); }
  }
  return (
    <Modal open onClose={onClose} title="Welfare settings">
      <form onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Monthly dues (GH₵)"><Input type="number" min={0} step="0.5" value={d.amount} onChange={(e) => setD({ ...d, amount: Number(e.target.value) })} /></Field>
          <Field label="Dues started from"><Input type="month" value={d.startMonth} onChange={(e) => setD({ ...d, startMonth: e.target.value })} /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-stone-700"><input type="checkbox" checked={d.remindEnabled} onChange={(e) => setD({ ...d, remindEnabled: e.target.checked })} className="rounded border-stone-300" /> <BellRing className="h-4 w-4" /> Text defaulters automatically every month</label>
        <Field label="On day of the month (9 am)"><Input type="number" min={1} max={28} value={d.remindDay} onChange={(e) => setD({ ...d, remindDay: Number(e.target.value) })} /></Field>
        <Field label="Reminder message" hint="{firstName}, {months} (the months owed), {amount} (total owed) and {link} (payment page) are filled in for each person.">
          <Textarea rows={3} value={d.template} onChange={(e) => setD({ ...d, template: e.target.value })} />
        </Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit">Save</Button></div>
      </form>
    </Modal>
  );
}

export async function setWelfareExempt(memberId: string, v: boolean) {
  await updateDoc(doc(db, 'members', memberId), { welfareExempt: v });
}
