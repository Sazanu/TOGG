import type { Role } from './roles';

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  phone?: string;
  role: Role;
  /** Branch the user is limited to. null for head / associate pastor (all branches). */
  branchId: string | null;
  /** Departments a department head looks after. */
  departmentIds: string[];
  /** Cells a cell leader looks after. */
  cellIds?: string[];
  active: boolean;
  createdAt?: unknown;
}

export interface Branch {
  id: string;
  name: string;
  location: string;
  pastorName: string;
  phone: string;
  isHQ: boolean;
}

export interface Department {
  id: string;
  name: string;
  description: string;
  /** null = main department; otherwise the id of its parent department. */
  parentId: string | null;
  headName: string;
  headPhone: string;
  assistantName: string;
}

export type MemberCategory = 'adult' | 'teen' | 'child';
export type MemberStatus = 'active' | 'inactive' | 'visitor';

export interface Member {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  gender: 'male' | 'female' | '';
  dob: string; // YYYY-MM-DD
  category: MemberCategory;
  status: MemberStatus;
  branchId: string;
  departmentIds: string[];
  address: string;
  occupation: string;
  maritalStatus: string;
  joinedAt: string; // YYYY-MM-DD
  notes: string;
  membershipNo?: string;
  cellId?: string | null;
  /** How they came in: manual, import, registration, cell, checkin */
  source?: string;
}

export interface Service {
  id: string;
  branchId: string;
  date: string; // YYYY-MM-DD
  type: string;
  title: string;
  count: number; // members checked in
  visitors: number; // head-count of visitors not in the system
}

export interface CheckIn {
  id: string; // = memberId
  memberId: string;
  name: string;
  category: MemberCategory;
  at: { toDate(): Date } | null;
}

export type GivingType =
  | 'tithe' | 'offering' | 'thanksgiving' | 'seed' | 'building' | 'missions' | 'welfare' | 'pledge' | 'other';
export type PaymentMethod = 'cash' | 'momo' | 'bank' | 'cheque' | 'card';

export interface Gift {
  id: string;
  branchId: string;
  date: string; // YYYY-MM-DD
  amount: number;
  type: GivingType;
  method: PaymentMethod;
  memberId: string | null;
  memberName: string;
  reference: string;
  note: string;
}

export interface Registration {
  id: string;
  kind: 'member' | 'visitor';
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  gender: string;
  category: MemberCategory;
  branchId: string;
  invitedBy: string;
  prayerRequest: string;
  status: 'new' | 'done';
  createdAt?: { toDate(): Date } | null;
}

export interface Cell {
  id: string;
  name: string;
  branchId: string;
  departmentId: string;
  leaderName: string;
  leaderPhone: string;
  location: string;
  meetingDay: string;
  meetingTime: string;
  active: boolean;
}

export interface NewContact { name: string; phone: string; addedAsMember?: boolean }

export interface CellReport {
  id: string;
  cellId: string;
  branchId: string;
  departmentId: string;
  date: string;
  topic: string;
  membersPresent: number;
  firstTimers: number;
  newConverts: number;
  offering: number;
  testimonies: string;
  challenges: string;
  newContacts: NewContact[];
  submittedByName: string;
}

export type DeptReportType = 'report' | 'budget' | 'plan';
export type DeptReportStatus = 'draft' | 'submitted' | 'approved' | 'returned';

export interface BudgetLine { item: string; amount: number }
export interface PlannedActivity { date: string; title: string; details: string; cost: number }

export interface DeptReport {
  id: string;
  departmentId: string;
  branchId: string;
  month: string; // YYYY-MM
  type: DeptReportType;
  status: DeptReportStatus;
  // monthly report
  summary: string;
  achievements: string;
  challenges: string;
  membersActive: number;
  newMembers: number;
  recommendations: string;
  // budget
  lines: BudgetLine[];
  // plan
  activities: PlannedActivity[];
  submittedByName: string;
  reviewComment: string;
  reviewedByName: string;
  updatedAt?: { toDate(): Date } | null;
}

export type AudienceType = 'all' | 'branch' | 'department' | 'cell' | 'category' | 'absentees' | 'custom';

export interface Audience {
  type: AudienceType;
  branchId?: string | null;
  departmentId?: string;
  cellId?: string;
  category?: MemberCategory;
  serviceId?: string;
  phones?: string[];
  includeVisitors?: boolean;
}

export interface SmsMessage {
  id: string;
  branchId: string | null;
  message: string;
  audience: Audience;
  kind: 'instant' | 'scheduled' | 'automated';
  label: string;
  status: 'queued' | 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled';
  sendAt?: { toDate(): Date; toMillis(): number } | null;
  recipientsCount?: number;
  sentCount?: number;
  failedCount?: number;
  error?: string;
  createdByName?: string;
  createdAt?: { toDate(): Date } | null;
}

export interface Programme {
  id: string;
  branchId: string | null;
  title: string;
  link: string;
  message: string;
  days: number[]; // 0 = Sunday
  time: string; // HH:MM, Ghana time
  remindMinutesBefore: number;
  audience: Audience;
  active: boolean;
  lastSentOn?: string;
}

export interface SmsSettings {
  provider: 'arkesel' | 'hubtel' | 'mnotify' | 'log';
  senderId: string;
  absenteeEnabled: boolean;
  absenteeTemplate: string;
  absenteeServiceTypes: string[];
  absenteeHour: number; // 0-23, Ghana time, day of the service
  birthdayEnabled: boolean;
  birthdayTemplate: string;
  churchName: string;
}
