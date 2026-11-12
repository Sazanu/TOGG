import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Network, Pencil, Plus, UsersRound } from 'lucide-react';
import { Avatar, Badge, Button, Card, Empty, PageHeader, Select, Stat } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { ALL, useData } from '../context/DataContext';
import { initials, monthKey } from '../lib/format';
import { can } from '../lib/roles';
import { DeptForm, HeadLine } from './Departments';
import { MemberForm } from './Members';
import { ReportStatusRow, SelectMonth } from './Reports';

export default function DepartmentDetail() {
  const { id = '' } = useParams();
  const { profile } = useAuth();
  const { departments, members, cells, scope, branches, branchName, deptName, deptWithChildren } = useData();
  const dept = departments.find((d) => d.id === id);
  const manage = can(profile?.role, 'departments.manage');
  const isHead = profile?.role === 'dept_leader' && profile.departmentIds.includes(id);
  const canAdd = can(profile?.role, 'members.write') || isHead;
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [month, setMonth] = useState(monthKey());
  const [reportBranch, setReportBranch] = useState(profile?.branchId ?? (scope !== ALL ? scope : branches[0]?.id ?? ''));

  const ids = useMemo(() => deptWithChildren(id), [deptWithChildren, id]);
  const subs = departments.filter((d) => d.parentId === id);
  const deptMembers = members.filter((m) => m.departmentIds?.some((x) => ids.includes(x)));
  const deptCells = cells.filter((c) => ids.includes(c.departmentId));
  const parent = dept?.parentId ? departments.find((d) => d.id === dept.parentId) : null;

  if (!dept) return <Empty icon={<Network />} title="Department not found"><Link className="text-royal-700 underline" to="/departments">Back to departments</Link></Empty>;

  return (
    <div>
      <Link to="/departments" className="mb-4 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-royal-700"><ArrowLeft className="h-4 w-4" /> Departments</Link>
      <PageHeader
        title={dept.name}
        subtitle={parent ? `Under ${parent.name}` : 'Main department'}
        actions={
          <>
            {manage && <Button variant="outline" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Edit</Button>}
            {canAdd && <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Register member</Button>}
          </>
        }
      />
      <div className="-mt-3 mb-6"><HeadLine d={dept} /></div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Members" value={deptMembers.length} sub={subs.length ? 'including sub-departments' : undefined} />
        <Stat label="Sub-departments" value={subs.length} />
        <Stat label="Cells" value={deptCells.length} />
        <Stat label="In a cell" value={deptMembers.filter((m) => m.cellId).length} />
      </div>

      <Card className="mb-6 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-stone-900">Monthly reports</h2>
          <div className="flex gap-2">
            {!profile?.branchId && (
              <Select value={reportBranch} onChange={(e) => setReportBranch(e.target.value)} className="!w-44 !py-2">
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            )}
            <SelectMonth value={month} onChange={setMonth} />
          </div>
        </div>
        <ReportStatusRow deptId={id} branchId={reportBranch} month={month} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="border-b border-stone-100 px-5 py-4"><h2 className="font-semibold text-stone-900">Members <span className="text-stone-400">({deptMembers.length})</span></h2></div>
          {deptMembers.length === 0 ? <Empty icon={<UsersRound />} title="No members in this department yet">{canAdd && 'Use “Register member” to add people.'}</Empty> : (
            <ul className="max-h-[32rem] divide-y divide-stone-100 overflow-y-auto">
              {deptMembers.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-5 py-3">
                  <Avatar text={initials(m.firstName, m.lastName)} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-stone-900">{m.firstName} {m.lastName}</div>
                    <div className="truncate text-xs text-stone-500">{m.phone || 'No phone'}{scope === ALL && ` · ${branchName(m.branchId)}`}</div>
                  </div>
                  <div className="hidden flex-wrap justify-end gap-1 sm:flex">
                    {m.departmentIds.filter((x) => ids.includes(x) && x !== id).map((x) => <Badge key={x} color="royal">{deptName(x)}</Badge>)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-3 font-semibold text-stone-900">Sub-departments</h2>
            {subs.length === 0 ? <p className="text-sm text-stone-400">None.</p> : (
              <ul className="space-y-2">
                {subs.map((s) => (
                  <li key={s.id}><Link to={`/departments/${s.id}`} className="flex justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-stone-50"><span className="text-stone-700">{s.name}</span><span className="text-xs text-stone-400">{s.headName}</span></Link></li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 font-semibold text-stone-900">Cells</h2>
            {deptCells.length === 0 ? <p className="text-sm text-stone-400">No cells under this department.</p> : (
              <ul className="space-y-2">
                {deptCells.map((c) => (
                  <li key={c.id}><Link to={`/cells/${c.id}`} className="flex justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-stone-50"><span className="text-stone-700">{c.name}</span><span className="text-xs text-stone-400">{members.filter((m) => m.cellId === c.id).length} members</span></Link></li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {editing && <DeptForm dept={dept} parentId={dept.parentId} onClose={() => setEditing(false)} />}
      {adding && <MemberForm member={null} defaultBranch={profile?.branchId ?? (scope !== ALL ? scope : branches[0]?.id ?? '')} lockBranch={!!profile?.branchId} presetDept={id} onClose={() => setAdding(false)} />}
    </div>
  );
}
