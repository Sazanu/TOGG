import { useEffect, useState, type FormEvent } from 'react';
import { deleteApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signOut } from 'firebase/auth';
import { collection, doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { Pencil, ShieldCheck, UserPlus } from 'lucide-react';
import { Avatar, Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Spinner, errorText, useToast } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { db, firebaseConfig, usingEmulators } from '../lib/firebase';
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
  const [adding, setAdding] = useState(false);

  useEffect(() => onSnapshot(collection(db, 'users'), (s) => {
    const list = s.docs.map((d) => ({ uid: d.id, ...d.data() }) as AppUser);
    const order = (u: AppUser) => (u.role === 'pending' ? 0 : ASSIGNABLE_ROLES.indexOf(u.role) + 1);
    list.sort((a, b) => order(a) - order(b) || a.displayName.localeCompare(b.displayName));
    setUsers(list);
  }), []);

  const pending = users?.filter((u) => u.role === 'pending').length ?? 0;

  return (
    <div>
      <PageHeader title="Users & roles" subtitle="Add staff accounts yourself, or let people sign up and give them a role here." actions={<Button onClick={() => setAdding(true)}><UserPlus className="h-4 w-4" /> Add user</Button>} />
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
      {adding && <UserForm user={null} onClose={() => setAdding(false)} />}
    </div>
  );
}

function UserForm({ user, onClose }: { user: AppUser | null; onClose: () => void }) {
  const { profile } = useAuth();
  const { branches, deptTree, cells, deptWithChildren } = useData();
  const toast = useToast();
  const [role, setRole] = useState<Role>(user?.role ?? 'secretary');
  const [branchId, setBranchId] = useState(user?.branchId ?? '');
  const [deptIds, setDeptIds] = useState<string[]>(user?.departmentIds ?? []);
  const [cellIds, setCellIds] = useState<string[]>(user?.cellIds ?? []);
  const [active, setActive] = useState(!user || user.role === 'pending' ? true : user.active);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState(() => `Togg-${Math.random().toString(36).slice(2, 8)}`);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const allowedRoles = ASSIGNABLE_ROLES.filter((r) => (profile?.role === 'head_pastor' || !isGlobal(r)) && (user || r !== 'pending'));
  const needsBranch = !isGlobal(role) && role !== 'pending';

  async function save(e: FormEvent) {
    e.preventDefault();
    if (needsBranch && !branchId) { toast('err', 'Choose the branch this person serves in.'); return; }
    if (role === 'dept_leader' && !deptIds.length) { toast('err', 'Choose the department(s) this head leads.'); return; }
    if (role === 'cell_leader' && !cellIds.length) { toast('err', 'Choose the cell(s) this leader runs.'); return; }
    setBusy(true);
    // A department head automatically covers the departments under theirs.
    const fullDepts = role === 'dept_leader' ? [...new Set(deptIds.flatMap(deptWithChildren))] : [];
    const access = {
      role,
      branchId: needsBranch ? branchId : null,
      departmentIds: fullDepts,
      cellIds: role === 'cell_leader' ? cellIds.filter((c) => cells.find((x) => x.id === c)?.branchId === branchId) : [],
      active: role === 'pending' ? false : active,
    };
    try {
      if (user) {
        await updateDoc(doc(db, 'users', user.uid), access);
        toast('ok', `${user.displayName} updated.`);
        onClose();
      } else {
        // Create the login with a second Firebase instance so the admin stays signed in.
        const second = initializeApp(firebaseConfig, `create-${Date.now()}`);
        try {
          const a = getAuth(second);
          if (usingEmulators) connectAuthEmulator(a, 'http://127.0.0.1:9099', { disableWarnings: true });
          const cred = await createUserWithEmailAndPassword(a, email.trim(), password);
          await setDoc(doc(db, 'users', cred.user.uid), {
            ...access, email: email.trim().toLowerCase(), displayName: name.trim(), phone: phone.trim(), createdAt: serverTimestamp(), createdBy: profile?.uid ?? '',
          });
          await signOut(a);
        } finally { await deleteApp(second); }
        setCreated({ email: email.trim(), password });
      }
    } catch (err) { toast('err', errorText(err)); } finally { setBusy(false); }
  }

  if (created) {
    return (
      <Modal open onClose={onClose} title="Account created">
        <p className="text-sm text-stone-600">Give these sign-in details to <b>{name}</b>. They can change the password with “Forgot password?” on the login page.</p>
        <div className="mt-4 space-y-2 rounded-xl bg-royal-950 p-4 font-mono text-sm text-white">
          <div><span className="text-royal-300">Email: </span>{created.email}</div>
          <div><span className="text-royal-300">Password: </span>{created.password}</div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => navigator.clipboard.writeText(`Email: ${created.email}\nPassword: ${created.password}`)}>Copy</Button>
          <Button onClick={onClose}>Done</Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title={user ? user.displayName : 'Add user'}>
      <form onSubmit={save} className="space-y-4">
        {!user && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" className="sm:col-span-2"><Input required value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Email (used to sign in)"><Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="Phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
            <Field label="Temporary password" className="sm:col-span-2" hint="At least 6 characters. You will see it once more after saving."><Input required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          </div>
        )}
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
            <span className="mb-2 block text-sm font-medium text-stone-700">Departments they lead <span className="font-normal text-stone-400">(sub-departments are included automatically)</span></span>
            <div className="flex flex-wrap gap-2">
              {deptTree.map(({ dept: d }) => {
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
        {role === 'cell_leader' && (
          <div>
            <span className="mb-2 block text-sm font-medium text-stone-700">Cells they lead</span>
            {cells.filter((c) => c.branchId === branchId).length === 0 ? <p className="text-sm text-stone-500">{branchId ? 'No cells in this branch yet.' : 'Choose a branch first.'}</p> : (
              <div className="flex flex-wrap gap-2">
                {cells.filter((c) => c.branchId === branchId).map((c) => {
                  const on = cellIds.includes(c.id);
                  return (
                    <button type="button" key={c.id} onClick={() => setCellIds(on ? cellIds.filter((x) => x !== c.id) : [...cellIds, c.id])}
                      className={`rounded-full border px-3 py-1.5 text-sm ${on ? 'border-royal-600 bg-royal-600 text-white' : 'border-stone-300 text-stone-600'}`}>
                      {c.name}
                    </button>
                  );
                })}
              </div>
            )}
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
          <Button type="submit" loading={busy}>{user ? 'Save' : 'Create account'}</Button>
        </div>
      </form>
    </Modal>
  );
}
