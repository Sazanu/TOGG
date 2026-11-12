export type Role =
  | 'head_pastor'
  | 'associate_pastor'
  | 'branch_pastor'
  | 'secretary'
  | 'finance'
  | 'usher'
  | 'dept_leader'
  | 'cell_leader'
  | 'pending';

export const ROLE_LABELS: Record<Role, string> = {
  head_pastor: 'Head Pastor (Super Admin)',
  associate_pastor: 'Associate Pastor (Admin)',
  branch_pastor: 'Branch Pastor',
  secretary: 'Secretary / Admin',
  finance: 'Finance',
  usher: 'Usher',
  dept_leader: 'Department Head',
  cell_leader: 'Cell Leader',
  pending: 'Awaiting approval',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  head_pastor: 'Full control of every branch, user, message and setting.',
  associate_pastor: 'Full control of every branch. Cannot change the Head Pastor.',
  branch_pastor: 'Runs one branch: members, attendance, tithes, giving, cells, SMS and reviews department reports.',
  secretary: 'One branch: members, attendance, cells, sign-ups and SMS. No money.',
  finance: 'One branch: tithes and giving.',
  usher: 'One branch: takes attendance.',
  dept_leader: 'Registers members into their department(s), runs its cells, and submits monthly reports, budgets and plans.',
  cell_leader: 'Submits meeting reports for their cell(s) and adds new contacts.',
  pending: 'Signed up but not yet given access.',
};

export const GLOBAL_ROLES: Role[] = ['head_pastor', 'associate_pastor'];

export type Capability =
  | 'members.read'
  | 'members.write'      // full member management for the branch
  | 'members.add'        // may add members (dept heads: into their department)
  | 'attendance.write'
  | 'giving.read'
  | 'giving.write'
  | 'registrations.manage'
  | 'cells.view'
  | 'cells.manage'
  | 'reports.view'
  | 'reports.review'
  | 'sms.send'
  | 'sms.settings'
  | 'branches.manage'
  | 'departments.view'
  | 'departments.manage'
  | 'users.manage'
  | 'data.manage';

const ALL_CAPS: Capability[] = [
  'members.read', 'members.write', 'members.add', 'attendance.write', 'giving.read', 'giving.write',
  'registrations.manage', 'cells.view', 'cells.manage', 'reports.view', 'reports.review', 'sms.send',
  'sms.settings', 'branches.manage', 'departments.view', 'departments.manage', 'users.manage', 'data.manage',
];

// NOTE: keep in sync with firestore.rules
const MATRIX: Record<Role, Capability[]> = {
  head_pastor: ALL_CAPS,
  associate_pastor: ALL_CAPS,
  branch_pastor: [
    'members.read', 'members.write', 'members.add', 'attendance.write', 'giving.read', 'giving.write',
    'registrations.manage', 'cells.view', 'cells.manage', 'reports.view', 'reports.review', 'sms.send', 'departments.view',
  ],
  secretary: ['members.read', 'members.write', 'members.add', 'attendance.write', 'registrations.manage', 'cells.view', 'cells.manage', 'sms.send', 'departments.view'],
  finance: ['members.read', 'giving.read', 'giving.write'],
  usher: ['members.read', 'attendance.write'],
  dept_leader: ['members.read', 'members.add', 'cells.view', 'cells.manage', 'reports.view', 'departments.view'],
  cell_leader: ['members.read', 'cells.view'],
  pending: [],
};

export function can(role: Role | undefined, cap: Capability): boolean {
  return !!role && MATRIX[role].includes(cap);
}

export function isGlobal(role: Role | undefined): boolean {
  return !!role && GLOBAL_ROLES.includes(role);
}

export const ASSIGNABLE_ROLES: Role[] = [
  'head_pastor', 'associate_pastor', 'branch_pastor', 'secretary', 'finance', 'usher', 'dept_leader', 'cell_leader', 'pending',
];
