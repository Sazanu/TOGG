import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { deleteApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signOut } from 'firebase/auth';
import { collection, doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { Pencil, ShieldCheck, UserPlus } from 'lucide-react';
import { Avatar, Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Spinner, errorText, useToast } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { officesOf } from '../lib/offices';
import { db, firebaseConfig, usingEmulators } from '../lib/firebase';
import { AREA_LABELS, ASSIGNABLE_ROLES, GRANTABLE, ROLE_DESCRIPTIONS, ROLE_LABELS, areasForRole, isGlobal, type Area, type Role } from '../lib/roles';
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
  // Opened from Leadership → "Login access": fill the form from the member's roles.
  const [params, setParams] = useSearchParams();
  const { memberById, deptTree, cells } = useData();
  const prefill = useMemo<Prefill | undefined>(() => {
    const m = memberById.get(params.get('member') ?? '');
    if (!m) return undefined;
    const depts = deptTree.filter(({ dept }) => dept.headMemberId === m.id || dept.assistantMemberId === m.id).map(({ dept }) => dept.id);
    const myCells = cells.filter((c) => c.leaderMemberId === m.id).map((c) => c.id);
    const pos = m.positions ?? [];
    const role: Role = pos.includes('Head Pastor') ? 'head_pastor' : pos.includes('Associate Pastor') ? 'associate_pastor' : pos.includes('Pastor') ? 'branch_pastor'
      : depts.length ? 'dept_leader' : myCells.length ? 'cell_leader' : 'secretary';
    return { name: `${m.title ? `${m.title} ` : ''}${m.firstName} ${m.lastName}`.trim(), phone: m.phone, email: m.email, role, branchId: m.branchId, departmentIds: depts, cellIds: myCells, memberId: m.id };
  }, [params, memberById, deptTree, cells]);
  useEffect(() => {
    if (!prefill || !users) return;
    const existing = users.find((u) => (u as AppUser & { memberId?: string }).memberId === prefill.memberId || (prefill.email && u.email === prefill.email.toLowerCase()));
    if (existing) setEditing(existing); else setAdding(true);
    params.delete('member'); setParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill, users]);
  const [prefillUsed, setPrefillUsed] = useState<Prefill | undefined>(undefined);
  useEffect(() => { if (prefill) setPrefillUsed(prefill); }, [prefill]);

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
                  {(u.revoked?.length ?? 0) > 0 && <Badge color="gray">{u.revoked!.length} area{u.revoked!.length > 1 ? 's' : ''} off</Badge>}
                  <Badge color={u.active ? ROLE_COLOR[u.role] ?? 'royal' : 'red'}>{u.active ? ROLE_LABELS[u.role] : 'Disabled'}</Badge>
                  <button disabled={locked} onClick={() => setEditing(u)} className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-royal-700 disabled:invisible" aria-label="Edit"><Pencil className="h-4 w-4" /></button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {editing && <UserForm user={editing} onClose={() => setEditing(null)} />}
      {adding && <UserForm user={null} all={users} prefill={prefillUsed} onClose={() => { setAdding(false); setPrefillUsed(undefined); }} />}
    </div>
  );
}

interface Prefill { name: string; phone: string; email: string; role: Role; branchId: string; departmentIds: string[]; cellIds: string[]; memberId: string }

