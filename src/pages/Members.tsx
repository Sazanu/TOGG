import { useMemo, useRef, useState, type FormEvent } from 'react';
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { Download, Pencil, Plus, Search, Trash2, Upload, Users } from 'lucide-react';
import { Avatar, Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Spinner, Stat, Textarea, errorText, useToast } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { ALL, useData } from '../context/DataContext';
import { downloadCsv, parseCsv } from '../lib/csv';
import { db } from '../lib/firebase';
import { ageFrom, initials, prettyDate, today } from '../lib/format';
import { can } from '../lib/roles';
import type { Member, MemberCategory, MemberStatus } from '../lib/types';

const CATEGORY_LABEL: Record<MemberCategory, string> = { adult: 'Adult', teen: 'Teen', child: 'Child' };
const STATUS_COLOR: Record<MemberStatus, 'green' | 'gray' | 'gold'> = { active: 'green', inactive: 'gray', visitor: 'gold' };

type Draft = Omit<Member, 'id'>;

function emptyDraft(branchId: string): Draft {
  return {
    firstName: '', lastName: '', phone: '', email: '', gender: '', dob: '', category: 'adult', status: 'active',
    branchId, departmentIds: [], address: '', occupation: '', maritalStatus: '', joinedAt: today(), notes: '',
  };
}

