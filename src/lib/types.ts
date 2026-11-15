import type { Area, PrayerLevel, Role } from './roles';

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
  /** Areas the Super Admin has switched off for this person. */
  revoked?: Area[];
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
  /** 'online' = members who live abroad / travel, connected through an online group. */
  kind?: 'physical' | 'online';
  groupLink?: string;
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
  /** Golden Heart (single) / Diamond Heart (married): members are added automatically. */
  autoRule?: 'single' | 'married' | null;
  /** 'charity' marks the Charity Foundation, which gets its own module. */
  kind?: 'charity' | null;
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
  /** Not expected to pay monthly welfare dues. */
  welfareExempt?: boolean;
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
  | 'tithe' | 'offering' | 'thanksgiving' | 'seed' | 'building' | 'missions' | 'welfare' | 'pledge' | 'project' | 'other';
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
  /** For type 'project': which project the money is for. */
  projectId?: string | null;
  /** For type 'welfare': the month(s) the dues cover, YYYY-MM. */
  forMonths?: string[];
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
  /** Cells stand on their own; kept only for cells created by older versions. */
  departmentId?: string;
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
  departmentId?: string;
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

export type AudienceType = 'all' | 'branch' | 'department' | 'cell' | 'category' | 'absentees' | 'custom' | 'members' | 'welfare_defaulters';

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

export interface PrayerRequest {
  id: string;
  kind: 'prayer' | 'testimony';
  name: string;
  phone: string;
  phoneKey: string;
  branchId: string;
  toLevel: PrayerLevel;
  departmentId: string;
  cellId: string;
  text: string;
  mediaPath: string;
  mediaType: '' | 'audio' | 'video';
  confidential: boolean;
  status: 'new' | 'praying' | 'answered';
  answerNote: string;
  memberId: string;
  createdAt?: { toDate(): Date } | null;
}

export interface Milestone { title: string; done: boolean; doneOn: string }
export interface ProgressUpdate { date: string; text: string; percent: number }

export interface Project {
  id: string;
  title: string;
  description: string;
  goal: number;
  raised: number;
  donors: number;
  progress: number; // % of the physical work done
  milestones: Milestone[];
  updates: ProgressUpdate[];
  status: 'active' | 'completed' | 'paused';
  public: boolean;
  startDate: string;
  targetDate: string;
}

export type CharityType = 'beneficiary' | 'aid' | 'support' | 'outreach';
export interface CharityEntry {
  id: string;
  type: CharityType;
  date: string;
  // beneficiary
  name: string;
  phone: string;
  need: string;
  category: string;
  status: 'waiting' | 'helped' | 'closed';
  // aid given / support received
  beneficiaryId: string;
  form: 'cash' | 'items';
  amount: number;
  items: string;
  donor: string;
  // outreach
  place: string;
  peopleReached: number;
  notes: string;
}

export type Assessment = 'good' | 'fair' | 'needs_improvement';
export interface PastorNote {
  id: string;
  memberId: string;
  memberName: string;
  area: string;
  rating: Assessment | null;
  note: string;
  remindOn: string; // YYYY-MM-DD or ''
  done: boolean;
  createdAt?: { toDate(): Date } | null;
}

export interface PaymentSettings {
  momoNumber: string;
  momoName: string;
  momoNetwork: string;
  paymentLink: string;
  bankDetails: string;
  publicSiteUrl: string;
}

export interface WelfareSettings {
  amount: number;
  startMonth: string; // YYYY-MM
  remindEnabled: boolean;
  remindDay: number; // day of month
  template: string;
}