function UserForm({ user, onClose, all, prefill }: { user: AppUser | null; onClose: () => void; all?: AppUser[] | null; prefill?: Prefill }) {
  const { profile } = useAuth();
  const { branches, deptTree, cells, deptWithChildren, members } = useData();
  const toast = useToast();
  const [role, setRole] = useState<Role>(user?.role ?? prefill?.role ?? 'secretary');
  const [branchId, setBranchId] = useState(user?.branchId ?? prefill?.branchId ?? '');
  const [memberId, setMemberId] = useState(user?.memberId ?? prefill?.memberId ?? '');
  const allDepts = deptTree.map(({ dept }) => dept);
  const offices = memberId ? officesOf(memberId, allDepts, cells) : { departmentIds: [], cellIds: [] };
  // What was given by hand (not by an office) stays editable; office access is shown locked.
  const [deptIds, setDeptIds] = useState<string[]>(() => {
    const off = new Set([...(user?.officeDepartmentIds ?? []), ...offices.departmentIds]);
    return (user?.departmentIds ?? prefill?.departmentIds ?? []).filter((x) => !off.has(x));
  });
  const [cellIds, setCellIds] = useState<string[]>(() => {
    const off = new Set([...(user?.officeCellIds ?? []), ...offices.cellIds]);
    return (user?.cellIds ?? prefill?.cellIds ?? []).filter((x) => !off.has(x));
  });
  const [revoked, setRevoked] = useState<Area[]>(user?.revoked ?? []);
  const [granted, setGranted] = useState<Area[]>(user?.granted ?? []);
  const [active, setActive] = useState(!user || user.role === 'pending' ? true : user.active);
  const [name, setName] = useState(prefill?.name ?? '');
  const [email, setEmail] = useState(prefill?.email ?? '');
  const [phone, setPhone] = useState(prefill?.phone ?? '');
  const [password, setPassword] = useState(() => `Togg-${Math.random().toString(36).slice(2, 8)}`);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const allowedRoles = ASSIGNABLE_ROLES.filter((r) => (profile?.role === 'head_pastor' || !isGlobal(r)) && (user || r !== 'pending'));
  const needsBranch = !isGlobal(role) && role !== 'pending';

  async function save(e: FormEvent) {
    e.preventDefault();
    if (needsBranch && !branchId) { toast('err', 'Choose the branch this person serves in.'); return; }
    if (role === 'dept_leader' && !deptIds.length && !offices.departmentIds.length) { toast('err', 'Choose the department(s) this head leads, or link their member record if they are a department head.'); return; }
    if (role === 'cell_leader' && !cellIds.length && !offices.cellIds.length) { toast('err', 'Choose the cell(s) this leader runs, or link their member record if they lead a cell.'); return; }
    setBusy(true);
    // A department head automatically covers the departments under theirs.
    const leads = !isGlobal(role) && role !== 'pending';
    const fullDepts = leads ? [...new Set([...deptIds.flatMap(deptWithChildren), ...offices.departmentIds])] : [];
    const access = {
      role,
      branchId: needsBranch ? branchId : null,
      departmentIds: fullDepts,
      cellIds: leads ? [...new Set([...cellIds.filter((c) => cells.find((x) => x.id === c)?.branchId === branchId), ...offices.cellIds])] : [],
      officeDepartmentIds: leads ? offices.departmentIds : [],
      officeCellIds: leads ? offices.cellIds : [],
      memberId,
      active: role === 'pending' ? false : active,
      revoked: role === 'head_pastor' ? [] : revoked.filter((a) => areasForRole(role).includes(a)),
      granted: needsBranch ? granted.filter((a) => !areasForRole(role).includes(a)) : [],
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
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'auth/email-already-in-use') {
        const existing = all?.find((u) => u.email?.toLowerCase() === email.trim().toLowerCase());
        toast('err', existing
          ? `${email} already has an account (${existing.displayName}). Close this and edit them in the list instead.`
          : `${email} already has a login. Ask them to sign in once — they will then appear in this list as "Awaiting approval" and you can give them a role.`);
      } else toast('err', errorText(err));
    } finally { setBusy(false); }
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
        <Field label="Linked member record" hint="Link the person's member record: the departments they head and the cells they lead then give access automatically, and it is removed when the office changes.">
          <Select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            <option value="">Not linked</option>
            {members.filter((m) => !branchId || m.branchId === branchId || m.id === memberId).sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`))
              .map((m) => <option key={m.id} value={m.id}>{m.firstName} {m.lastName}{m.phone ? ` · ${m.phone}` : ''}</option>)}
          </Select>
        </Field>
        {(offices.departmentIds.length > 0 || offices.cellIds.length > 0) && (
          <div className="rounded-xl bg-gold-50 p-3 text-sm text-stone-700">
            <div className="mb-1 font-medium">From their offices (automatic)</div>
            <div className="flex flex-wrap gap-1.5">
              {offices.departmentIds.map((id) => <span key={id} className="rounded-full bg-gold-200 px-2.5 py-1 text-xs">{allDepts.find((d) => d.id === id)?.name ?? id}</span>)}
              {offices.cellIds.map((id) => <span key={id} className="rounded-full bg-gold-200 px-2.5 py-1 text-xs">Cell: {cells.find((c) => c.id === id)?.name ?? id}</span>)}
            </div>
          </div>
        )}
        {needsBranch && (
          <div>
            <span className="mb-2 block text-sm font-medium text-stone-700">{role === 'dept_leader' ? 'Departments they lead' : 'Also leads departments (optional)'} <span className="font-normal text-stone-400">(sub-departments are included automatically)</span></span>
            <div className="flex flex-wrap gap-2">
              {deptTree.filter(({ dept: d }) => !offices.departmentIds.includes(d.id)).map(({ dept: d }) => {
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
        {needsBranch && (
          <div>
            <span className="mb-2 block text-sm font-medium text-stone-700">{role === 'cell_leader' ? 'Cells they lead' : 'Also leads cells (optional)'}</span>
            {cells.filter((c) => c.branchId === branchId).length === 0 ? <p className="text-sm text-stone-500">{branchId ? 'No cells in this branch yet.' : 'Choose a branch first.'}</p> : (
              <div className="flex flex-wrap gap-2">
                {cells.filter((c) => c.branchId === branchId && !offices.cellIds.includes(c.id)).map((c) => {
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
        {needsBranch && (deptIds.length > 0 || cellIds.length > 0) && role !== 'dept_leader' && role !== 'cell_leader' && (
          <p className="-mt-2 text-xs text-emerald-700">One person, several roles: they keep everything their main role allows, plus access to the departments and cells they lead.</p>
        )}
        {role !== 'pending' && role !== 'head_pastor' && (
          <div className="rounded-xl border border-stone-200 p-4">
            <span className="block text-sm font-medium text-stone-700">What they can see</span>
            <span className="mb-3 block text-xs text-stone-500">
              {isGlobal(role) ? 'All branches.' : 'Only their own branch.'} Untick an area to take it away from this person.
            </span>
            <div className="grid gap-2 sm:grid-cols-2">
              {areasForRole(role).map((a) => (
                <label key={a} className="flex items-center gap-2 text-sm text-stone-700">
                  <input type="checkbox" className="rounded border-stone-300" checked={!revoked.includes(a)}
                    onChange={(e) => setRevoked(e.target.checked ? revoked.filter((x) => x !== a) : [...revoked, a])} />
                  {AREA_LABELS[a]}
                </label>
              ))}
            </div>
          </div>
        )}
        {needsBranch && GRANTABLE.some((a) => !areasForRole(role).includes(a)) && (
          <div className="rounded-xl border border-stone-200 p-4">
            <span className="block text-sm font-medium text-stone-700">Also give access to</span>
            <span className="mb-3 block text-xs text-stone-500">Extra areas on top of the {ROLE_LABELS[role]} role, for their own branch.</span>
            <div className="grid gap-2 sm:grid-cols-2">
              {GRANTABLE.filter((a) => !areasForRole(role).includes(a)).map((a) => (
                <label key={a} className="flex items-center gap-2 text-sm text-stone-700">
                  <input type="checkbox" className="rounded border-stone-300" checked={granted.includes(a)}
                    onChange={(e) => setGranted(e.target.checked ? [...granted, a] : granted.filter((x) => x !== a))} />
                  {AREA_LABELS[a]}
                </label>
              ))}
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
          <Button type="submit" loading={busy}>{user ? 'Save' : 'Create account'}</Button>
        </div>
      </form>
    </Modal>
  );
}
