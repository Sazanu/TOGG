import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Building2, CalendarCheck, CheckCircle2, Circle, HandCoins, Network, UserPlus, Users } from 'lucide-react';
import { Card, PageHeader, Stat } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { ALL, useData } from '../context/DataContext';
import { GIVING_TYPES, MONTHS, labelOf, money, monthRange, shortDate } from '../lib/format';
import { ROLE_LABELS, can, isGlobal } from '../lib/roles';
import { useServices } from './Attendance';
import { useGifts } from './Giving';
import { useCellReports, useMyCells } from './Cells';
import { useMonthReports } from './Reports';
import { isoDate, monthKey, monthLabel } from '../lib/format';
import { ClipboardList, Home, Sprout } from 'lucide-react';
import type { Service } from '../lib/types';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function Dashboard() {
  const { profile } = useAuth();
  const { members: allMembers, branches, departments, scope, branchName } = useData();
  const role = profile?.role;
  // Department heads see their own departments' people.
  const members = role === 'dept_leader' ? allMembers.filter((m) => m.departmentIds?.some((d) => profile?.departmentIds.includes(d))) : allMembers;
  const TITLES = /^(rev|revd|pastor|ps|apostle|bishop|prophet|evangelist|elder|deacon|deaconess|dr|mr|mrs|ms|miss|bro|sis|brother|sister)\.?$/i;
  const first = (profile?.displayName ?? '').split(/\s+/).find((w) => w && !TITLES.test(w)) ?? profile?.displayName ?? '';

  const now = new Date();
  const { start, end } = monthRange(now.getFullYear(), now.getMonth());

  const showAttendance = can(role, 'attendance.write');
  const showGiving = can(role, 'giving.read');

  return (
    <div>
      <PageHeader
        title={`${greeting()}, ${first}`}
        subtitle={`${profile ? ROLE_LABELS[profile.role] : ''} · ${scope === ALL ? 'All branches' : branchName(scope)}`}
      />

      {isGlobal(role) && (branches.length === 0 || departments.length === 0) && <SetupChecklist branches={branches.length} departments={departments.length} members={members.length} />}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {can(role, 'members.read') && (
          <Stat label="Members" value={members.filter((m) => m.status !== 'visitor').length} icon={<Users className="h-4 w-4" />}
            sub={`${members.filter((m) => m.status !== 'visitor' && m.category === 'adult').length} adults · ${members.filter((m) => m.status !== 'visitor' && m.category === 'teen').length} teens · ${members.filter((m) => m.status !== 'visitor' && m.category === 'child').length} children · ${members.filter((m) => m.status === 'visitor').length} visitors`} />
        )}
        {can(role, 'members.read') && (
          <Stat label="New this month" value={members.filter((m) => m.joinedAt >= start && m.joinedAt <= end).length} icon={<UserPlus className="h-4 w-4" />} sub={`Joined in ${MONTHS[now.getMonth()]}`} />
        )}
        {isGlobal(role) && <Stat label="Branches" value={branches.length} icon={<Building2 className="h-4 w-4" />} sub={`${departments.length} departments`} />}
        {showGiving && <GivingStat start={start} end={end} />}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {showAttendance && <AttendanceTrend />}
        {showGiving && <GivingBreakdown start={start} end={end} />}
        {scope === ALL && isGlobal(role) && branches.length > 0 && (
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-stone-900">Branches</h2>
              <Link to="/branches" className="text-xs text-royal-700 hover:underline">Manage</Link>
            </div>
            <ul className="space-y-3">
              {branches.map((b) => {
                const n = members.filter((m) => m.branchId === b.id).length;
                const max = Math.max(1, ...branches.map((x) => members.filter((m) => m.branchId === x.id).length));
                return (
                  <li key={b.id}>
                    <div className="mb-1 flex justify-between text-sm"><span className="text-stone-700">{b.name}</span><span className="font-medium text-royal-950">{n}</span></div>
                    <div className="h-2 rounded-full bg-stone-100"><div className="h-2 rounded-full bg-gold-400" style={{ width: `${(n / max) * 100}%` }} /></div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
        {can(role, 'reports.view') && <ReportsWidget />}
        {can(role, 'cells.view') && <CellsWidget />}
        {can(role, 'members.read') && <Birthdays />}
      </div>
    </div>
  );
}

function GivingStat({ start, end }: { start: string; end: string }) {
  const { scope } = useData();
  const { gifts } = useGifts(scope, start, end);
  const total = gifts.reduce((t, g) => t + g.amount, 0);
  return <Stat label={`Giving · ${MONTHS[new Date().getMonth()]}`} value={money(total)} icon={<HandCoins className="h-4 w-4" />} sub={`${gifts.length} records`} />;
}

function GivingBreakdown({ start, end }: { start: string; end: string }) {
  const { scope } = useData();
  const { gifts } = useGifts(scope, start, end);
  const total = gifts.reduce((t, g) => t + g.amount, 0);
  const rows = useMemo(() => {
    const m = new Map<string, number>();
    gifts.forEach((g) => m.set(g.type, (m.get(g.type) || 0) + g.amount));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [gifts]);
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold text-stone-900">Giving this month</h2>
        <Link to="/giving" className="text-xs text-royal-700 hover:underline">Open</Link>
      </div>
      {rows.length === 0 ? <p className="text-sm text-stone-400">Nothing recorded yet this month.</p> : (
        <ul className="space-y-3">
          {rows.map(([t, v]) => (
            <li key={t}>
              <div className="mb-1 flex justify-between text-sm"><span className="text-stone-700">{labelOf(GIVING_TYPES, t as never)}</span><span className="font-medium">{money(v)}</span></div>
              <div className="h-2 rounded-full bg-stone-100"><div className="h-2 rounded-full bg-emerald-500" style={{ width: `${(v / total) * 100}%` }} /></div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function AttendanceTrend() {
  const { scope } = useData();
  const { services } = useServices(scope, scope === ALL ? 60 : 10);
  const list = useMemo(() => {
    if (scope !== ALL) return [...services].reverse();
    // Combine branches: one bar per date + service type.
    const m = new Map<string, Service>();
    services.forEach((s) => {
      const k = `${s.date}|${s.type}`;
      const cur = m.get(k);
      if (cur) m.set(k, { ...cur, id: '', count: (cur.count || 0) + (s.count || 0), visitors: (cur.visitors || 0) + (s.visitors || 0) });
      else m.set(k, { ...s });
    });
    return [...m.values()].slice(0, 10).reverse();
  }, [services, scope]);
  const max = Math.max(1, ...list.map((s) => (s.count || 0) + (s.visitors || 0)));
  return (
    <Card className="p-5 lg:col-span-2">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-stone-900">Attendance</h2>
          <p className="text-xs text-stone-500">Last {list.length} services</p>
        </div>
        <Link to="/attendance" className="inline-flex items-center gap-1 text-xs text-royal-700 hover:underline">Take attendance <ArrowRight className="h-3 w-3" /></Link>
      </div>
      {list.length === 0 ? (
        <div className="flex h-44 flex-col items-center justify-center text-sm text-stone-400"><CalendarCheck className="mb-2 h-6 w-6" /> No services recorded yet.</div>
      ) : (
        <div className="flex h-48 items-end gap-2">
          {list.map((s) => {
            const total = (s.count || 0) + (s.visitors || 0);
            return (
              <Link to={s.id ? `/attendance/${s.id}` : '/attendance'} key={`${s.date}-${s.type}-${s.id}`} className="group flex flex-1 flex-col items-center gap-1" title={`${s.title || s.type}: ${total}`}>
                <span className="text-[11px] font-medium text-stone-500 group-hover:text-royal-700">{total}</span>
                <div className="w-full max-w-[44px] rounded-t-lg bg-royal-600 transition group-hover:bg-gold-400" style={{ height: `${Math.max(4, (total / max) * 140)}px` }} />
                <span className="text-[10px] text-stone-400">{shortDate(s.date)}</span>
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function Birthdays() {
  const { members } = useData();
  const list = useMemo(() => {
    const now = new Date();
    const out: { name: string; day: number; id: string }[] = [];
    members.forEach((m) => {
      if (!m.dob) return;
      const [, mm, dd] = m.dob.split('-').map(Number);
      if (mm - 1 === now.getMonth()) out.push({ id: m.id, name: `${m.firstName} ${m.lastName}`, day: dd });
    });
    return out.sort((a, b) => a.day - b.day);
  }, [members]);
  const todayN = new Date().getDate();
  return (
    <Card className="p-5">
      <h2 className="mb-4 font-semibold text-stone-900">🎂 Birthdays in {MONTHS[new Date().getMonth()]}</h2>
      {list.length === 0 ? <p className="text-sm text-stone-400">No birthdays recorded this month.</p> : (
        <ul className="max-h-60 space-y-2 overflow-y-auto">
          {list.map((b) => (
            <li key={b.id} className={`flex items-center justify-between rounded-lg px-2 py-1 text-sm ${b.day === todayN ? 'bg-gold-50 font-medium text-gold-800' : 'text-stone-700'}`}>
              <span>{b.name}</span><span className="text-xs text-stone-500">{b.day === todayN ? 'Today!' : `${b.day} ${MONTHS[new Date().getMonth()].slice(0, 3)}`}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function SetupChecklist({ branches, departments, members }: { branches: number; departments: number; members: number }) {
  const steps = [
    { done: branches > 0, label: 'Add your headquarters and branches', to: '/branches', icon: <Building2 className="h-4 w-4" /> },
    { done: departments > 0, label: 'Set up departments (Choir, Ushering, Media…)', to: '/departments', icon: <Network className="h-4 w-4" /> },
    { done: members > 0, label: 'Add members or share the registration link', to: '/members', icon: <Users className="h-4 w-4" /> },
    { done: false, label: 'Invite the associate pastor, branch pastors and staff to sign up, then give them roles', to: '/users', icon: <UserPlus className="h-4 w-4" /> },
  ];
  return (
    <Card className="mb-6 overflow-hidden">
      <div className="bg-royal-950 px-5 py-4 text-white">
        <h2 className="font-display text-lg font-bold">Let's set up TOGG</h2>
        <p className="text-sm text-royal-300">A few steps and every branch is ready to go.</p>
      </div>
      <ul className="divide-y divide-stone-100">
        {steps.map((s) => (
          <li key={s.label}>
            <Link to={s.to} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-stone-50">
              {s.done ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <Circle className="h-5 w-5 text-stone-300" />}
              <span className={s.done ? 'text-stone-400 line-through' : 'text-stone-800'}>{s.label}</span>
              <ArrowRight className="ml-auto h-4 w-4 text-stone-300" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ReportsWidget() {
  const { profile } = useAuth();
  const { scope, departments } = useData();
  const month = monthKey();
  const isHead = profile?.role === 'dept_leader';
  const branch = profile?.branchId ?? scope;
  const reports = useMonthReports(month, branch, isHead ? profile?.departmentIds ?? [] : null) ?? [];
  const by = (st: string) => reports.filter((r) => r.status === st).length;
  const expected = (isHead ? profile?.departmentIds.length ?? 0 : departments.length) * 3;
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold text-stone-900"><ClipboardList className="h-4 w-4 text-royal-600" /> Dept. reports · {monthLabel(month)}</h2>
        <Link to="/reports" className="text-xs text-royal-700 hover:underline">Open</Link>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-gold-50 py-3"><div className="font-display text-xl font-bold text-gold-700">{by('submitted')}</div><div className="text-[11px] text-stone-500">{isHead ? 'Submitted' : 'To review'}</div></div>
        <div className="rounded-xl bg-emerald-50 py-3"><div className="font-display text-xl font-bold text-emerald-700">{by('approved')}</div><div className="text-[11px] text-stone-500">Approved</div></div>
        <div className="rounded-xl bg-red-50 py-3"><div className="font-display text-xl font-bold text-red-700">{by('returned')}</div><div className="text-[11px] text-stone-500">Returned</div></div>
      </div>
      {branch !== ALL && <p className="mt-3 text-xs text-stone-500">{reports.filter((r) => r.status !== 'draft').length} of {expected} reports, budgets and plans in.</p>}
    </Card>
  );
}

function CellsWidget() {
  const { profile } = useAuth();
  const { scope, members } = useData();
  const { cells, ids } = useMyCells();
  const month = monthKey();
  const now = new Date();
  const reports = useCellReports(profile?.branchId ?? scope, `${month}-01`, isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)), ids);
  const mine = new Set(cells.map((c) => c.id));
  const rs = reports.filter((r) => mine.has(r.cellId));
  const ft = rs.reduce((t, r) => t + r.firstTimers, 0);
  const cv = rs.reduce((t, r) => t + r.newConverts, 0);
  const joined = members.filter((m) => m.source === 'cell' && m.joinedAt.startsWith(month) && !!m.cellId && mine.has(m.cellId)).length;
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold text-stone-900"><Home className="h-4 w-4 text-gold-600" /> Cell growth · {MONTHS[now.getMonth()]}</h2>
        <Link to="/cells" className="text-xs text-royal-700 hover:underline">Open</Link>
      </div>
      <ul className="space-y-2 text-sm">
        <li className="flex justify-between"><span className="text-stone-600">Meetings held</span><b>{rs.length} <span className="font-normal text-stone-400">/ {cells.length} cells</span></b></li>
        <li className="flex justify-between"><span className="text-stone-600">First-timers</span><b className="text-gold-700">{ft}</b></li>
        <li className="flex justify-between"><span className="text-stone-600">New converts</span><b className="text-royal-700">{cv}</b></li>
        <li className="flex justify-between"><span className="flex items-center gap-1 text-stone-600"><Sprout className="h-3.5 w-3.5 text-emerald-600" /> Added to church</span><b className="text-emerald-700">{joined}</b></li>
      </ul>
    </Card>
  );
}
