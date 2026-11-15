import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, serverTimestamp, where, writeBatch, deleteDoc, type QueryConstraint } from 'firebase/firestore';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, ExternalLink, Inbox, QrCode, Trash2, UserCheck } from 'lucide-react';
import { Avatar, Badge, Button, Card, Empty, Modal, PageHeader, Spinner, errorText, useToast } from '../components/ui';
import { ALL, useData } from '../context/DataContext';
import { db } from '../lib/firebase';
import { today } from '../lib/format';
import { isLocalAddress, publicBase, usePayments } from '../lib/settings';
import { reserveMembershipNos } from '../lib/counters';
import type { Registration } from '../lib/types';

export default function Registrations() {
  const { scope, branchName } = useData();
  const toast = useToast();
  const [tab, setTab] = useState<'new' | 'done'>('new');
  const [items, setItems] = useState<Registration[] | null>(null);
  const [qr, setQr] = useState<{ title: string; url: string } | null>(null);

  useEffect(() => {
    setItems(null);
    const c: QueryConstraint[] = [where('status', '==', tab)];
    if (scope !== ALL) c.unshift(where('branchId', '==', scope));
    return onSnapshot(query(collection(db, 'registrations'), ...c),
      (s) => {
        const list = s.docs.map((d) => ({ id: d.id, ...d.data() }) as Registration);
        list.sort((a, b) => (b.createdAt?.toDate().getTime() ?? Date.now()) - (a.createdAt?.toDate().getTime() ?? Date.now()));
        setItems(list.slice(0, 300));
      },
      (e) => { console.error(e); setItems([]); });
  }, [scope, tab]);

  const payments = usePayments();
  const origin = publicBase(payments);
  const runningLocally = isLocalAddress(window.location.origin) && !payments.publicSiteUrl;
  const suffix = scope !== ALL ? `?branch=${scope}` : '';
  const links = [
    { title: 'Member registration', desc: 'Members fill in their own details. You approve them here.', url: `${origin}/join${suffix}` },
    { title: 'Visitor form', desc: 'For first-time guests: name, phone, who invited them, prayer requests.', url: `${origin}/visit${suffix}` },
    { title: 'Prayer request & testimony', desc: 'Members send a prayer request or testimony by text, voice note or video.', url: `${origin}/prayer${suffix}` },
  ];

  async function approve(r: Registration) {
    try {
      const membershipNo = r.kind === 'member' ? (await reserveMembershipNos(1))[0] : '';
      const batch = writeBatch(db);
      batch.set(doc(collection(db, 'members')), {
        membershipNo, cellId: null, source: 'registration',
        firstName: r.firstName, lastName: r.lastName, phone: r.phone, email: r.email,
        gender: r.gender === 'male' || r.gender === 'female' ? r.gender : '', dob: '', category: r.category,
        status: r.kind === 'visitor' ? 'visitor' : 'active', branchId: r.branchId, departmentIds: [],
        address: '', occupation: '', maritalStatus: '', joinedAt: today(),
        notes: [r.invitedBy && `Invited by ${r.invitedBy}`, r.prayerRequest && `Prayer request: ${r.prayerRequest}`].filter(Boolean).join('\n'),
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'registrations', r.id), { status: 'done', processedAt: serverTimestamp() });
      await batch.commit();
      toast('ok', `${r.firstName} added to members.`);
    } catch (e) { toast('err', errorText(e)); }
  }

  async function dismiss(r: Registration) {
    if (!confirm(`Delete the submission from ${r.firstName} ${r.lastName}?`)) return;
    try { await deleteDoc(doc(db, 'registrations', r.id)); }
    catch (e) { toast('err', errorText(e)); }
  }

  return (
    <div>
      <PageHeader title="Sign-ups" subtitle="Share these links in WhatsApp groups, from the pulpit, or on a screen at the door." />

      {runningLocally && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          You are using the system from this computer, so phones cannot open its address. The links and QR codes below use the
          public address <b>{origin}</b> — it works once the site is published (<code>npm run deploy:web</code>, see README).
          You can change the address under <i>Settings → Payments &amp; links</i>.
        </div>
      )}
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        {links.map((l) => (
          <Card key={l.title} className="p-5">
            <h3 className="font-semibold text-stone-900">{l.title}</h3>
            <p className="mt-1 text-sm text-stone-500">{l.desc}</p>
            <div className="mt-3 truncate rounded-lg bg-stone-50 px-3 py-2 font-mono text-xs text-stone-600">{l.url}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(l.url); toast('ok', 'Link copied.'); }}><Copy className="h-3.5 w-3.5" /> Copy link</Button>
              <Button size="sm" variant="outline" onClick={() => setQr(l)}><QrCode className="h-3.5 w-3.5" /> QR code</Button>
              <a href={l.url} target="_blank" rel="noreferrer"><Button size="sm" variant="ghost"><ExternalLink className="h-3.5 w-3.5" /> Open</Button></a>
            </div>
          </Card>
        ))}
      </div>
      {scope === ALL && <p className="-mt-3 mb-6 text-xs text-stone-500">Tip: pick a branch in the sidebar to get links that pre-select that branch.</p>}

      <Card>
        <div className="flex gap-1 border-b border-stone-100 p-3">
          {(['new', 'done'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-1.5 text-sm ${tab === t ? 'bg-royal-800 text-white' : 'text-stone-600 hover:bg-stone-100'}`}>
              {t === 'new' ? 'New' : 'Added'}
            </button>
          ))}
        </div>
        {!items ? <Spinner /> : items.length === 0 ? (
          <Empty icon={<Inbox />} title={tab === 'new' ? 'No new sign-ups' : 'Nothing here yet'}>{tab === 'new' && 'When people fill in the forms above, they appear here for you to add to members.'}</Empty>
        ) : (
          <ul className="divide-y divide-stone-100">
            {items.map((r) => (
              <li key={r.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar text={`${r.firstName[0] ?? ''}${r.lastName[0] ?? ''}`.toUpperCase()} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-medium text-stone-900">
                      {r.firstName} {r.lastName} <Badge color={r.kind === 'visitor' ? 'gold' : 'royal'}>{r.kind}</Badge>
                    </div>
                    <div className="truncate text-xs text-stone-500">
                      {r.phone} · {branchName(r.branchId)} · {r.createdAt ? r.createdAt.toDate().toLocaleDateString('en-GB') : ''}
                    </div>
                    {r.invitedBy && <div className="text-xs text-stone-500">Invited by {r.invitedBy}</div>}
                    {r.prayerRequest && <div className="mt-1 rounded-lg bg-gold-50 px-2 py-1 text-xs text-gold-800">🙏 {r.prayerRequest}</div>}
                  </div>
                </div>
                {tab === 'new' && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => approve(r)}><UserCheck className="h-4 w-4" /> Add to members</Button>
                    <Button size="sm" variant="ghost" className="text-red-600" onClick={() => dismiss(r)} aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {qr && (
        <Modal open onClose={() => setQr(null)} title={qr.title}>
          <div className="flex flex-col items-center text-center">
            <div className="rounded-2xl border border-stone-200 bg-white p-4"><QRCodeSVG value={qr.url} size={240} fgColor="#0a2b40" /></div>
            <p className="mt-4 font-display text-lg font-bold text-royal-950">Scan to {qr.title.toLowerCase().includes('visitor') ? 'say hello' : 'register'}</p>
            <p className="mt-1 break-all text-xs text-stone-500">{qr.url}</p>
            <Button variant="outline" className="mt-4" onClick={() => window.print()}>Print</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
