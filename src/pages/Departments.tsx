import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { ChevronRight, Network, Pencil, Phone, Plus, Trash2, User } from 'lucide-react';
import { Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Textarea, cx, errorText, useToast } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { ALL, useData } from '../context/DataContext';
import { db } from '../lib/firebase';
import { can } from '../lib/roles';
import type { Department } from '../lib/types';

export const MAIN_DEPARTMENTS = ['Administration', 'Organising', "Children's", 'Protocol', 'Financial', 'Media'];

export default function Departments() {
  const { profile } = useAuth();
  const { departments, deptTree, members, cells, scope, branchName, deptWithChildren } = useData();
  const toast = useToast();
  const manage = can(profile?.role, 'departments.manage');
  const mine = profile?.role === 'dept_leader' ? profile.departmentIds : null;
  const [editing, setEditing] = useState<Department | null>(null);
  const [creating, setCreating] = useState<{ parentId: string | null } | null>(null);
  const [seeding, setSeeding] = useState(false);

  async function seed() {
    setSeeding(true);
    try {
      const have = new Set(departments.map((d) => d.name.toLowerCase()));
      for (const name of MAIN_DEPARTMENTS.filter((n) => !have.has(n.toLowerCase()))) {
        await addDoc(collection(db, 'departments'), { name, parentId: null, headName: '', headPhone: '', assistantName: '', description: '', createdAt: serverTimestamp() });
      }
      toast('ok', 'Main departments added.');
    } catch (e) { toast('err', errorText(e)); } finally { setSeeding(false); }
  }

  const visible = deptTree.filter(({ dept }) => !mine || mine.includes(dept.id));

  return (
    <div>
      <PageHeader
        title={mine ? 'My departments' : 'Departments'}
        subtitle={mine ? 'Your departments, their members, cells and monthly reports.' : `Main departments and the departments under them. Counts are for ${scope === ALL ? 'all branches' : branchName(scope)}.`}
        actions={manage && (
          <>
            {MAIN_DEPARTMENTS.some((n) => !departments.some((d) => d.name.toLowerCase() === n.toLowerCase())) && (
              <Button variant="outline" loading={seeding} onClick={seed}>Add main departments</Button>
            )}
            <Button onClick={() => setCreating({ parentId: null })}><Plus className="h-4 w-4" /> Add department</Button>
          </>
        )}
      />
      {visible.length === 0 ? (
        <Card><Empty icon={<Network />} title={mine ? 'You have not been given a department yet' : 'No departments yet'}>
          {manage && <>Use <b>Add main departments</b> for Administration, Organising, Children's, Protocol, Financial and Media, then add the departments under each.</>}
        </Empty></Card>
      ) : (
        <Card>
          <ul className="divide-y divide-stone-100">
            {visible.map(({ dept: d, depth }) => {
              const ids = deptWithChildren(d.id);
              const count = members.filter((m) => m.departmentIds?.some((x) => ids.includes(x))).length;
              const cellCount = cells.filter((c) => ids.includes(c.departmentId)).length;
              return (
                <li key={d.id} className={cx('flex items-center gap-3 py-3 pr-3 sm:pr-5', depth ? 'bg-stone-50/50' : '')} style={{ paddingLeft: `${(mine ? 0 : depth) * 28 + 20}px` }}>
                  <div className={cx('rounded-xl p-2.5', depth ? 'bg-white text-royal-400' : 'bg-royal-50 text-royal-600')}><Network className="h-4 w-4" /></div>
                  <Link to={`/departments/${d.id}`} className="min-w-0 flex-1">
                    <div className={cx('truncate text-stone-900 hover:text-royal-700', depth ? 'text-sm' : 'font-semibold')}>
                      {depth > 0 && <span className="text-stone-400">↳ </span>}{d.name}
                    </div>
                    <div className="truncate text-xs text-stone-500">
                      {d.headName ? `Head: ${d.headName}` : 'No head yet'}{d.headPhone && ` · ${d.headPhone}`}{cellCount ? ` · ${cellCount} cell${cellCount > 1 ? 's' : ''}` : ''}
                    </div>
                  </Link>
                  <div className="text-right text-sm"><b className="text-royal-950">{count}</b><div className="text-[11px] text-stone-500">members</div></div>
                  {manage && (
                    <>
                      <button onClick={() => setCreating({ parentId: d.id })} className="hidden rounded-lg px-2 py-1.5 text-xs text-royal-700 hover:bg-royal-50 sm:block" title="Add a department under this one">+ Sub</button>
                      <button onClick={() => setEditing(d)} className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-royal-700" aria-label="Edit"><Pencil className="h-4 w-4" /></button>
                    </>
                  )}
                  <ChevronRight className="h-4 w-4 text-stone-300" />
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {(creating || editing) && <DeptForm dept={editing} parentId={creating?.parentId ?? null} onClose={() => { setCreating(null); setEditing(null); }} />}
    </div>
  );
}

export function DeptForm({ dept, parentId, onClose }: { dept: Department | null; parentId: string | null; onClose: () => void }) {
  const { deptTree, departments, deptWithChildren } = useData();
  const toast = useToast();
  const [d, setD] = useState({
    name: dept?.name ?? '', parentId: dept ? dept.parentId ?? '' : parentId ?? '', headName: dept?.headName ?? '',
    headPhone: dept?.headPhone ?? '', assistantName: dept?.assistantName ?? '', description: dept?.description ?? '',
  });
  const [busy, setBusy] = useState(false);
  const blocked = dept ? deptWithChildren(dept.id) : [];

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const data = { ...d, name: d.name.trim(), parentId: d.parentId || null, updatedAt: serverTimestamp() };
      if (dept) await updateDoc(doc(db, 'departments', dept.id), data);
      else await addDoc(collection(db, 'departments'), { ...data, createdAt: serverTimestamp() });
      toast('ok', 'Department saved.');
      onClose();
    } catch (err) { toast('err', errorText(err)); setBusy(false); }
  }

  async function remove() {
    if (!dept) return;
    if (departments.some((x) => x.parentId === dept.id)) { toast('err', 'Move or delete its sub-departments first.'); return; }
    if (!confirm(`Delete ${dept.name}? Members keep their other departments.`)) return;
    try { await deleteDoc(doc(db, 'departments', dept.id)); toast('ok', 'Department deleted.'); onClose(); }
    catch (err) { toast('err', errorText(err)); }
  }

  return (
    <Modal open onClose={onClose} title={dept ? 'Edit department' : d.parentId ? 'Add sub-department' : 'Add department'}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Name"><Input required value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="e.g. Choir, Ushering, Sound" /></Field>
        <Field label="Under (parent department)" hint="Leave as “Main department” for a top-level department.">
          <Select value={d.parentId} onChange={(e) => setD({ ...d, parentId: e.target.value })}>
            <option value="">— Main department —</option>
            {deptTree.filter(({ dept: x }) => !blocked.includes(x.id)).map(({ dept: x, depth }) => <option key={x.id} value={x.id}>{'  '.repeat(depth * 2)}{depth ? '↳ ' : ''}{x.name}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Head / leader"><Input value={d.headName} onChange={(e) => setD({ ...d, headName: e.target.value })} /></Field>
          <Field label="Head's phone"><Input value={d.headPhone} onChange={(e) => setD({ ...d, headPhone: e.target.value })} /></Field>
        </div>
        <Field label="Assistant"><Input value={d.assistantName} onChange={(e) => setD({ ...d, assistantName: e.target.value })} /></Field>
        <Field label="Description"><Textarea value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} /></Field>
        <p className="text-xs text-stone-500">To let the head log in and register members, ask them to sign up, then give them the <b>Department Head</b> role in <i>Users &amp; roles</i>.</p>
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

export function HeadLine({ d }: { d: Department }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-500">
      <span className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> {d.headName || 'No head yet'}</span>
      {d.headPhone && <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> {d.headPhone}</span>}
      {d.assistantName && <span>Assistant: {d.assistantName}</span>}
    </div>
  );
}
