import { useEffect, useRef, useState } from 'react';
import { Timestamp, collection, doc, getCountFromServer, getDocs, writeBatch } from 'firebase/firestore';
import { Database as DbIcon, Download, ExternalLink, FileJson, FileSpreadsheet, RefreshCw, Upload } from 'lucide-react';
import { Button, Card, PageHeader, errorText, useToast } from '../components/ui';
import { useData } from '../context/DataContext';
import { downloadExcel, downloadJson } from '../lib/csv';
import { db, firebaseConfig, usingEmulators } from '../lib/firebase';
import { GIVING_TYPES, PAYMENT_METHODS, labelOf, today } from '../lib/format';

const COLLECTIONS: { id: string; label: string; restorable: boolean }[] = [
  { id: 'members', label: 'Members', restorable: true },
  { id: 'giving', label: 'Tithes & giving', restorable: true },
  { id: 'services', label: 'Services (attendance)', restorable: true },
  { id: 'cells', label: 'Cells', restorable: true },
  { id: 'cellReports', label: 'Cell reports', restorable: true },
  { id: 'deptReports', label: 'Department reports', restorable: true },
  { id: 'departments', label: 'Departments', restorable: true },
  { id: 'branches', label: 'Branches', restorable: true },
  { id: 'registrations', label: 'Sign-ups', restorable: true },
  { id: 'programmes', label: 'Programme reminders', restorable: true },
  { id: 'smsMessages', label: 'SMS messages', restorable: false },
  { id: 'users', label: 'User accounts', restorable: false },
];

type Json = Record<string, unknown>;

function toJson(v: unknown): unknown {
  if (v instanceof Timestamp) return { __ts: v.toMillis() };
  if (Array.isArray(v)) return v.map(toJson);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toJson(x)]));
  return v;
}
function fromJson(v: unknown): unknown {
  if (v && typeof v === 'object' && !Array.isArray(v) && '__ts' in (v as Json)) return Timestamp.fromMillis((v as { __ts: number }).__ts);
  if (Array.isArray(v)) return v.map(fromJson);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fromJson(x)]));
  return v;
}

