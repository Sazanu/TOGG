import { useState, type FormEvent } from 'react';
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Network, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button, Card, Empty, Field, Input, Modal, PageHeader, Textarea, errorText, useToast } from '../components/ui';
import { ALL, useData } from '../context/DataContext';
import { db } from '../lib/firebase';
import type { Department } from '../lib/types';

const SUGGESTED = ['Choir', 'Ushering', 'Media', 'Protocol', "Women's Fellowship", "Men's Fellowship", 'Youth', "Children's Ministry", 'Prayer Team', 'Evangelism', 'Welfare', 'Instrumentalists'];

export default function Departments() {
  const { departments, members, scope, branchName } = useData();
  const toast = useToast();
  const [editing, setEditing] = useState<Department | null>(null);
  const [creating, setCreating] = useState(false);
  const [seeding, setSeeding] = useState(false);

  async function seed() {
    setSeeding(true);
    try {
      const have = new Set(departments.map((d) => d.name.toLowerCase()));
      for (const name of SUGGESTED.filter((n) => !have.has(n.toLowerCase()))) {
        await addDoc(collection(db, 'departments'), { name, description: '', leaderName: '', createdAt: serverTimestamp() });
      }
      toast('ok', 'Common departments added.');
    } catch (e) { toast('err', errorText(e)); } finally { setSeeding(false); }
  }

  return (
    <div>
      <PageHeader
        title="Departments"
        subtitle="Shared across all branches. Member counts are for the branch selected in the sidebar."
        actions={
          <>
            {departments.length === 0 && <Button variant="outline" loading={seeding} onClick={seed}>Add common departments</Button>}
            <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Add department</Button>
          </>
        }
      />
      {departments.length === 0 ? (
        <Card><Empty icon={<Network />} title="No departments yet">Add Choir, Ushering, Media and the others, or use “Add common departments”.</Empty></Card>
      ) : (
        <Card>
          <ul className="divide-y divide-stone-100">
            {departments.map((d) => (
              <li key={d.id} className="flex items-center gap-4 px-5 py-4">
                <div className="rounded-xl bg-royal-50 p-2.5 text-royal-600"><Network className="h-4 w-4" /></div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-stone-900">{d.name}</div>
                  <div className="truncate text-xs text-stone-500">{[d.leaderName && `Led by ${d.leaderName}`, d.description].filter(Boolean).join(' · ') || 'No details yet'}</div>
                </div>
                <div className="text-right text-sm">
                  <b className="text-royal-950">{members.filter((m) => m.departmentIds?.includes(d.id)).length}</b>
                  <div className="text-[11px] text-stone-500">{scope === ALL ? 'all branches' : branchName(scope)}</div>
                </div>
                <button onClick={() => setEditing(d)} className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-royal-700" aria-label="Edit"><Pencil className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {(creating || editing) && <DeptForm dept={editing} onClose={() => { setCreating(false); setEditing(null); }} />}
    </div>
  );
}

function DeptForm({ dept, onClose }: { dept: Department | null; onClose: () => void }) {
  const toast = useToast();
  const [d, setD] = useState({ name: dept?.name ?? '', leaderName: dept?.leaderName ?? '', description: dept?.description ?? '' });
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const data = { ...d, name: d.name.trim(), updatedAt: serverTimestamp() };
      if (dept) await updateDoc(doc(db, 'departments', dept.id), data);
      else await addDoc(collection(db, 'departments'), { ...data, createdAt: serverTimestamp() });
      toast('ok', 'Department saved.');
      onClose();
    } catch (err) { toast('err', errorText(err)); setBusy(false); }
  }

  async function remove() {
    if (!dept || !confirm(`Delete ${dept.name}?`)) return;
    try { await deleteDoc(doc(db, 'departments', dept.id)); toast('ok', 'Department deleted.'); onClose(); }
    catch (err) { toast('err', errorText(err)); }
  }

  return (
    <Modal open onClose={onClose} title={dept ? 'Edit department' : 'Add department'}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Name"><Input required value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></Field>
        <Field label="Leader"><Input value={d.leaderName} onChange={(e) => setD({ ...d, leaderName: e.target.value })} /></Field>
        <Field label="Description"><Textarea value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} /></Field>
        <div className="flex items-center justify-between pt-2">
          {dept ? <Button type="button" variant="ghost" className="text-red-600" onClick={remove}><Trash2 className="h-4 w-4" /> Delete</Button> : <span />}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={busy}>Save</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
