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
  secretary: 'Branch Administrator',
  finance: 'Finance',
  usher: 'Usher',
  dept_leader: 'Department Head',
  cell_leader: 'Cell Leader',
  pending: 'Awaiting approval',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  head_pastor: 'Full control of every branch, user, message and setting. Private pastoral notes.',
  associate_pastor: 'Full control of every branch. Cannot change the Head Pastor.',
  branch_pastor: 'Everything for ONE branch: members, attendance, money, cells, prayer, SMS; reviews department reports.',
  secretary: 'Administers ONE branch: members, sign-ups, attendance, cells, prayer requests and SMS. No money.',
  finance: 'Money only, for ONE branch: tithes, giving, welfare and projects.',
  usher: 'Attendance only, for ONE branch.',
  dept_leader: 'Only the members of their department(s): registers them and submits monthly reports, budgets and plans.',
  cell_leader: 'Only their cell: members, meeting reports and new contacts.',
  pending: 'Signed up but not yet given access.',
};

export const GLOBAL_ROLES: Role[] = ['head_pastor', 'associate_pastor'];

/** Areas of the system the Super Admin can switch off for an individual user. Keep in sync with firestore.rules. */
export type Area = 'members' | 'attendance' | 'finance' | 'departments' | 'cells' | 'prayer' | 'sms' | 'charity';

export const AREA_LABELS: Record<Area, string> = {
  members: 'Members & sign-ups',
  attendance: 'Attendance',
  finance: 'Money (tithes, giving, welfare, projects)',
  departments: 'Departments & reports',
  cells: 'Cells',
  prayer: 'Prayer requests & testimonies',
  sms: 'SMS messages',
  charity: 'Charity foundation',
};

export type Capability =
  | 'members.read'        // look people up (needed by finance & ushers)
  | 'members.list'        // the Members page itself
  | 'members.write'
  | 'members.add'
  | 'attendance.write'
  | 'giving.read'
  | 'giving.write'
  | 'projects.manage'
  | 'registrations.manage'
  | 'cells.view'
  | 'cells.manage'
  | 'reports.view'
  | 'reports.review'
  | 'prayer.view'
  | 'sms.send'
  | 'sms.settings'
  | 'branches.manage'
  | 'departments.view'
  | 'departments.manage'
  | 'users.manage'
  | 'data.manage'
  | 'pastoral.notes';

const AREA_OF: Partial<Record<Capability, Area>> = {
  'members.read': 'members', 'members.list': 'members', 'members.write': 'members', 'members.add': 'members', 'registrations.manage': 'members',
  'attendance.write': 'attendance',
  'giving.read': 'finance', 'giving.write': 'finance', 'projects.manage': 'finance',
  'cells.view': 'cells', 'cells.manage': 'cells',
  'reports.view': 'departments', 'reports.review': 'departments', 'departments.view': 'departments',
  'prayer.view': 'prayer',
  'sms.send': 'sms',
};

const ALL_CAPS: Capability[] = [
  'members.read', 'members.list', 'members.write', 'members.add', 'attendance.write', 'giving.read', 'giving.write', 'projects.manage',
  'registrations.manage', 'cells.view', 'cells.manage', 'reports.view', 'reports.review', 'prayer.view', 'sms.send',
  'sms.settings', 'branches.manage', 'departments.view', 'departments.manage', 'users.manage', 'data.manage',
];

// NOTE: keep in sync with firestore.rules
const MATRIX: Record<Role, Capability[]> = {
  head_pastor: [...ALL_CAPS, 'pastoral.notes'],
  associate_pastor: ALL_CAPS,
  branch_pastor: [
    'members.read', 'members.list', 'members.write', 'members.add', 'attendance.write', 'giving.read', 'giving.write',
    'registrations.manage', 'cells.view', 'cells.manage', 'reports.view', 'reports.review', 'prayer.view', 'sms.send', 'departments.view',
  ],
  secretary: ['members.read', 'members.list', 'members.write', 'members.add', 'attendance.write', 'registrations.manage', 'cells.view', 'cells.manage', 'prayer.view', 'sms.send', 'departments.view'],
  finance: ['members.read', 'giving.read', 'giving.write'],
  usher: ['members.read', 'attendance.write'],
  dept_leader: ['members.read', 'members.list', 'members.add', 'reports.view', 'departments.view', 'prayer.view'],
  cell_leader: ['members.read', 'cells.view', 'prayer.view'],
  pending: [],
};