export default function Database() {
  const toast = useToast();
  const { branchName, deptName, cellName } = useData();
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  const [busy, setBusy] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    const out: Record<string, number | null> = {};
    await Promise.all(COLLECTIONS.map(async (c) => {
      try { out[c.id] = (await getCountFromServer(collection(db, c.id))).data().count; } catch { out[c.id] = null; }
    }));
    setCounts(out);
  }
  useEffect(() => { refresh(); }, []);

  async function readAll() {
    const data: Record<string, Json[]> = {};
    for (const c of COLLECTIONS) {
      const snap = await getDocs(collection(db, c.id));
      data[c.id] = await Promise.all(snap.docs.map(async (d) => {
        const row: Json = { __id: d.id, ...(toJson(d.data()) as Json) };
        if (c.id === 'services') {
          const ch = await getDocs(collection(db, 'services', d.id, 'checkins'));
          row.__checkins = ch.docs.map((x) => ({ __id: x.id, ...(toJson(x.data()) as Json) }));
        }
        return row;
      }));
    }
    return data;
  }

  async function backupJson() {
    setBusy('json');
    try {
      const data = await readAll();
      downloadJson(`togg-backup-${today()}.json`, { app: 'TOGG', project: firebaseConfig.projectId, exportedAt: new Date().toISOString(), collections: data });
      toast('ok', 'Backup downloaded. Keep it somewhere safe.');
    } catch (e) { toast('err', errorText(e)); } finally { setBusy(''); }
  }

  async function backupExcel() {
    setBusy('xlsx');
    try {
      const d = await readAll();
      const s = (v: unknown) => (v == null ? '' : String(v));
      downloadExcel(`togg-data-${today()}.xlsx`, [
        { name: 'Members', rows: d.members.map((m) => ({ 'Membership no.': s(m.membershipNo), 'First name': s(m.firstName), 'Last name': s(m.lastName), Phone: s(m.phone), Email: s(m.email), Gender: s(m.gender), DOB: s(m.dob), 'Age group': s(m.category), Status: s(m.status), Branch: branchName(s(m.branchId)), Departments: ((m.departmentIds as string[]) ?? []).map(deptName).join('; '), Cell: m.cellId ? cellName(s(m.cellId)) : '', Joined: s(m.joinedAt), Address: s(m.address) })) },
        { name: 'Tithes & giving', rows: d.giving.map((g) => ({ Date: s(g.date), Name: s(g.memberName), Type: labelOf(GIVING_TYPES, s(g.type) as never), Amount: Number(g.amount) || 0, Method: labelOf(PAYMENT_METHODS, s(g.method) as never), Reference: s(g.reference), Branch: branchName(s(g.branchId)) })) },
        { name: 'Attendance', rows: d.services.map((x) => ({ Date: s(x.date), Service: s(x.title) || s(x.type), Branch: branchName(s(x.branchId)), Members: Number(x.count) || 0, Visitors: Number(x.visitors) || 0 })) },
        { name: 'Cell reports', rows: d.cellReports.map((r) => ({ Date: s(r.date), Cell: cellName(s(r.cellId)), Present: Number(r.membersPresent) || 0, 'First-timers': Number(r.firstTimers) || 0, Converts: Number(r.newConverts) || 0, Offering: Number(r.offering) || 0, Topic: s(r.topic) })) },
        { name: 'Dept reports', rows: d.deptReports.map((r) => ({ Month: s(r.month), Department: deptName(s(r.departmentId)), Branch: branchName(s(r.branchId)), Type: s(r.type), Status: s(r.status), 'Submitted by': s(r.submittedByName) })) },
      ]);
    } catch (e) { toast('err', errorText(e)); } finally { setBusy(''); }
  }

  async function restore(file: File) {
    setBusy('restore');
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed?.app !== 'TOGG' || !parsed.collections) throw new Error('That is not a TOGG backup file.');
      const total = COLLECTIONS.filter((c) => c.restorable).reduce((t, c) => t + (parsed.collections[c.id]?.length ?? 0), 0);
      if (!confirm(`Restore ${total} records from the backup taken ${new Date(parsed.exportedAt).toLocaleString('en-GB')}?\n\nRecords with the same ID are overwritten; nothing is deleted. User accounts and SMS history are not restored.`)) return;
      const writes: { path: string[]; data: Json }[] = [];
      for (const c of COLLECTIONS.filter((x) => x.restorable)) {
        for (const row of (parsed.collections[c.id] ?? []) as Json[]) {
          const { __id, __checkins, ...rest } = row;
          writes.push({ path: [c.id, String(__id)], data: fromJson(rest) as Json });
          ((__checkins as Json[] | undefined) ?? []).forEach((ch) => {
            const { __id: cid, ...cr } = ch;
            writes.push({ path: [c.id, String(__id), 'checkins', String(cid)], data: fromJson(cr) as Json });
          });
        }
      }
      for (let i = 0; i < writes.length; i += 400) {
        const batch = writeBatch(db);
        writes.slice(i, i + 400).forEach((w) => batch.set(doc(db, w.path[0], ...w.path.slice(1)), w.data));
        await batch.commit();
      }
      toast('ok', `Restored ${writes.length} records.`);
      refresh();
    } catch (e) { toast('err', errorText(e)); } finally { setBusy(''); if (fileRef.current) fileRef.current.value = ''; }
  }

  const consoleUrl = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/firestore/databases/-default-/data`;

  return (
    <div>
      <PageHeader title="Database" subtitle="Where the church's records live, how much is stored, and backups." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-1">
          <div className="bg-royal-950 p-5 text-white">
            <DbIcon className="h-6 w-6 text-gold-400" />
            <div className="mt-3 text-sm text-royal-300">Connected database</div>
            <div className="font-mono text-lg">{firebaseConfig.projectId}</div>
            <div className="mt-1 text-xs text-royal-300">Google Firebase · Cloud Firestore{usingEmulators && ' (local emulator)'}</div>
          </div>
          <div className="space-y-3 p-5 text-sm text-stone-600">
            <p>Data is stored by Google in the cloud, replicated across data centres and protected by the security rules in <code className="rounded bg-stone-100 px-1">firestore.rules</code>.</p>
            <a href={consoleUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-royal-700 hover:underline">Open in Firebase console <ExternalLink className="h-3.5 w-3.5" /></a>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
            <h2 className="font-semibold text-stone-900">Records stored</h2>
            <Button size="sm" variant="ghost" onClick={refresh}><RefreshCw className="h-4 w-4" /></Button>
          </div>
          <div className="grid grid-cols-2 gap-px bg-stone-100 sm:grid-cols-3">
            {COLLECTIONS.map((c) => (
              <div key={c.id} className="bg-white px-5 py-4">
                <div className="text-xs text-stone-500">{c.label}</div>
                <div className="font-display text-xl font-bold text-royal-950">{counts[c.id] === undefined ? '…' : counts[c.id] === null ? '—' : counts[c.id]!.toLocaleString()}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5 lg:col-span-3">
          <h2 className="font-semibold text-stone-900">Backups</h2>
          <p className="mb-4 text-sm text-stone-500">Download a full backup regularly (for example monthly) and keep it on a computer or Google Drive.</p>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-stone-200 p-4">
              <FileJson className="h-6 w-6 text-royal-600" />
              <h3 className="mt-2 font-medium text-stone-900">Full backup (.json)</h3>
              <p className="mt-1 text-xs text-stone-500">Everything, including attendance check-ins. Can be restored here.</p>
              <Button className="mt-3" size="sm" loading={busy === 'json'} onClick={backupJson}><Download className="h-4 w-4" /> Download backup</Button>
            </div>
            <div className="rounded-2xl border border-stone-200 p-4">
              <FileSpreadsheet className="h-6 w-6 text-emerald-600" />
              <h3 className="mt-2 font-medium text-stone-900">Excel workbook</h3>
              <p className="mt-1 text-xs text-stone-500">Members, tithes and giving, attendance, cell and department reports, readable in Excel.</p>
              <Button className="mt-3" size="sm" variant="outline" loading={busy === 'xlsx'} onClick={backupExcel}><Download className="h-4 w-4" /> Download Excel</Button>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
              <Upload className="h-6 w-6 text-amber-600" />
              <h3 className="mt-2 font-medium text-stone-900">Restore from backup</h3>
              <p className="mt-1 text-xs text-stone-500">Puts records from a .json backup back. Existing records with the same ID are replaced; nothing is deleted.</p>
              <input ref={fileRef} type="file" accept=".json" hidden onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} />
              <Button className="mt-3" size="sm" variant="outline" loading={busy === 'restore'} onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Choose backup file</Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
