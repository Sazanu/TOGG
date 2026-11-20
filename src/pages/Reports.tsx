import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { collection, doc, getDoc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Plus, Printer, RotateCcw, Send, Trash2 } from 'lucide-react';
import { Badge, Button, Card, Empty, Field, Input, PageHeader, Select, Spinner, Textarea, cx, errorText, useToast } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { ALL, useData } from '../context/DataContext';
import { db } from '../lib/firebase';
import { money, monthKey, monthLabel, shiftMonth } from '../lib/format';
import { REPORT_TYPES, STATUS_COLOR, STATUS_LABEL, emptyReport, reportId, reportTotal } from '../lib/reports';
import { can } from '../lib/roles';
import type { DeptReport, DeptReportType } from '../lib/types';

/** Live reports for one month, using queries reviewers are allowed to run, or per-doc listeners for department heads. */
export function useMonthReports(month: string, branchId: string, deptIds: string[] | null) {
  const { profile } = useAuth();
  const [reports, setReports] = useState<DeptReport[] | null>(null);
  const key = deptIds?.join(',') ?? '';
  useEffect(() => {
    setReports(null);
    if (deptIds) {
      if (!branchId || !deptIds.length) { setReports([]); return; }
      const found = new Map<string, DeptReport>();
      const unsubs = deptIds.flatMap((d) => REPORT_TYPES.map((t) => onSnapshot(doc(db, 'deptReports', reportId(d, branchId, month, t.value)), (s) => {
        if (s.exists()) found.set(s.id, { id: s.id, ...s.data() } as DeptReport); else found.delete(s.id);
        setReports([...found.values()]);
      }, () => setReports([...found.values()]))));
      return () => unsubs.forEach((u) => u());
    }
    const base = collection(db, 'deptReports');
    const q = branchId === ALL ? query(base, where('month', '==', month)) : query(base, where('branchId', '==', branchId), where('month', '==', month));
    return onSnapshot(q, (s) => setReports(s.docs.map((d) => ({ id: d.id, ...d.data() }) as DeptReport)), (e) => { console.error(e); setReports([]); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, branchId, key, profile?.uid]);
  return reports;
}

export default function Reports() {
  const { profile } = useAuth();
  const { deptTree, branches, scope, branchName, deptName } = useData();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const month = params.get('month') ?? monthKey();
  const [type, setType] = useState<DeptReportType>((params.get('type') as DeptReportType) ?? 'report');
  const isHead = !can(profile?.role, 'reports.review') && (profile?.departmentIds?.length ?? 0) > 0;
  const branchId = profile?.branchId ?? scope;
  const reports = useMonthReports(month, branchId, isHead ? profile?.departmentIds ?? [] : null);

  const depts = deptTree.filter(({ dept }) => !isHead || profile?.departmentIds.includes(dept.id));
  const rowBranches = branchId === ALL ? branches.map((b) => b.id) : [branchId];

  const rows = useMemo(() => depts.flatMap(({ dept, depth }) => rowBranches.map((b) => ({
    dept, depth, branchId: b, report: reports?.find((r) => r.departmentId === dept.id && r.branchId === b && r.type === type) ?? null,
  }))), [depts, rowBranches, reports, type]);
  const counts = (t: DeptReportType) => (reports ?? []).filter((r) => r.type === t && (r.status === 'submitted' || r.status === 'approved')).length;
  const waiting = (reports ?? []).filter((r) => r.status === 'submitted').length;

  const setMonth = (m: string) => { params.set('month', m); setParams(params); };

  return (
    <div>
      <PageHeader
        title="Department reports"
        subtitle={isHead ? 'Submit your monthly report, budget and planned activities.' : `Monthly reports, budgets and plans from every department · ${branchId === ALL ? 'all branches' : branchName(branchId)}`}
      />
      <Card className="mb-4 flex flex-wrap items-center gap-2 p-3">
        <Button variant="ghost" size="sm" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></Button>
        <Input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="!w-44 !py-2" />
        <Button variant="ghost" size="sm" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month"><ChevronRight className="h-4 w-4" /></Button>
        <div className="ml-auto flex flex-wrap gap-1">
          {REPORT_TYPES.map((t) => (
            <button key={t.value} onClick={() => setType(t.value)} className={`rounded-lg px-3 py-1.5 text-sm ${type === t.value ? 'bg-royal-800 text-white' : 'text-stone-600 hover:bg-stone-100'}`}>
              {t.label} <span className="opacity-60">({counts(t.value)})</span>
            </button>
          ))}
        </div>
      </Card>
      {!isHead && waiting > 0 && (
        <div className="mb-4 rounded-2xl border border-gold-200 bg-gold-50 px-4 py-3 text-sm text-gold-800"><b>{waiting}</b> submitted for {monthLabel(month)} waiting for your review.</div>
      )}
      <Card>
        {reports === null ? <Spinner /> : rows.length === 0 ? (
          <Empty icon={<ClipboardList />} title="No departments to show">{isHead ? 'Ask the Head Pastor to assign your department to your account.' : 'Set up departments first.'}</Empty>
        ) : (
          <ul className="divide-y divide-stone-100">
            {rows.map(({ dept, depth, branchId: b, report }) => {
              const st = report?.status ?? 'none';
              const to = `/reports/edit?dept=${dept.id}&branch=${b}&month=${month}&type=${type}`;
              return (
                <li key={`${dept.id}-${b}`}>
                  <button onClick={() => nav(to)} className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-stone-50/70" style={{ paddingLeft: `${(isHead ? 0 : depth) * 24 + 20}px` }}>
                    <div className="min-w-0 flex-1">
                      <div className={cx('truncate text-stone-900', depth ? 'text-sm' : 'font-medium')}>{depth > 0 && <span className="text-stone-400">↳ </span>}{deptName(dept.id)}</div>
                      <div className="truncate text-xs text-stone-500">
                        {branchId === ALL && `${branchName(b)} · `}
                        {report?.submittedByName ? `by ${report.submittedByName}` : dept.headName ? `Head: ${dept.headName}` : 'No head set'}
                        {report && type !== 'report' && ` · ${money(reportTotal(report))}`}
                      </div>
                    </div>
                    <Badge color={STATUS_COLOR[st]}>{STATUS_LABEL[st]}</Badge>
                    <ChevronRight className="h-4 w-4 text-stone-300" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

export function ReportEditor() {
  const { profile } = useAuth();
  const { deptName, branchName } = useData();
  const toast = useToast();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const deptId = params.get('dept') ?? '';
  const branchId = params.get('branch') ?? '';
  const month = params.get('month') ?? monthKey();
  const type = (params.get('type') as DeptReportType) ?? 'report';
  const id = reportId(deptId, branchId, month, type);
  const [r, setR] = useState<Omit<DeptReport, 'id'> | null>(null);
  const [exists, setExists] = useState(false);
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState('');

  useEffect(() => {
    getDoc(doc(db, 'deptReports', id)).then((s) => {
      if (s.exists()) { setR({ ...emptyReport(deptId, branchId, month, type), ...(s.data() as DeptReport) }); setExists(true); setComment((s.data() as DeptReport).reviewComment ?? ''); }
      else setR(emptyReport(deptId, branchId, month, type));
    }).catch(() => setR(emptyReport(deptId, branchId, month, type)));
  }, [id, deptId, branchId, month, type]);

  const isHeadOfDept = !!profile?.departmentIds?.includes(deptId) && profile?.branchId === branchId;
  const isGlobalUser = profile?.role === 'head_pastor' || profile?.role === 'associate_pastor';
  const canEdit = (isHeadOfDept || isGlobalUser) && r?.status !== 'approved';
  const canReview = can(profile?.role, 'reports.review') && exists && (r?.status === 'submitted' || r?.status === 'approved' || r?.status === 'returned');

  if (!r) return <Spinner />;
  const set = <K extends keyof typeof r>(k: K, v: (typeof r)[K]) => setR({ ...r, [k]: v });
  const typeLabel = REPORT_TYPES.find((t) => t.value === type)!.label;

  async function save(status: 'draft' | 'submitted') {
    if (!r) return;
    setBusy(true);
    try {
      const clean = {
        ...r, status, departmentId: deptId, branchId, month, type,
        lines: r.lines.filter((l) => l.item.trim()).map((l) => ({ item: l.item.trim(), amount: Number(l.amount) || 0 })),
        activities: r.activities.filter((a) => a.title.trim()).map((a) => ({ ...a, cost: Number(a.cost) || 0 })),
        membersActive: Number(r.membersActive) || 0, newMembers: Number(r.newMembers) || 0,
        submittedByName: profile?.displayName ?? '', submittedBy: profile?.uid ?? '',
      };
      await setDoc(doc(db, 'deptReports', id), { ...clean, updatedAt: serverTimestamp() });
      setR({ ...clean, updatedAt: null }); setExists(true);
      toast('ok', status === 'submitted' ? `${typeLabel} submitted for review.` : 'Draft saved.');
    } catch (e) { toast('err', errorText(e)); } finally { setBusy(false); }
  }

  async function review(status: 'approved' | 'returned') {
    if (status === 'returned' && !comment.trim()) { toast('err', 'Add a comment so the head knows what to change.'); return; }
    setBusy(true);
    try {
      await updateDoc(doc(db, 'deptReports', id), { status, reviewComment: comment.trim(), reviewedByName: profile?.displayName ?? '', reviewedBy: profile?.uid, reviewedAt: serverTimestamp() });
      setR({ ...r!, status, reviewComment: comment.trim(), reviewedByName: profile?.displayName ?? '' });
      toast('ok', status === 'approved' ? 'Approved.' : 'Returned to the department head.');
    } catch (e) { toast('err', errorText(e)); } finally { setBusy(false); }
  }

  const ro = !canEdit;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={`${deptName(deptId)} — ${typeLabel}`}
        subtitle={`${monthLabel(month)} · ${branchName(branchId)}`}
        actions={<><Badge color={STATUS_COLOR[r.status && exists ? r.status : 'none']}>{STATUS_LABEL[exists ? r.status : 'none']}</Badge><Button variant="outline" size="sm" onClick={() => window.print()} className="print:hidden"><Printer className="h-4 w-4" /> Print</Button></>}
      />

      {r.status === 'returned' && r.reviewComment && (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><b>Returned by {r.reviewedByName}:</b> {r.reviewComment}</div>
      )}
      {r.status === 'approved' && (
        <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><b>Approved by {r.reviewedByName}.</b> {r.reviewComment}</div>
      )}

      <Card className="space-y-5 p-5 sm:p-6">
        {type === 'report' && (
          <>
            <Field label="Summary of the month"><Textarea rows={4} readOnly={ro} value={r.summary} onChange={(e) => set('summary', e.target.value)} placeholder="What the department did this month" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Active members in the department"><Input type="number" min={0} readOnly={ro} value={r.membersActive || ''} onChange={(e) => set('membersActive', Number(e.target.value))} /></Field>
              <Field label="New members this month"><Input type="number" min={0} readOnly={ro} value={r.newMembers || ''} onChange={(e) => set('newMembers', Number(e.target.value))} /></Field>
            </div>
            <Field label="Achievements"><Textarea readOnly={ro} value={r.achievements} onChange={(e) => set('achievements', e.target.value)} /></Field>
            <Field label="Challenges"><Textarea readOnly={ro} value={r.challenges} onChange={(e) => set('challenges', e.target.value)} /></Field>
            <Field label="Recommendations / requests"><Textarea readOnly={ro} value={r.recommendations} onChange={(e) => set('recommendations', e.target.value)} /></Field>
          </>
        )}

        {type === 'budget' && (
          <div>
            <div className="mb-2 grid grid-cols-[1fr_9rem_2.5rem] gap-2 text-xs font-semibold uppercase tracking-wide text-stone-500"><span>Item</span><span>Amount (GH₵)</span><span /></div>
            <div className="space-y-2">
              {r.lines.map((l, i) => (
                <div key={i} className="grid grid-cols-[1fr_9rem_2.5rem] gap-2">
                  <Input readOnly={ro} value={l.item} onChange={(e) => set('lines', r.lines.map((x, j) => (j === i ? { ...x, item: e.target.value } : x)))} placeholder="e.g. Transport for outreach" />
                  <Input readOnly={ro} type="number" min={0} step="0.01" value={l.amount || ''} onChange={(e) => set('lines', r.lines.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) } : x)))} />
                  {!ro && <button onClick={() => set('lines', r.lines.filter((_, j) => j !== i))} className="rounded-lg text-stone-400 hover:bg-stone-100 hover:text-red-600" aria-label="Remove line"><Trash2 className="mx-auto h-4 w-4" /></button>}
                </div>
              ))}
            </div>
            {!ro && <Button variant="outline" size="sm" className="mt-3" onClick={() => set('lines', [...r.lines, { item: '', amount: 0 }])}><Plus className="h-4 w-4" /> Add line</Button>}
            <div className="mt-4 flex justify-between rounded-xl bg-royal-950 px-4 py-3 text-white"><span>Total budget</span><b className="text-gold-300">{money(reportTotal(r))}</b></div>
            <Field label="Notes" className="mt-4"><Textarea readOnly={ro} value={r.summary} onChange={(e) => set('summary', e.target.value)} /></Field>
          </div>
        )}

        {type === 'plan' && (
          <div>
            <div className="space-y-3">
              {r.activities.map((a, i) => (
                <div key={i} className="grid gap-2 rounded-xl border border-stone-200 p-3 sm:grid-cols-[9rem_1fr_8rem_2.5rem]">
                  <Input readOnly={ro} type="date" value={a.date} onChange={(e) => set('activities', r.activities.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} />
                  <Input readOnly={ro} value={a.title} onChange={(e) => set('activities', r.activities.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} placeholder="Activity, e.g. Media training" />
                  <Input readOnly={ro} type="number" min={0} value={a.cost || ''} onChange={(e) => set('activities', r.activities.map((x, j) => (j === i ? { ...x, cost: Number(e.target.value) } : x)))} placeholder="Cost GH₵" />
                  {!ro && <button onClick={() => set('activities', r.activities.filter((_, j) => j !== i))} className="rounded-lg text-stone-400 hover:bg-stone-100 hover:text-red-600" aria-label="Remove activity"><Trash2 className="mx-auto h-4 w-4" /></button>}
                  <Textarea readOnly={ro} rows={2} className="sm:col-span-4" value={a.details} onChange={(e) => set('activities', r.activities.map((x, j) => (j === i ? { ...x, details: e.target.value } : x)))} placeholder="Details, venue, who is responsible" />
                </div>
              ))}
            </div>
            {!ro && <Button variant="outline" size="sm" className="mt-3" onClick={() => set('activities', [...r.activities, { date: `${month}-01`, title: '', details: '', cost: 0 }])}><Plus className="h-4 w-4" /> Add activity</Button>}
            {r.activities.length > 0 && <div className="mt-4 flex justify-between rounded-xl bg-stone-50 px-4 py-3 text-sm"><span>{r.activities.length} activities planned</span><b>{money(reportTotal(r))}</b></div>}
          </div>
        )}

        {canEdit && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-stone-100 pt-4 print:hidden">
            <Button variant="outline" loading={busy} onClick={() => save('draft')}>Save draft</Button>
            <Button loading={busy} onClick={() => save('submitted')}><Send className="h-4 w-4" /> Submit for review</Button>
          </div>
        )}
        {!canEdit && !exists && <p className="text-sm text-stone-500">The department head has not started this yet.</p>}
      </Card>

      {canReview && (
        <Card className="mt-6 p-5 print:hidden">
          <h2 className="mb-3 font-semibold text-stone-900">Review</h2>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Comment for the department head (required when returning)" />
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button variant="outline" loading={busy} onClick={() => review('returned')}><RotateCcw className="h-4 w-4" /> Return for changes</Button>
            <Button loading={busy} onClick={() => review('approved')}><CheckCircle2 className="h-4 w-4" /> Approve</Button>
          </div>
        </Card>
      )}
      {!deptId && <Empty title="Missing department"><button onClick={() => nav('/reports')}>Back</button></Empty>}
    </div>
  );
}

export function ReportStatusRow({ deptId, branchId, month }: { deptId: string; branchId: string; month: string }) {
  const [map, setMap] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!branchId || branchId === ALL) return;
    const unsubs = REPORT_TYPES.map((t) => onSnapshot(doc(db, 'deptReports', reportId(deptId, branchId, month, t.value)),
      (s) => setMap((m) => ({ ...m, [t.value]: s.exists() ? (s.data().status as string) : 'none' })), () => {}));
    return () => unsubs.forEach((u) => u());
  }, [deptId, branchId, month]);
  if (!branchId || branchId === ALL) return <p className="text-sm text-stone-500">Choose a branch in the sidebar to see this department's reports.</p>;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {REPORT_TYPES.map((t) => {
        const st = (map[t.value] ?? 'none') as keyof typeof STATUS_LABEL;
        return (
          <Link key={t.value} to={`/reports/edit?dept=${deptId}&branch=${branchId}&month=${month}&type=${t.value}`} className="rounded-xl border border-stone-200 p-4 hover:border-royal-300">
            <div className="text-sm font-medium text-stone-800">{t.label}</div>
            <div className="mt-2"><Badge color={STATUS_COLOR[st]}>{STATUS_LABEL[st]}</Badge></div>
          </Link>
        );
      })}
    </div>
  );
}

export function SelectMonth({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className="!w-44 !py-2">
      {Array.from({ length: 12 }, (_, i) => shiftMonth(monthKey(), -i)).map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
    </Select>
  );
}