/** Which areas each role has at all (what the Super Admin can switch off). */
export function areasForRole(role: Role): Area[] {
  const set = new Set<Area>();
  MATRIX[role].forEach((c) => { const a = AREA_OF[c]; if (a) set.add(a); });
  if (GLOBAL_ROLES.includes(role) || role === 'dept_leader') set.add('charity');
  return [...set];
}

// Areas switched off for the signed-in user (set by AuthContext from their profile).
let revoked = new Set<string>();
// Extra access from what the person LEADS (departments / cells), whatever their main role is.
// One person can be a pastor, a department head and a cell leader at the same time.
let extras = new Set<Capability>();
const DEPT_CAPS: Capability[] = ['members.read', 'members.list', 'members.add', 'reports.view', 'departments.view', 'prayer.view'];
const CELL_CAPS: Capability[] = ['members.read', 'cells.view', 'prayer.view'];
/** Areas that can be GIVEN to a person on top of their role (their own branch). Keep in sync with granted() in firestore.rules. */
export const GRANTABLE: Area[] = ['members', 'attendance', 'finance', 'cells', 'sms'];
const GRANT_CAPS: Partial<Record<Area, Capability[]>> = {
  members: ['members.read', 'members.list', 'members.write', 'members.add', 'registrations.manage'],
  attendance: ['members.read', 'attendance.write'],
  finance: ['members.read', 'giving.read', 'giving.write'],
  cells: ['members.read', 'cells.view', 'cells.manage'],
  sms: ['sms.send'],
};
export function setUserExtras(p: { departmentIds?: string[]; cellIds?: string[]; granted?: string[] } | null) {
  extras = new Set<Capability>([
    ...((p?.departmentIds?.length ?? 0) > 0 ? DEPT_CAPS : []), ...((p?.cellIds?.length ?? 0) > 0 ? CELL_CAPS : []),
    ...(p?.granted ?? []).flatMap((a) => GRANT_CAPS[a as Area] ?? []),
  ]);
}
/** Roles that already see a whole branch. */
export const BRANCH_WIDE: Role[] = ['branch_pastor', 'secretary', 'finance', 'usher'];
export function setRevokedAreas(list: string[] | undefined) { revoked = new Set(list ?? []); }
export function areaAllowed(role: Role | undefined, area: Area): boolean {
  return role === 'head_pastor' || !revoked.has(area);
}

export function can(role: Role | undefined, cap: Capability): boolean {
  if (!role || role === 'pending') return false;
  if (!MATRIX[role].includes(cap) && !extras.has(cap)) return false;
  const area = AREA_OF[cap];
  return !area || areaAllowed(role, area);
}

export function isGlobal(role: Role | undefined): boolean {
  return !!role && GLOBAL_ROLES.includes(role);
}

export const ASSIGNABLE_ROLES: Role[] = [
  'head_pastor', 'associate_pastor', 'branch_pastor', 'secretary', 'finance', 'usher', 'dept_leader', 'cell_leader', 'pending',
];

/** Prayer requests are addressed up the church hierarchy. */
export const PRAYER_LEVELS = [
  { value: 'cell_leader', label: 'My cell leader' },
  { value: 'dept_leader', label: 'My department head' },
  { value: 'branch_pastor', label: 'My branch pastor' },
  { value: 'associate_pastor', label: 'The Associate Pastor' },
  { value: 'head_pastor', label: 'The Head Pastor (private)' },
] as const;
export type PrayerLevel = (typeof PRAYER_LEVELS)[number]['value'];
