import { useMemo, useState, type FormEvent } from 'react';
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { Download, Pencil, Plus, Search, Trash2, Upload, Users } from 'lucide-react';
import { ImportWizard, type ImportField } from '../components/ImportWizard';
import { Avatar, Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Spinner, Stat, Textarea, errorText, useToast } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { ALL, useData } from '../context/DataContext';
import { downloadExcel, normalizePhone, parseDateLoose } from '../lib/csv';
import { reserveMembershipNos } from '../lib/counters';
import { db } from '../lib/firebase';
import { ageFrom, initials, prettyDate, today } from '../lib/format';
import { can } from '../lib/roles';
import type { Member, MemberCategory, MemberStatus } from '../lib/types';

const CATEGORY_LABEL: Record<MemberCategory, string> = { adult: 'Adult', teen: 'Teen', child: 'Child' };
const STATUS_COLOR: Record<MemberStatus, 'green' | 'gray' | 'gold'> = { active: 'green', inactive: 'gray', visitor: 'gold' };

type Draft = Omit<Member, 'id'>;

export function emptyMember(branchId: string): Draft {
  return {
    firstName: '', lastName: '', phone: '', email: '', gender: '', dob: '', category: 'adult', status: 'active',
    branchId, departmentIds: [], address: '', occupation: '', maritalStatus: '', joinedAt: today(), notes: '',
    membershipNo: '', cellId: null, source: 'manual',
  };
}

const MEMBER_FIELDS: ImportField[] = [
  { key: 'name', label: 'Full name', aliases: ['fullname', 'name', 'membername', 'names'] },
  { key: 'firstName', label: 'First name', aliases: ['firstname', 'othernames', 'givenname', 'forename'] },
  { key: 'lastName', label: 'Last name', aliases: ['lastname', 'surname', 'familyname'] },
  { key: 'phone', label: 'Phone', aliases: ['phone', 'phonenumber', 'mobile', 'contact', 'telephone', 'tel', 'mobilenumber'] },
  { key: 'email', label: 'Email', aliases: ['email', 'emailaddress'] },
  { key: 'gender', label: 'Gender', aliases: ['gender', 'sex'] },
  { key: 'dob', label: 'Date of birth', aliases: ['dob', 'dateofbirth', 'birthday', 'birthdate'] },
  { key: 'category', label: 'Age group', aliases: ['category', 'agegroup', 'group'] },
  { key: 'departments', label: 'Department(s)', aliases: ['department', 'departments', 'ministry', 'ministries'] },
  { key: 'membershipNo', label: 'Membership / tithe no.', aliases: ['membershipno', 'membershipnumber', 'memberno', 'titheno', 'tithecardno', 'cardno', 'id'] },
  { key: 'address', label: 'Address / area', aliases: ['address', 'location', 'residence', 'area', 'hometown'] },
  { key: 'occupation', label: 'Occupation', aliases: ['occupation', 'profession', 'work', 'job'] },
  { key: 'maritalStatus', label: 'Marital status', aliases: ['maritalstatus', 'marital'] },
  { key: 'joinedAt', label: 'Date joined', aliases: ['datejoined', 'joined', 'joinedat', 'membershipdate', 'date'] },
];

