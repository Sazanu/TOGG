import { useMemo, useState, type FormEvent } from 'react';
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { Download, Pencil, Plus, Search, Trash2, Upload, Users } from 'lucide-react';
import { ImportWizard, type ImportField } from '../components/ImportWizard';
import { Avatar, Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Spinner, Stat, Textarea, errorText, useToast } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { ALL, useData } from '../context/DataContext';
import { downloadExcel, normalizePhone, parseDateLoose } from '../lib/csv';
import { reserveMembershipNos } from '../lib/counters';
import { withAutoDepts } from '../lib/autoDepts';
import { Link } from 'react-router-dom';
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
    membershipNo: '', cellId: null, source: 'manual', title: '',
  };
}

const TITLE_RE = /^(rev|revd|mrs|mr|miss|ms|dr|ps|pastor|lady|elder|deacon|deaconess|bro|sis|evang|apostle|prophet|prophetess)\.?\s+/i;
const STATUS_LABEL: Record<MemberStatus, string> = { active: 'Members', visitor: 'Visitors', inactive: 'Not active' };

/** Old lists write status in many ways. */
function readStatus(v: string): MemberStatus | null {
  const s = (v || '').toLowerCase();
  if (!s) return null;
  if (/visit|guest|first/.test(s)) return 'visitor';
  if (/in-?active|not|former|old|left|dormant|travel|no\b/.test(s)) return 'inactive';
  return 'active';
}
function readMarital(v: string): string {
  const s = (v || '').toLowerCase();
  if (!s) return '';
  if (s.startsWith('unmarr') || s.startsWith('single')) return 'Single';
  if (s.startsWith('marr')) return 'Married';
  if (s.startsWith('wid')) return 'Widowed';
  if (s.startsWith('div') || s.startsWith('sep')) return 'Divorced';
  return v;
}
const tidy = (s: string) => (s && s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s\-'.(])(\p{L})/gu, (_m, a, b) => a + b.toUpperCase()) : s || '');

const MEMBER_FIELDS: ImportField[] = [
  { key: 'title', label: 'Title', aliases: ['title', 'salutation'] },
  { key: 'status', label: 'Status', aliases: ['status', 'memberstatus', 'active', 'membership'] },
  { key: 'notes', label: 'Notes', aliases: ['notes', 'note', 'remarks', 'comment', 'comments'] },
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
  const [status, setStatus] = useState<'' | MemberStatus>('active');
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
    adult: members.filter((m) => m.status === 'active' && m.category === 'adult').length,
    teen: members.filter((m) => m.status === 'active' && m.category === 'teen').length,
    child: members.filter((m) => m.status === 'active' && m.category === 'child').length,
    active: members.filter((m) => m.status === 'active').length,
    visitors: members.filter((m) => m.status === 'visitor').length,
    inactive: members.filter((m) => m.status === 'inactive').length,
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
        <Stat label="Active members" value={counts.active} sub={`${counts.adult} adults · ${counts.teen} teens · ${counts.child} children`} />
        <Stat label="Visitors" value={counts.visitors} />
        <Stat label="Not active / former" value={counts.inactive} sub="Kept, but outside the main membership" />
        <Stat label="Everyone on record" value={members.length} />
      </div>

      <div className="mb-3 flex gap-1 overflow-x-auto rounded-2xl border border-stone-200 bg-white p-1">
        {(['active', 'visitor', 'inactive', ''] as const).map((s) => (
          <button key={s || 'all'} onClick={() => setStatus(s)} className={`shrink-0 rounded-xl px-4 py-2 text-sm font-medium ${status === s ? 'bg-royal-800 text-white' : 'text-stone-600 hover:bg-stone-100'}`}>
            {s ? STATUS_LABEL[s] : 'Everyone'} <span className="opacity-60">({s === 'active' ? counts.active : s === 'visitor' ? counts.visitors : s === 'inactive' ? counts.inactive : members.length})</span>
          </button>
        ))}
      </div>
      {status === 'inactive' && (
        <p className="mb-3 rounded-xl bg-stone-100 px-4 py-2 text-sm text-stone-600">
          People who are no longer active — e.g. not on the latest official membership list. Their records are kept. Open someone and set Status to <b>Active</b> if they return.
        </p>
      )}
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
                            <Link to={`/members/${m.id}`} className="font-medium text-stone-900 hover:text-royal-700 hover:underline">{m.title && <span className="text-stone-500">{m.title} </span>}{m.firstName} {m.lastName}</Link>
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
                      <td className="px-4 py-3"><Badge color={STATUS_COLOR[m.status]}>{m.status === 'inactive' ? 'not active' : m.status}</Badge></td>
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
                <li key={m.id}><Link to={`/members/${m.id}`} className="flex items-center gap-3 p-4">
                  <Avatar text={initials(m.firstName, m.lastName)} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-stone-900">{m.title && `${m.title} `}{m.firstName} {m.lastName}</div>
                    <div className="truncate text-xs text-stone-500">{m.membershipNo ? `${m.membershipNo} · ` : ''}{m.phone || 'No phone'}{scope === ALL && ` · ${branchName(m.branchId)}`}</div>
                  </div>
                  <Badge color={STATUS_COLOR[m.status]}>{m.status === 'inactive' ? 'not active' : m.status}</Badge>
                </Link></li>
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
  const { branches, cells, departments } = useData();
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
      // Golden Heart / Diamond Heart follow marital status (department heads cannot change other departments).
      const departmentIds = fullWrite ? withAutoDepts(d, departments) : d.departmentIds;
      const data = { ...d, departmentIds, firstName: d.firstName.trim(), lastName: d.lastName.trim(), cellId: d.cellId || null, updatedAt: serverTimestamp() };
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
          <Field label="Title (optional)" hint="Rev., Mrs., Ps., Elder… SMS still greet them by first name."><Input value={d.title ?? ''} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Rev." /></Field>
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
              <option value="active">Active</option><option value="inactive">Not active</option><option value="visitor">Visitor</option>
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
        {fullWrite && (
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input type="checkbox" checked={!!d.welfareExempt} onChange={(e) => set('welfareExempt', e.target.checked)} className="rounded border-stone-300" />
            Excused from monthly welfare dues
          </label>
        )}

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
  const [officialList, setOfficialList] = useState(false);
  const canMark = can(profile?.role, 'members.write');

  async function run(rows: Record<string, string>[]) {
    if (!branchId) throw new Error('Choose the branch these members belong to.');
    const deptByName = new Map(departments.map((d) => [d.name.toLowerCase().replace(/[^a-z0-9]/g, ''), d.id]));
    // Families sometimes share one phone, so a phone only means "duplicate" when the names also overlap.
    const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w.length > 1));
    const sameName = (a: string, b: string) => { const A = words(a); return [...words(b)].some((w) => A.has(w)); };
    const havePhones = new Map<string, string[]>();
    members.filter((m) => m.branchId === branchId && m.phone).forEach((m) => { const k = normalizePhone(m.phone); havePhones.set(k, [...(havePhones.get(k) ?? []), `${m.firstName} ${m.lastName}`]); });
    const haveNames = new Set(members.filter((m) => m.branchId === branchId).map((m) => `${m.firstName} ${m.lastName}`.toLowerCase().trim()));
    const notes: string[] = [];
    const ready: Draft[] = [];
    let skipped = 0;
    const branchMembers = members.filter((m) => m.branchId === branchId);
    const inFile = new Set<string>();
    const onList = new Set<string>(); // existing members found in the file
    const findExisting = (phone: string, key: string) => branchMembers.find((m) => (phone && normalizePhone(m.phone) === phone && sameName(`${m.firstName} ${m.lastName}`, key)) || `${m.firstName} ${m.lastName}`.toLowerCase().trim() === key);
    rows.forEach((r, i) => {
      let first = r.firstName; let last = r.lastName;
      let title = (r.title || '').trim();
      if (!first && r.name) {
        let nm = r.name.replace(/\s+/g, ' ').trim();
        for (let k = 0; k < 2; k++) { const t = nm.match(TITLE_RE); if (!t) break; title = `${title} ${t[0].trim()}`.trim(); nm = nm.slice(t[0].length); }
        const parts = tidy(nm).split(/\s+/).filter(Boolean);
        first = parts[0] ?? ''; last = parts.slice(1).join(' ');
      }
      first = tidy(first); last = tidy(last); title = tidy(title);
      if (!first) { skipped++; notes.push(`Row ${i + 2}: no name`); return; }
      const phone = r.phone ? normalizePhone(r.phone) : '';
      const key = `${first} ${last}`.toLowerCase().trim();
      const existing = findExisting(phone, key);
      if (existing) onList.add(existing.id);
      // Compare with people ALREADY in the system (phone + similar name, or same full name);
      // inside one file only an identical full name counts as a repeat (e.g. "Jnr" and his father are two people).
      if (skipDupes && ((phone && (havePhones.get(phone) ?? []).some((n) => sameName(n, key))) || haveNames.has(key) || inFile.has(key))) { skipped++; notes.push(`Row ${i + 2}: ${first} ${last} already exists`); return; }
      inFile.add(key);
      const g = (r.gender || '').toLowerCase();
      const c = (r.category || '').toLowerCase();
      const dob = parseDateLoose(r.dob);
      const age = dob ? new Date().getFullYear() - Number(dob.slice(0, 4)) : null;
      const category: MemberCategory = c.startsWith('child') || c.startsWith('kid') ? 'child' : c.startsWith('teen') || c.startsWith('youth') ? 'teen'
        : c ? 'adult' : age !== null && age < 13 ? 'child' : age !== null && age < 18 ? 'teen' : 'adult';
      let departmentIds = (r.departments || '').split(/[;,/]/).map((s) => deptByName.get(s.toLowerCase().replace(/[^a-z0-9]/g, ''))).filter((x): x is string => !!x);
      if (forceDept && !departmentIds.includes(forceDept)) departmentIds = [...departmentIds, forceDept];
      ready.push({
        ...emptyMember(branchId), firstName: first, lastName: last, title, phone, email: r.email, gender: g.startsWith('m') ? 'male' : g.startsWith('f') ? 'female' : '',
        dob, category, departmentIds, address: tidy(r.address), occupation: tidy(r.occupation), maritalStatus: readMarital(r.maritalStatus),
        joinedAt: parseDateLoose(r.joinedAt) || today(), membershipNo: r.membershipNo, source: 'import',
        status: readStatus(r.status) ?? 'active', notes: r.notes || '',
      });
    });
    ready.forEach((m) => { m.departmentIds = withAutoDepts(m, departments); });
    const needNos = ready.filter((m) => !m.membershipNo).length;
    const nos = await reserveMembershipNos(needNos);
    let n = 0;
    ready.forEach((m) => { if (!m.membershipNo) m.membershipNo = nos[n++]; });
    for (let i = 0; i < ready.length; i += 400) {
      const batch = writeBatch(db);
      ready.slice(i, i + 400).forEach((m) => batch.set(doc(collection(db, 'members')), { ...m, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
      await batch.commit();
    }
    // Official list: whoever in this branch is NOT on it becomes "not active"; whoever is on it is active again.
    // Safety: never mark people "not active" from a file in which nobody could be recognised.
    if (officialList && ready.length + onList.size === 0) {
      notes.unshift('Nobody in this file was recognised, so no one was moved to "Not active". Check the sheet and the column matching.');
    } else if (officialList) {
      const stamp = today();
      const changes = branchMembers.flatMap((m): { m: Member; status: MemberStatus; note: string }[] => {
        if (onList.has(m.id) && m.status === 'inactive') return [{ m, status: 'active', note: `Back on the official membership list (${stamp}).` }];
        if (!onList.has(m.id) && m.status === 'active') return [{ m, status: 'inactive', note: `Not on the official membership list imported ${stamp}.` }];
        return [];
      });
      for (let i = 0; i < changes.length; i += 400) {
        const batch = writeBatch(db);
        changes.slice(i, i + 400).forEach(({ m, status, note }) => { batch.update(doc(db, 'members', m.id), { status, notes: [m.notes, note].filter(Boolean).join('\n'), updatedAt: serverTimestamp() }); });
        await batch.commit();
      }
      const off = changes.filter((c) => c.status === 'inactive').length;
      const back = changes.length - off;
      notes.unshift(`${off} member(s) not on this list were moved to "Not active"${back ? `; ${back} returned to active` : ''}.`);
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
          {canMark && (
            <label className="flex items-start gap-2 rounded-lg bg-gold-50 p-3 text-sm text-stone-700 sm:col-span-2">
              <input type="checkbox" checked={officialList} onChange={(e) => setOfficialList(e.target.checked)} className="mt-0.5 rounded border-stone-300" />
              <span><b>This is the current official membership list.</b> Anyone in this branch who is NOT in the file is moved to “Not active” (their records are kept), and anyone in the file who was not active becomes active again.</span>
            </label>
          )}
        </div>
      }
    />
  );
}