export default function Members() {
  const { profile } = useAuth();
  const { members, membersLoading, branches, departments, scope, branchName, deptName } = useData();
  const toast = useToast();
  const canWrite = can(profile?.role, 'members.write');
  const myDepts = profile?.role === 'dept_leader' ? profile.departmentIds : [];

  const [q, setQ] = useState('');
  const [cat, setCat] = useState<'' | MemberCategory>('');
  const [status, setStatus] = useState<'' | MemberStatus>('');
  const [dept, setDept] = useState<string>(myDepts.length ? '__mine__' : '');
  const [editing, setEditing] = useState<Member | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return members.filter((m) => {
      if (cat && m.category !== cat) return false;
      if (status && m.status !== status) return false;
      if (dept === '__mine__' && !m.departmentIds?.some((d) => myDepts.includes(d))) return false;
      if (dept && dept !== '__mine__' && !m.departmentIds?.includes(dept)) return false;
      if (needle) {
        const hay = `${m.firstName} ${m.lastName} ${m.phone} ${m.email}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [members, q, cat, status, dept, myDepts]);

  const counts = useMemo(() => ({
    adult: members.filter((m) => m.category === 'adult').length,
    teen: members.filter((m) => m.category === 'teen').length,
    child: members.filter((m) => m.category === 'child').length,
    visitors: members.filter((m) => m.status === 'visitor').length,
  }), [members]);

  function exportCsv() {
    downloadCsv(`togg-members-${today()}.csv`, filtered.map((m) => ({
      'First name': m.firstName, 'Last name': m.lastName, Phone: m.phone, Email: m.email, Gender: m.gender,
      'Date of birth': m.dob, Category: m.category, Status: m.status, Branch: branchName(m.branchId),
      Departments: (m.departmentIds || []).map(deptName).join('; '), Address: m.address, Occupation: m.occupation,
      'Marital status': m.maritalStatus, Joined: m.joinedAt,
    })));
  }

  async function importCsv(file: File) {
    const targetBranch = scope !== ALL ? scope : '';
    if (!targetBranch) { toast('err', 'Pick a branch in the sidebar first, then import.'); return; }
    setImporting(true);
    try {
      const rows = await parseCsv(file);
      const deptByName = new Map(departments.map((d) => [d.name.toLowerCase(), d.id]));
      let added = 0;
      for (let i = 0; i < rows.length; i += 400) {
        const batch = writeBatch(db);
        for (const r of rows.slice(i, i + 400)) {
          const firstName = (r.firstname || r.name?.split(' ')[0] || '').trim();
          const lastName = (r.lastname || r.surname || r.name?.split(' ').slice(1).join(' ') || '').trim();
          if (!firstName) continue;
          const category = (['adult', 'teen', 'child'].includes((r.category || '').toLowerCase()) ? r.category.toLowerCase() : 'adult') as MemberCategory;
          const g = (r.gender || '').toLowerCase();
          const departmentIds = (r.departments || r.department || '')
            .split(/[;,]/).map((s) => deptByName.get(s.trim().toLowerCase())).filter((x): x is string => !!x);
          batch.set(doc(collection(db, 'members')), {
            ...emptyDraft(targetBranch),
            firstName, lastName,
            phone: (r.phone || r.phonenumber || '').trim(),
            email: (r.email || '').trim(),
            gender: g.startsWith('m') ? 'male' : g.startsWith('f') ? 'female' : '',
            dob: (r.dateofbirth || r.dob || '').trim(),
            category, departmentIds,
            address: (r.address || '').trim(),
            occupation: (r.occupation || '').trim(),
            joinedAt: (r.joined || r.joinedat || today()).trim(),
            createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
          });
          added++;
        }
        await batch.commit();
      }
      toast('ok', `Imported ${added} members into ${branchName(targetBranch)}.`);
    } catch (e) {
      toast('err', errorText(e));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div>
      <PageHeader
        title="Members"
        subtitle={`${scope === ALL ? 'All branches' : branchName(scope)} · adults, teens and children`}
        actions={
          <>
            <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4" /> Export</Button>
            {canWrite && (
              <>
                <input ref={fileRef} type="file" accept=".csv" hidden onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])} />
                <Button variant="outline" loading={importing} onClick={() => fileRef.current?.click()} title="Columns: First name, Last name, Phone, Email, Gender, Date of birth, Category, Departments">
                  <Upload className="h-4 w-4" /> Import CSV
                </Button>
                <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Add member</Button>
              </>
            )}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Adults" value={counts.adult} />
        <Stat label="Teens" value={counts.teen} />
        <Stat label="Children" value={counts.child} />
        <Stat label="Visitors" value={counts.visitors} />
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-stone-100 p-4 lg:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <Input className="pl-9" placeholder="Search name, phone or email…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-2 lg:flex">
            <Select value={cat} onChange={(e) => setCat(e.target.value as MemberCategory | '')} className="lg:w-36">
              <option value="">All ages</option><option value="adult">Adults</option><option value="teen">Teens</option><option value="child">Children</option>
            </Select>
            <Select value={status} onChange={(e) => setStatus(e.target.value as MemberStatus | '')} className="lg:w-36">
              <option value="">All status</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="visitor">Visitor</option>
            </Select>
            <Select value={dept} onChange={(e) => setDept(e.target.value)} className="lg:w-44">
              <option value="">All departments</option>
              {myDepts.length > 0 && <option value="__mine__">My departments</option>}
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </div>
        </div>

        {membersLoading ? <Spinner /> : filtered.length === 0 ? (
          <Empty icon={<Users />} title={members.length ? 'No one matches those filters' : 'No members yet'}>
            {members.length === 0 && canWrite && 'Add members one by one, import a CSV, or share the /join link so people register themselves.'}
          </Empty>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-100 text-left text-xs uppercase tracking-wide text-stone-500">
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Phone</th>
                    {scope === ALL && <th className="px-4 py-3 font-medium">Branch</th>}
                    <th className="px-4 py-3 font-medium">Departments</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Joined</th>
                    {canWrite && <th className="px-4 py-3" />}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m) => (
                    <tr key={m.id} className="border-b border-stone-50 last:border-0 hover:bg-stone-50/60">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar text={initials(m.firstName, m.lastName)} />
                          <div>
                            <div className="font-medium text-stone-900">{m.firstName} {m.lastName}</div>
                            <div className="text-xs text-stone-500">{CATEGORY_LABEL[m.category]}{ageFrom(m.dob) !== null && ` · ${ageFrom(m.dob)} yrs`}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-stone-600">{m.phone || '—'}</td>
                      {scope === ALL && <td className="px-4 py-3 text-stone-600">{branchName(m.branchId)}</td>}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">{(m.departmentIds || []).map((d) => <Badge key={d} color="royal">{deptName(d)}</Badge>)}</div>
                      </td>
                      <td className="px-4 py-3"><Badge color={STATUS_COLOR[m.status]}>{m.status}</Badge></td>
                      <td className="px-4 py-3 text-stone-600">{prettyDate(m.joinedAt)}</td>
                      {canWrite && (
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => setEditing(m)} className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-royal-700" aria-label="Edit"><Pencil className="h-4 w-4" /></button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-stone-100 md:hidden">
              {filtered.map((m) => (
                <li key={m.id} className="flex items-center gap-3 p-4" onClick={() => canWrite && setEditing(m)}>
                  <Avatar text={initials(m.firstName, m.lastName)} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-stone-900">{m.firstName} {m.lastName}</div>
                    <div className="truncate text-xs text-stone-500">{m.phone || 'No phone'}{scope === ALL && ` · ${branchName(m.branchId)}`}</div>
                  </div>
                  <Badge color={STATUS_COLOR[m.status]}>{m.status}</Badge>
                </li>
              ))}
            </ul>
            <div className="border-t border-stone-100 px-4 py-3 text-xs text-stone-500">{filtered.length} of {members.length} shown</div>
          </>
        )}
      </Card>

      {(creating || editing) && (
        <MemberForm
          member={editing}
          defaultBranch={scope !== ALL ? scope : profile?.branchId ?? branches[0]?.id ?? ''}
          lockBranch={!!profile?.branchId}
          onClose={() => { setCreating(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

function MemberForm({ member, defaultBranch, lockBranch, onClose }: { member: Member | null; defaultBranch: string; lockBranch: boolean; onClose: () => void }) {
  const { branches, departments } = useData();
  const toast = useToast();
  const [d, setD] = useState<Draft>(() => {
    if (!member) return emptyDraft(defaultBranch);
    const { id: _id, ...rest } = member;
    return { ...emptyDraft(member.branchId), ...rest };
  });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!d.branchId) { toast('err', 'Choose a branch.'); return; }
    setBusy(true);
    try {
      const data = { ...d, firstName: d.firstName.trim(), lastName: d.lastName.trim(), updatedAt: serverTimestamp() };
      if (member) await updateDoc(doc(db, 'members', member.id), data);
      else await addDoc(collection(db, 'members'), { ...data, createdAt: serverTimestamp() });
      toast('ok', member ? 'Member updated.' : 'Member added.');
      onClose();
    } catch (err) {
      toast('err', errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!member || !confirm(`Delete ${member.firstName} ${member.lastName}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await deleteDoc(doc(db, 'members', member.id));
      toast('ok', 'Member deleted.');
      onClose();
    } catch (err) {
      toast('err', errorText(err));
      setBusy(false);
    }
  }

  function toggleDept(id: string) {
    set('departmentIds', d.departmentIds.includes(id) ? d.departmentIds.filter((x) => x !== id) : [...d.departmentIds, id]);
  }

  return (
    <Modal open onClose={onClose} title={member ? 'Edit member' : 'Add member'} wide>
      <form onSubmit={save} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name"><Input required value={d.firstName} onChange={(e) => set('firstName', e.target.value)} /></Field>
          <Field label="Last name"><Input required value={d.lastName} onChange={(e) => set('lastName', e.target.value)} /></Field>
          <Field label="Phone"><Input value={d.phone} onChange={(e) => set('phone', e.target.value)} placeholder="024 000 0000" /></Field>
          <Field label="Email"><Input type="email" value={d.email} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="Gender">
            <Select value={d.gender} onChange={(e) => set('gender', e.target.value as Draft['gender'])}>
              <option value="">—</option><option value="male">Male</option><option value="female">Female</option>
            </Select>
          </Field>
          <Field label="Date of birth"><Input type="date" value={d.dob} onChange={(e) => set('dob', e.target.value)} /></Field>
          <Field label="Age group">
            <Select value={d.category} onChange={(e) => set('category', e.target.value as MemberCategory)}>
              <option value="adult">Adult</option><option value="teen">Teen</option><option value="child">Child</option>
            </Select>
          </Field>
          <Field label="Status">
            <Select value={d.status} onChange={(e) => set('status', e.target.value as MemberStatus)}>
              <option value="active">Active</option><option value="inactive">Inactive</option><option value="visitor">Visitor</option>
            </Select>
          </Field>
          <Field label="Branch">
            <Select required value={d.branchId} disabled={lockBranch} onChange={(e) => set('branchId', e.target.value)}>
              <option value="">Choose…</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
          <Field label="Date joined"><Input type="date" value={d.joinedAt} onChange={(e) => set('joinedAt', e.target.value)} /></Field>
          <Field label="Marital status">
            <Select value={d.maritalStatus} onChange={(e) => set('maritalStatus', e.target.value)}>
              <option value="">—</option><option>Single</option><option>Married</option><option>Widowed</option><option>Divorced</option>
            </Select>
          </Field>
          <Field label="Occupation"><Input value={d.occupation} onChange={(e) => set('occupation', e.target.value)} /></Field>
          <Field label="Address / area" className="sm:col-span-2"><Input value={d.address} onChange={(e) => set('address', e.target.value)} /></Field>
        </div>

        <div>
          <span className="mb-2 block text-sm font-medium text-stone-700">Departments</span>
          {departments.length === 0 ? <p className="text-sm text-stone-500">No departments set up yet.</p> : (
            <div className="flex flex-wrap gap-2">
              {departments.map((dep) => {
                const on = d.departmentIds.includes(dep.id);
                return (
                  <button type="button" key={dep.id} onClick={() => toggleDept(dep.id)}
                    className={`rounded-full border px-3 py-1.5 text-sm transition ${on ? 'border-royal-600 bg-royal-600 text-white' : 'border-stone-300 bg-white text-stone-600 hover:border-royal-300'}`}>
                    {dep.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <Field label="Notes"><Textarea value={d.notes} onChange={(e) => set('notes', e.target.value)} /></Field>

        <div className="flex items-center justify-between border-t border-stone-100 pt-4">
          {member ? <Button type="button" variant="ghost" className="text-red-600" onClick={remove} disabled={busy}><Trash2 className="h-4 w-4" /> Delete</Button> : <span />}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={busy}>{member ? 'Save changes' : 'Add member'}</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