export default function Members() {
  const { profile } = useAuth();
  const { members, membersLoading, branches, deptTree, cells, scope, branchName, deptName, cellName } = useData();
  const role = profile?.role;
  const isDeptHead = role === 'dept_leader';
  const myDepts = useMemo(() => (isDeptHead ? profile?.departmentIds ?? [] : []), [isDeptHead, profile?.departmentIds]);
  const fullWrite = can(role, 'members.write');
  const canAdd = can(role, 'members.add');
  const canEdit = (m: Member) => fullWrite || (isDeptHead && m.departmentIds?.some((d) => myDepts.includes(d)));

  const [q, setQ] = useState('');
  const [cat, setCat] = useState<'' | MemberCategory>('');
  const [status, setStatus] = useState<'' | MemberStatus>('');
  const [dept, setDept] = useState<string>(myDepts.length ? '__mine__' : '');
  const [cellF, setCellF] = useState('');
  const [editing, setEditing] = useState<Member | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return members.filter((m) => {
      if (cat && m.category !== cat) return false;
      if (status && m.status !== status) return false;
      if (dept === '__mine__' && !m.departmentIds?.some((d) => myDepts.includes(d))) return false;
      if (dept === '__none__' && m.departmentIds?.length) return false;
      if (dept && !dept.startsWith('__') && !m.departmentIds?.includes(dept)) return false;
      if (cellF === '__none__' && m.cellId) return false;
      if (cellF && cellF !== '__none__' && m.cellId !== cellF) return false;
      if (needle) {
        const hay = `${m.firstName} ${m.lastName} ${m.phone} ${m.email} ${m.membershipNo ?? ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [members, q, cat, status, dept, cellF, myDepts]);

  const counts = useMemo(() => ({
    adult: members.filter((m) => m.category === 'adult').length,
    teen: members.filter((m) => m.category === 'teen').length,
    child: members.filter((m) => m.category === 'child').length,
    visitors: members.filter((m) => m.status === 'visitor').length,
  }), [members]);

  function exportXlsx() {
    downloadExcel(`togg-members-${today()}.xlsx`, [{
      name: 'Members',
      rows: filtered.map((m) => ({
        'Membership no.': m.membershipNo ?? '', 'First name': m.firstName, 'Last name': m.lastName, Phone: m.phone, Email: m.email,
        Gender: m.gender, 'Date of birth': m.dob, 'Age group': m.category, Status: m.status, Branch: branchName(m.branchId),
        Departments: (m.departmentIds || []).map(deptName).join('; '), Cell: m.cellId ? cellName(m.cellId) : '',
        Address: m.address, Occupation: m.occupation, 'Marital status': m.maritalStatus, Joined: m.joinedAt,
      })),
    }]);
  }

  return (
    <div>
      <PageHeader
        title={isDeptHead ? 'Members' : 'Members'}
        subtitle={isDeptHead ? `Register and look after members of ${myDepts.map(deptName).join(', ') || 'your department'}` : `${scope === ALL ? 'All branches' : branchName(scope)} · adults, teens and children`}
        actions={
          <>
            <Button variant="outline" onClick={exportXlsx}><Download className="h-4 w-4" /> Excel</Button>
            {canAdd && <Button variant="outline" onClick={() => setImporting(true)}><Upload className="h-4 w-4" /> Import old file</Button>}
            {canAdd && <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Register member</Button>}
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
        <div className="flex flex-col gap-3 border-b border-stone-100 p-4 xl:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <Input className="pl-9" placeholder="Search name, phone, email or membership no…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:flex">
            <Select value={cat} onChange={(e) => setCat(e.target.value as MemberCategory | '')} className="xl:w-32">
              <option value="">All ages</option><option value="adult">Adults</option><option value="teen">Teens</option><option value="child">Children</option>
            </Select>
            <Select value={status} onChange={(e) => setStatus(e.target.value as MemberStatus | '')} className="xl:w-32">
              <option value="">All status</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="visitor">Visitor</option>
            </Select>
            <Select value={dept} onChange={(e) => setDept(e.target.value)} className="xl:w-48">
              <option value="">All departments</option>
              {myDepts.length > 0 && <option value="__mine__">My departments</option>}
              <option value="__none__">Not in a department</option>
              {deptTree.map(({ dept: d, depth }) => <option key={d.id} value={d.id}>{'  '.repeat(depth * 2)}{depth ? '↳ ' : ''}{d.name}</option>)}
            </Select>
            <Select value={cellF} onChange={(e) => setCellF(e.target.value)} className="xl:w-40">
              <option value="">All cells</option>
              <option value="__none__">Not in a cell</option>
              {cells.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
        </div>

        {membersLoading ? <Spinner /> : filtered.length === 0 ? (
          <Empty icon={<Users />} title={members.length ? 'No one matches those filters' : 'No members yet'}>
            {members.length === 0 && canAdd && 'Register members one by one, import your old Excel file, or share the /join link so people register themselves.'}
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
                    <th className="px-4 py-3 font-medium">Departments / cell</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Joined</th>
                    <th className="px-4 py-3" />
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
                            <div className="text-xs text-stone-500">
                              {m.membershipNo && <span className="mr-1 font-mono text-royal-600">{m.membershipNo}</span>}
                              {CATEGORY_LABEL[m.category]}{ageFrom(m.dob) !== null && ` · ${ageFrom(m.dob)} yrs`}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-stone-600">{m.phone || '—'}</td>
                      {scope === ALL && <td className="px-4 py-3 text-stone-600">{branchName(m.branchId)}</td>}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(m.departmentIds || []).map((d) => <Badge key={d} color="royal">{deptName(d)}</Badge>)}
                          {m.cellId && <Badge color="blue">Cell: {cellName(m.cellId)}</Badge>}
                        </div>
                      </td>
                      <td className="px-4 py-3"><Badge color={STATUS_COLOR[m.status]}>{m.status}</Badge></td>
                      <td className="px-4 py-3 text-stone-600">{prettyDate(m.joinedAt)}</td>
                      <td className="px-4 py-3 text-right">
                        {canEdit(m) && <button onClick={() => setEditing(m)} className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-royal-700" aria-label="Edit"><Pencil className="h-4 w-4" /></button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-stone-100 md:hidden">
              {filtered.map((m) => (
                <li key={m.id} className="flex items-center gap-3 p-4" onClick={() => canEdit(m) && setEditing(m)}>
                  <Avatar text={initials(m.firstName, m.lastName)} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-stone-900">{m.firstName} {m.lastName}</div>
                    <div className="truncate text-xs text-stone-500">{m.membershipNo ? `${m.membershipNo} · ` : ''}{m.phone || 'No phone'}{scope === ALL && ` · ${branchName(m.branchId)}`}</div>
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
          defaultBranch={profile?.branchId ?? (scope !== ALL ? scope : branches[0]?.id ?? '')}
          lockBranch={!!profile?.branchId}
          onClose={() => { setCreating(false); setEditing(null); }}
        />
      )}
      {importing && <MemberImport onClose={() => setImporting(false)} />}
    </div>
  );
}

function DeptChips({ value, onChange, allowed }: { value: string[]; onChange: (v: string[]) => void; allowed?: string[] }) {
  const { deptTree } = useData();
  const list = deptTree.filter(({ dept }) => !allowed || allowed.includes(dept.id));
  if (list.length === 0) return <p className="text-sm text-stone-500">No departments set up yet.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {list.map(({ dept, depth }) => {
        const on = value.includes(dept.id);
        return (
          <button type="button" key={dept.id} onClick={() => onChange(on ? value.filter((x) => x !== dept.id) : [...value, dept.id])}
            className={`rounded-full border px-3 py-1.5 text-sm transition ${on ? 'border-royal-600 bg-royal-600 text-white' : 'border-stone-300 bg-white text-stone-600 hover:border-royal-300'} ${depth ? 'text-xs' : 'font-medium'}`}>
            {depth > 0 && '↳ '}{dept.name}
          </button>
        );
      })}
    </div>
  );
}

export function MemberForm({ member, defaultBranch, lockBranch, onClose, presetDept, presetCell }: { member: Member | null; defaultBranch: string; lockBranch: boolean; onClose: () => void; presetDept?: string; presetCell?: string }) {
  const { profile } = useAuth();
  const { branches, cells } = useData();
  const toast = useToast();
  const isDeptHead = profile?.role === 'dept_leader';
  const fullWrite = can(profile?.role, 'members.write');
  const [d, setD] = useState<Draft>(() => {
    if (!member) return { ...emptyMember(defaultBranch), cellId: presetCell ?? null, departmentIds: presetDept ? [presetDept] : isDeptHead && profile?.departmentIds?.length === 1 ? [...profile.departmentIds] : [] };
    const { id: _id, ...rest } = member;
    return { ...emptyMember(member.branchId), ...rest };
  });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const branchCells = cells.filter((c) => c.branchId === d.branchId);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!d.branchId) { toast('err', 'Choose a branch.'); return; }
    if (isDeptHead && !d.departmentIds.some((x) => profile?.departmentIds.includes(x))) {
      toast('err', 'Choose at least one of your departments.'); return;
    }
    setBusy(true);
    try {
      const data = { ...d, firstName: d.firstName.trim(), lastName: d.lastName.trim(), cellId: d.cellId || null, updatedAt: serverTimestamp() };
      if (member) await updateDoc(doc(db, 'members', member.id), data);
      else {
        const membershipNo = d.membershipNo?.trim() || (await reserveMembershipNos(1))[0];
        await addDoc(collection(db, 'members'), { ...data, membershipNo, createdAt: serverTimestamp() });
      }
      toast('ok', member ? 'Member updated.' : 'Member registered.');
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

  return (
    <Modal open onClose={onClose} title={member ? 'Edit member' : 'Register member'} wide>
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
          <Field label="Membership / tithe card no." hint={member ? undefined : 'Leave empty to assign the next number automatically.'}>
            <Input value={d.membershipNo ?? ''} onChange={(e) => set('membershipNo', e.target.value)} placeholder="TOGG-0001" />
          </Field>
          <Field label="Cell">
            <Select value={d.cellId ?? ''} onChange={(e) => set('cellId', e.target.value || null)}>
              <option value="">Not in a cell</option>
              {branchCells.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
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
          <span className="mb-2 block text-sm font-medium text-stone-700">Departments{isDeptHead && ' (yours)'}</span>
          <DeptChips value={d.departmentIds} onChange={(v) => set('departmentIds', v)} allowed={isDeptHead ? profile?.departmentIds : undefined} />
        </div>

        <Field label="Notes"><Textarea value={d.notes} onChange={(e) => set('notes', e.target.value)} /></Field>

        <div className="flex items-center justify-between border-t border-stone-100 pt-4">
          {member && fullWrite ? <Button type="button" variant="ghost" className="text-red-600" onClick={remove} disabled={busy}><Trash2 className="h-4 w-4" /> Delete</Button> : <span />}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={busy}>{member ? 'Save changes' : 'Register member'}</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function MemberImport({ onClose }: { onClose: () => void }) {
  const { profile } = useAuth();
  const { branches, members, departments, deptTree, scope } = useData();
  const isDeptHead = profile?.role === 'dept_leader';
  const [branchId, setBranchId] = useState(profile?.branchId ?? (scope !== ALL ? scope : ''));
  const [forceDept, setForceDept] = useState(isDeptHead && profile?.departmentIds.length ? profile.departmentIds[0] : '');
  const [skipDupes, setSkipDupes] = useState(true);

  async function run(rows: Record<string, string>[]) {
    if (!branchId) throw new Error('Choose the branch these members belong to.');
    const deptByName = new Map(departments.map((d) => [d.name.toLowerCase().replace(/[^a-z0-9]/g, ''), d.id]));
    const havePhones = new Set(members.filter((m) => m.branchId === branchId && m.phone).map((m) => normalizePhone(m.phone)));
    const haveNames = new Set(members.filter((m) => m.branchId === branchId).map((m) => `${m.firstName} ${m.lastName}`.toLowerCase().trim()));
    const notes: string[] = [];
    const ready: Draft[] = [];
    let skipped = 0;
    rows.forEach((r, i) => {
      let first = r.firstName; let last = r.lastName;
      if (!first && r.name) {
        const parts = r.name.split(/\s+/).filter(Boolean);
        first = parts[0] ?? ''; last = parts.slice(1).join(' ');
      }
      if (!first) { skipped++; notes.push(`Row ${i + 2}: no name`); return; }
      const phone = r.phone ? normalizePhone(r.phone) : '';
      const key = `${first} ${last}`.toLowerCase().trim();
      if (skipDupes && ((phone && havePhones.has(phone)) || haveNames.has(key))) { skipped++; notes.push(`Row ${i + 2}: ${first} ${last} already exists`); return; }
      if (phone) havePhones.add(phone);
      haveNames.add(key);
      const g = (r.gender || '').toLowerCase();
      const c = (r.category || '').toLowerCase();
      const dob = parseDateLoose(r.dob);
      const age = dob ? new Date().getFullYear() - Number(dob.slice(0, 4)) : null;
      const category: MemberCategory = c.startsWith('child') || c.startsWith('kid') ? 'child' : c.startsWith('teen') || c.startsWith('youth') ? 'teen'
        : c ? 'adult' : age !== null && age < 13 ? 'child' : age !== null && age < 18 ? 'teen' : 'adult';
      let departmentIds = (r.departments || '').split(/[;,/]/).map((s) => deptByName.get(s.toLowerCase().replace(/[^a-z0-9]/g, ''))).filter((x): x is string => !!x);
      if (forceDept && !departmentIds.includes(forceDept)) departmentIds = [...departmentIds, forceDept];
      ready.push({
        ...emptyMember(branchId), firstName: first, lastName: last, phone, email: r.email, gender: g.startsWith('m') ? 'male' : g.startsWith('f') ? 'female' : '',
        dob, category, departmentIds, address: r.address, occupation: r.occupation, maritalStatus: r.maritalStatus,
        joinedAt: parseDateLoose(r.joinedAt) || today(), membershipNo: r.membershipNo, source: 'import',
      });
    });
    const needNos = ready.filter((m) => !m.membershipNo).length;
    const nos = await reserveMembershipNos(needNos);
    let n = 0;
    ready.forEach((m) => { if (!m.membershipNo) m.membershipNo = nos[n++]; });
    for (let i = 0; i < ready.length; i += 400) {
      const batch = writeBatch(db);
      ready.slice(i, i + 400).forEach((m) => batch.set(doc(collection(db, 'members')), { ...m, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
      await batch.commit();
    }
    return { added: ready.length, skipped, notes };
  }

  return (
    <ImportWizard
      title="Import members from an old file"
      fields={MEMBER_FIELDS}
      onClose={onClose}
      onImport={run}
      help={<>Works with old Excel registers and CSV exports. Use <b>Full name</b> <i>or</i> First + Last name. Dates like <code>05/03/1990</code> are read day-first. Members without a membership number get the next TOGG number.</>}
      options={
        <div className="grid gap-3 rounded-xl border border-stone-200 p-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-stone-700">Branch</span>
            <Select required value={branchId} disabled={!!profile?.branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">Choose…</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-stone-700">Also put everyone in department</span>
            <Select value={forceDept} onChange={(e) => setForceDept(e.target.value)} required={isDeptHead}>
              {!isDeptHead && <option value="">— no —</option>}
              {deptTree.filter(({ dept }) => !isDeptHead || profile?.departmentIds.includes(dept.id)).map(({ dept, depth }) => <option key={dept.id} value={dept.id}>{depth ? '↳ ' : ''}{dept.name}</option>)}
            </Select>
          </label>
          <label className="flex items-center gap-2 text-sm text-stone-700 sm:col-span-2">
            <input type="checkbox" checked={skipDupes} onChange={(e) => setSkipDupes(e.target.checked)} className="rounded border-stone-300" />
            Skip people already registered (same phone number or same name)
          </label>
        </div>
      }
    />
  );
}
