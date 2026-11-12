import { useEffect, useState, type FormEvent } from 'react';
import { collection, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { Pencil, ShieldCheck } from 'lucide-react';
import { Avatar, Badge, Button, Card, Empty, Field, Modal, PageHeader, Select, Spinner, errorText, useToast } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { db } from '../lib/firebase';
import { ASSIGNABLE_ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, isGlobal, type Role } from '../lib/roles';
import type { AppUser } from '../lib/types';

const ROLE_COLOR: Partial<Record<Role, 'gold' | 'royal' | 'green' | 'gray' | 'blue'>> = {
  head_pastor: 'gold', associate_pastor: 'gold', branch_pastor: 'royal', secretary: 'blue', finance: 'green', pending: 'gray',
};

export default function Users() {
  const { profile } = useAuth();
  const { branchName } = useData();
  const [users, setUsers] = useState<AppUser[] | null>(null);
  const [editing, setEditing] = useState<AppUser | null>(null);

  useEffect(() => onSnapshot(collection(db, 'users'), (s) => {
    const list = s.docs.map((d) => ({ uid: d.id, ...d.data() }) as AppUser);
    const order = (u: AppUser) => (u.role === 'pending' ? 0 : ASSIGNABLE_ROLES.indexOf(u.role) + 1);
    list.sort((a, b) => order(a) - order(b) || a.displayName.localeCompare(b.displayName));
    setUsers(list);
  }), []);

  const pending = users?.filter((u) => u.role === 'pending').length ?? 0;

  return (
    <div>
      <PageHeader title="Users & roles" subtitle="People sign up at the login page, then you give them a role and a branch here." />
      {pending > 0 && (
        <div className="mb-4 rounded-2xl border border-gold-200 bg-gold-50 px-4 py-3 text-sm text-gold-800">
          <b>{pending}</b> {pending === 1 ? 'person is' : 'people are'} waiting for access.
        </div>
      )}
      <Card>
        {!users ? <Spinner /> : users.length === 0 ? <Empty icon={<ShieldCheck />} title="No users" /> : (
          <ul className="divide-y divide-stone-100">
            {users.map((u) => {
              const locked = u.uid === profile?.uid || (u.role === 'head_pastor' && profile?.role !== 'head_pastor');
              return (
                <li key={u.uid} className="flex items-center gap-3 px-5 py-4">
                  <Avatar text={u.displayName.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase()} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-stone-900">{u.displayName} {u.uid === profile?.uid && <span className="text-xs text-stone-400">(you)</span>}</div>
                    <div className="truncate text-xs text-stone-500">{u.email}{u.phone && ` · ${u.phone}`}</div>
                  </div>
                  <div className="hidden text-right text-xs text-stone-500 sm:block">{isGlobal(u.role) ? 'All branches' : u.branchId ? branchName(u.branchId) : '—'}</div>
                  <Badge color={u.active ? ROLE_COLOR[u.role] ?? 'royal' : 'red'}>{u.active ? ROLE_LABELS[u.role] : 'Disabled'}</Badge>
                  <button disabled={locked} onClick={() => setEditing(u)} className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-royal-700 disabled:invisible" aria-label="Edit"><Pencil className="h-4 w-4" /></button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {editing && <UserForm user={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function UserForm({ user, onClose }: { user: AppUser; onClose: () => void }) {
  const { profile } = useAuth();
  const { branches, departments } = useData();
  const toast = useToast();
  const [role, setRole] = useState<Role>(user.role);
  const [branchId, setBranchId] = useState(user.branchId ?? '');
  const [deptIds, setDeptIds] = useState<string[]>(user.departmentIds ?? []);
  const [active, setActive] = useState(user.role === 'pending' ? true : user.active);
  const [busy, setBusy] = useState(false);

  const allowedRoles = ASSIGNABLE_ROLES.filter((r) => profile?.role === 'head_pastor' || !isGlobal(r));
  const needsBranch = !isGlobal(role) && role !== 'pending';

  async function save(e: FormEvent) {
    e.preventDefault();
    if (needsBranch && !branchId) { toast('err', 'Choose the branch this person serves in.'); return; }
    setBusy(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        role,
        branchId: needsBranch ? branchId : null,
        departmentIds: role === 'dept_leader' ? deptIds : [],
        active: role === 'pending' ? false : active,
      });
      toast('ok', `${user.displayName} updated.`);
      onClose();
    } catch (err) { toast('err', errorText(err)); setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title={user.displayName}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Role" hint={ROLE_DESCRIPTIONS[role]}>
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {allowedRoles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </Select>
        </Field>
        {needsBranch && (
          <Field label="Branch">
            <Select required value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">Choose…</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
        )}
        {role === 'dept_leader' && (
          <div>
            <span className="mb-2 block text-sm font-medium text-stone-700">Departments they lead</span>
            <div className="flex flex-wrap gap-2">
              {departments.map((d) => {
                const on = deptIds.includes(d.id);
                return (
                  <button type="button" key={d.id} onClick={() => setDeptIds(on ? deptIds.filter((x) => x !== d.id) : [...deptIds, d.id])}
                    className={`rounded-full border px-3 py-1.5 text-sm ${on ? 'border-royal-600 bg-royal-600 text-white' : 'border-stone-300 text-stone-600'}`}>
                    {d.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {role !== 'pending' && (
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="rounded border-stone-300" />
            Account active (untick to block this person from signing in to the system)
          </label>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>Save</Button>
        </div>
      </form>
    </Modal>
  );
}
