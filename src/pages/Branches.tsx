import { useState, type FormEvent } from 'react';
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Building2, Globe2, MapPin, Pencil, Phone, Plus, Trash2, User } from 'lucide-react';
import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Select, errorText, useToast } from '../components/ui';
import { ALL, useData } from '../context/DataContext';
import { db } from '../lib/firebase';
import type { Branch } from '../lib/types';

export default function Branches() {
  const { branches, members, scope } = useData();
  const [editing, setEditing] = useState<Branch | null>(null);
  const [creating, setCreating] = useState<false | 'physical' | 'online'>(false);

  return (
    <div>
      <PageHeader title="Branches" subtitle="Headquarters, every branch, and the online branch for members who live abroad."
        actions={<>
          {!branches.some((b) => b.kind === 'online') && <Button variant="outline" onClick={() => setCreating('online')}><Globe2 className="h-4 w-4" /> Add online branch</Button>}
          <Button onClick={() => setCreating('physical')}><Plus className="h-4 w-4" /> Add branch</Button>
        </>} />
      {branches.length === 0 ? (
        <Card><Empty icon={<Building2 />} title="No branches yet">Start with your headquarters, then add each branch. Branch pastors and staff are attached to a branch.</Empty></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {branches.map((b) => (
            <Card key={b.id} className="p-5">
              <div className="flex items-start justify-between">
                <div className="rounded-xl bg-royal-50 p-2.5 text-royal-600">{b.kind === 'online' ? <Globe2 className="h-5 w-5" /> : <Building2 className="h-5 w-5" />}</div>
                <div className="flex items-center gap-1">
                  {b.isHQ && <Badge color="gold">Headquarters</Badge>}
                  {b.kind === 'online' && <Badge color="blue">Online · abroad</Badge>}
                  <button onClick={() => setEditing(b)} className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-royal-700" aria-label="Edit"><Pencil className="h-4 w-4" /></button>
                </div>
              </div>
              <h3 className="mt-3 font-display text-lg font-bold text-royal-950">{b.name}</h3>
              <div className="mt-2 space-y-1 text-sm text-stone-500">
                {b.location && <div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5" /> {b.location}</div>}
                {b.pastorName && <div className="flex items-center gap-2"><User className="h-3.5 w-3.5" /> {b.pastorName}</div>}
                {b.phone && <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" /> {b.phone}</div>}
                {b.groupLink && <a href={b.groupLink} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-royal-700 hover:underline"><Globe2 className="h-3.5 w-3.5" /> Online group</a>}
              </div>
              {scope === ALL && (
                <div className="mt-4 border-t border-stone-100 pt-3 text-sm text-stone-600">
                  <b className="text-royal-950">{members.filter((m) => m.branchId === b.id).length}</b> members
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      {(creating || editing) && <BranchForm branch={editing} kind={creating || 'physical'} onClose={() => { setCreating(false); setEditing(null); }} />}
    </div>
  );
}

function BranchForm({ branch, kind, onClose }: { branch: Branch | null; kind: 'physical' | 'online'; onClose: () => void }) {
  const toast = useToast();
  const [d, setD] = useState({
    name: branch?.name ?? (kind === 'online' ? 'TOGG Online (Abroad)' : ''), location: branch?.location ?? (kind === 'online' ? 'Online (members abroad)' : ''), pastorName: branch?.pastorName ?? '',
    phone: branch?.phone ?? '', isHQ: branch?.isHQ ?? false, kind: branch?.kind ?? kind, groupLink: branch?.groupLink ?? '',
  });
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const data = { ...d, name: d.name.trim(), updatedAt: serverTimestamp() };
      if (branch) await updateDoc(doc(db, 'branches', branch.id), data);
      else await addDoc(collection(db, 'branches'), { ...data, createdAt: serverTimestamp() });
      toast('ok', 'Branch saved.');
      onClose();
    } catch (err) { toast('err', errorText(err)); setBusy(false); }
  }

  async function remove() {
    if (!branch || !confirm(`Delete ${branch.name}? Members, services and giving records for this branch are kept but will show "Unknown branch".`)) return;
    try { await deleteDoc(doc(db, 'branches', branch.id)); toast('ok', 'Branch deleted.'); onClose(); }
    catch (err) { toast('err', errorText(err)); }
  }

  return (
    <Modal open onClose={onClose} title={branch ? 'Edit branch' : 'Add branch'}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Branch name"><Input required value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="e.g. TOGG Kumasi" /></Field>
        <Field label="Location"><Input value={d.location} onChange={(e) => setD({ ...d, location: e.target.value })} placeholder="Town / area" /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Resident pastor"><Input value={d.pastorName} onChange={(e) => setD({ ...d, pastorName: e.target.value })} /></Field>
          <Field label="Phone"><Input value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} /></Field>
        </div>
        <Field label="Type of branch">
          <Select value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value as 'physical' | 'online', location: e.target.value === 'online' && !d.location ? 'Online (members abroad)' : d.location })}>
            <option value="physical">A physical branch</option>
            <option value="online">Online branch — members who travelled or live abroad</option>
          </Select>
        </Field>
        {d.kind === 'online' && (
          <Field label="Online group link" hint="WhatsApp group, Telegram, Zoom or YouTube link where they meet.">
            <Input type="url" value={d.groupLink} onChange={(e) => setD({ ...d, groupLink: e.target.value })} placeholder="https://chat.whatsapp.com/…" />
          </Field>
        )}
        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input type="checkbox" checked={d.isHQ} onChange={(e) => setD({ ...d, isHQ: e.target.checked })} className="rounded border-stone-300" />
          This is the headquarters
        </label>
        <div className="flex items-center justify-between pt-2">
          {branch ? <Button type="button" variant="ghost" className="text-red-600" onClick={remove}><Trash2 className="h-4 w-4" /> Delete</Button> : <span />}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={busy}>Save</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
