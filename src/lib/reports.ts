import type { DeptReport, DeptReportStatus, DeptReportType } from './types';

export const REPORT_TYPES: { value: DeptReportType; label: string; short: string }[] = [
  { value: 'report', label: 'Monthly report', short: 'Report' },
  { value: 'budget', label: 'Monthly budget', short: 'Budget' },
  { value: 'plan', label: 'Planned activities', short: 'Plan' },
];

export const STATUS_LABEL: Record<DeptReportStatus | 'none', string> = {
  none: 'Not started', draft: 'Draft', submitted: 'Submitted', approved: 'Approved', returned: 'Returned',
};

export const STATUS_COLOR: Record<DeptReportStatus | 'none', 'gray' | 'blue' | 'gold' | 'green' | 'red'> = {
  none: 'gray', draft: 'blue', submitted: 'gold', approved: 'green', returned: 'red',
};

export function reportId(deptId: string, branchId: string, month: string, type: DeptReportType): string {
  return `${deptId}_${branchId}_${month}_${type}`;
}

export function emptyReport(deptId: string, branchId: string, month: string, type: DeptReportType): Omit<DeptReport, 'id'> {
  return {
    departmentId: deptId, branchId, month, type, status: 'draft', summary: '', achievements: '', challenges: '',
    membersActive: 0, newMembers: 0, recommendations: '', lines: [], activities: [], submittedByName: '',
    reviewComment: '', reviewedByName: '',
  };
}

export function reportTotal(r: Pick<DeptReport, 'type' | 'lines' | 'activities'>): number {
  if (r.type === 'budget') return (r.lines ?? []).reduce((t, l) => t + (Number(l.amount) || 0), 0);
  if (r.type === 'plan') return (r.activities ?? []).reduce((t, a) => t + (Number(a.cost) || 0), 0);
  return 0;
}
